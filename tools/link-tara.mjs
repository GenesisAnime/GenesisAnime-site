/**
 * link-tara.mjs — 317 bin bağlantı için partili, kesintiye dayanıklı link sağlığı tarayıcısı
 * =========================================================================================
 * Ne yapar?
 *   Arşivdeki her tekil kaynak URL'sini, HTTP katmanında kanıt toplayarak yoklar ve
 *   kesin bir karara varır:  ok | olu | engelli   (karar verilemezse: belirsiz)
 *
 * Neden gerçek tarayıcı değil?
 *   Arşivdeki 317.146 kaynağın %82'si sibnet + mail.ru + ok.ru üçlüsünde. Kalibrasyon
 *   ölçümleri (docs/09) bu üçünün de HTTP katmanında güvenilir biçimde ayrıldığını
 *   gösterdi; ayrıca gerçek tarayıcı 317 bin kaynak için ~3 hafta demek. Tarayıcı katmanı
 *   yalnızca "belirsiz" kalanlar için bir sonraki faz olarak planlandı (ADR-0007).
 *
 * Kanıt politikası (yanlış ölüm üretmemek için):
 *   - HTTP 404/410                    → olu
 *   - alan adı çözümlenemiyor         → olu   (2 deneme sonrası)
 *   - hosta özgü "dosya silindi" imzası → olu
 *   - hosta özgü "oynatıcı var" imzası  → ok
 *   - HTTP 403/429, bot duvarı, 5xx, zaman aşımı, JS kabuğu → belirsiz  (GİZLENMEZ)
 *   Yani "ölü" demek için her zaman somut kanıt aranır; şüphede kalınan her durum
 *   `belirsiz` olur ve site DEĞİŞMEZ (ADR-0003).
 *
 * Kesintiye dayanıklılık:
 *   Her sonuç yazıldığı anda tools/cache/link-durum.jsonl'e eklenir (append-only).
 *   Koşu yarıda kesilse (Ctrl+C, elektrik, süre sınırı) kaldığı yerden devam eder;
 *   `npm run link:tara -- --dilim=5000` çağrısı zaten taranmışları atlar.
 *
 * Kullanım:
 *   npm run link:durum                          kapsam raporu (tarama yapmaz)
 *   npm run link:tara -- --dilim=2000           sıradaki 2000 URL'yi tara
 *   npm run link:tara -- --host=my.mail.ru      yalnızca bir host
 *   npm run link:tara -- --kuru                 plan yapar, istek atmaz
 *   npm run link:tara -- --kendini-test         canlı kalibrasyon testleri (12 URL)
 *   npm run link:rapor                          durum dosyasından rapor üretir
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { YOLLAR, DURUM, hostAl, saglikOku, yazJson, okuJson, log, baslik } from './lib/ortak.mjs';

const BASLA = Date.now();
const SIMDI = () => Date.now();

/**
 * Bu dosya iki şekilde kullanılır:
 *   1. doğrudan çalıştırılır (`node tools/link-tara.mjs …`) → CLI akışı koşar
 *   2. testler tarafından içe alınır (`tools/testler/*.test.mjs`) → yalnızca
 *      aşağıda `export` edilen saf fonksiyonlar kullanılır; ağa/DB'ye dokunulmaz
 * Ayırt etme ölçütü: node'un çalıştırdığı betik bu modülün kendisi mi?
 */
const DOGRUDAN = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;

/* ================================================================ */
/* 0 · Ayarlar                                                       */
/* ================================================================ */

const AYAR = {
  dilim: 2000,
  es: 16,
  hostEs: 3,
  hostAralik: 250,
  zamanAsimi: 15000,
  sure: 20 * 60_000,
  yenile: 6, // saat: belirsiz kayıtlar bu süre sonra yeniden denenir
  gecerlilik: 30, // gün: kesin sonuçlar bu süre boyunca geçerli sayılır
  soguma: 20 * 60_000, // ms: engel yediğinde hostun dinlenme süresi
  dalgalar: [1, 2, 3, 4],
  hostlar: null,
  haricHostlar: null,
  kuru: false,
  zorla: false,
  durumFiltre: null,
  sicilDenetim: false,
  sikistir: false,
  rapor: false,
  durumRaporu: false,
  kendiniTest: false,
  bildirim: false,
  sessiz: false,
};

const SAYISAL = { dilim: 'dilim', es: 'es', 'host-es': 'hostEs', 'host-aralik': 'hostAralik', 'zaman-asimi': 'zamanAsimi', 'sure-dk': 'sureDk', yenile: 'yenile', gecerlilik: 'gecerlilik' };

function yardim() {
  console.log(`
link-tara.mjs — eşzamanlı, partili, kesintiye dayanıklı link sağlığı tarayıcısı

  --dilim=N          bu koşuda en fazla N URL tara            (varsayılan ${AYAR.dilim})
  --es=N             genel eşzamanlılık                       (varsayılan ${AYAR.es})
  --host-es=N        host başına eşzamanlılık                 (varsayılan ${AYAR.hostEs})
  --host-aralik=MS   host başına iki istek arası en az süre   (varsayılan ${AYAR.hostAralik})
  --zaman-asimi=MS   istek zaman aşımı                        (varsayılan ${AYAR.zamanAsimi})
  --sure-dk=DK       koşu için üst süre sınırı (dakika)       (varsayılan ${AYAR.sure / 60000})
  --yenile=SAAT      "belirsiz" kayıtları bu süre sonra yeniden dene (varsayılan ${AYAR.yenile})
  --gecerlilik=GUN   kesin sonuçların geçerlilik süresi       (varsayılan ${AYAR.gecerlilik})
  --dalga=1,2,3,4    taranacak öncelik dalgaları
                       1 = eski araçta ölü/engelli görünenler (sitede gizli; en değerli)
                       2 = eski "çalışıyor" kayıtların tazelenmesi (>30 gün)
                       3 = hiç kontrol edilmemiş popüler yapımlar
                       4 = hiç kontrol edilmemiş kalanlar
  --host=H,H2        yalnızca bu host(lar) taranır
  --haric-host=H     bu host(lar) atlanır
  --durum-filtre=D   yalnızca kendi kaydı bu durumda olan URL'ler (ör. olu,engelli)
                     bir karar kuralı düzeltildiğinde yalnızca etkilenenleri yeniden tarar
  --sicil-denetim[=HOST]  eski taramanın oran sınırı artefaktlarını bulur ve "belirsiz"
                     işaretler (varsayılan host: video.sibnet.ru; --kuru ile yalnız rapor)
  --bildirim         kullanıcı bildirimlerini (tools/cache/bildirim.jsonl) kuyruğun önüne alır
  --kuru             planı gösterir, istek atmaz
  --zorla            tazelik/soğuma denetimlerini yok sayar
  --rapor            koşu sonunda rapor üretir
  --durum            yalnızca kapsam raporu yazar, tarama yapmaz
  --kendini-test     sınıflandırıcıyı canlı URL'lerle sınar
  --sikistir         durum dosyasını sıkıştırır (URL başına son kayıt kalır)
`);
}

for (const arg of DOGRUDAN ? process.argv.slice(2) : []) {
  const [anahtar, deger] = arg.replace(/^--/, '').split('=');
  switch (anahtar) {
    case 'yardim':
    case 'help':
      yardim();
      process.exit(0);
    case 'kuru':
      AYAR.kuru = true;
      break;
    case 'zorla':
      AYAR.zorla = true;
      break;
    case 'rapor':
      AYAR.rapor = true;
      break;
    case 'durum':
      AYAR.durumRaporu = true;
      break;
    case 'kendini-test':
      AYAR.kendiniTest = true;
      break;
    case 'bildirim':
      AYAR.bildirim = true;
      break;
    case 'sicil-denetim':
      AYAR.sicilDenetim = deger || true;
      break;
    case 'sikistir':
      AYAR.sikistir = true;
      break;
    case 'dinle':
      AYAR.dinle = true;
      break;
    case 'host':
      AYAR.hostlar = deger.split(',').map((s) => s.trim()).filter(Boolean);
      break;
    case 'haric-host':
      AYAR.haricHostlar = deger.split(',').map((s) => s.trim()).filter(Boolean);
      break;
    case 'durum-filtre':
      AYAR.durumFiltre = deger.split(',').map((s) => s.trim()).filter(Boolean);
      break;
    case 'dalga':
      AYAR.dalgalar = deger.split(',').map(Number).filter((n) => n >= 1 && n <= 4);
      break;
    case 'sure-dk':
      AYAR.sure = Number(deger) * 60_000;
      break;
    default:
      if (SAYISAL[anahtar] && SAYISAL[anahtar] !== 'sureDk') AYAR[SAYISAL[anahtar]] = Number(deger);
      else if (anahtar.startsWith('dalga') || anahtar.startsWith('host') || anahtar.startsWith('kuru')) break;
      else if (anahtar) console.log(`   [i] bilinmeyen bayrak yok sayıldı: --${anahtar}=${deger ?? ''}`);
  }
}

/* ================================================================ */
/* 1 · Yardımcılar                                                   */
/* ================================================================ */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const ok = (sebep) => ({ durum: DURUM.OK, sebep });
export const olu = (sebep) => ({ durum: DURUM.OLU, sebep });
export const engelli = (sebep) => ({ durum: DURUM.ENGELLI, sebep });
export const belirsiz = (sebep) => ({ durum: DURUM.BELIRSIZ, sebep });

/** Yerel saat formatı (arşivdeki kayıtlarla aynı biçim: GG.AA.YYYY SS:DD:SS) */
export function zamanMetni(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function zamanOku(metin) {
  if (!metin) return null;
  // ÖNEMLİ (H-14): KENDİ yazdığımız yerel biçim (GG.AA.YYYY SS:DD:SS) ÖNCE denenir.
  // `Date.parse("01.10.2026 14:23:45")` bu biçimi ay/gün karıştırarak "10 Ocak 2026"
  // diye okuyor; 1 Ekim'de yazılan her kayıt "30 günden eski" sayılıp yeniden taranıyordu
  // (ölçüm: ikinci 14.000'lik dilimin ~13.650'si tekrar taranmış, kapsam %15,12 → %15,23).
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(metin);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime();
  const iso = Date.parse(metin);
  return Number.isNaN(iso) ? null : iso;
}

/** Gövdeyi charset'e göre çözer (sibnet windows-1251, bazıları latin5). */
function govdeCoz(buf, contentType) {
  const cs = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1]?.toLowerCase();
  const dene = ['utf-8'];
  if (cs && !/utf-?8/.test(cs)) dene.push(cs);
  dene.push('windows-1251', 'iso-8859-9');
  for (const kod of dene) {
    try {
      return new TextDecoder(kod).decode(buf);
    } catch {
      /* sıradaki */
    }
  }
  return buf.toString('latin1');
}

/* ================================================================ */
/* 2 · Hedef belirleme: bazı host'larda kararı veren uç nokta farklı */
/* ================================================================ */

/**
 * Arşiv URL'sini "kanıt üreten istek"e çevirir.
 * Örnek: mail.ru embed sayfası kararı veremiyor; ama aynı videonun
 * meta ucu JSON döndürüyor ve ölü videoda 404 veriyor.
 */
export function hedefBelirle(url, host) {
  // href.li bir yönlendirme sarmalı: gerçek hedefi kendimiz açarız
  if (host === 'href.li') {
    const m = /^https?:\/\/href\.li\/\?(.+)$/i.exec(url);
    if (m) return { hedef: m[1], not: 'href.li sarmalı açıldı' };
    return { hedef: url, not: '' };
  }
  // MAIL: iki ayrı URL biçimi var, ikisi de JSON uçlarıyla kesin sonuç veriyor.
  //   a) my.mail.ru/video/embed/<sayı>          → my.mail.ru/+/video/meta/<sayı>
  //   b) my.mail.ru/<yol>/video/embed/<kalan>   → videoapi.my.mail.ru/videos/<yol>/<kalan>.json
  //      (mail/bcykn, inbox/kreyiz, gmail.com/anisekai101 gibi yol biçimleri)
  if (host === 'my.mail.ru') {
    const id = /\/video\/embed\/(\d+)$/.exec(url)?.[1];
    if (id) return { hedef: `https://my.mail.ru/+/video/meta/${id}`, json: true, not: 'meta ucu' };
    const yol = url.replace(/^https?:\/\/[^/]+\//, '');
    if (/\/video\/(embed\/)?/.test(yol)) {
      const jsonYol = yol.replace('/video/embed/', '/').replace('/video/', '/');
      return { hedef: `https://videoapi.my.mail.ru/videos/${jsonYol}.json`, json: true, not: 'video JSON ucu (yol biçimi)' };
    }
  }
  // MAIL (yol tabanlı): videoapi.my.mail.ru/videos/embed/<yol>.html → /videos/<yol>.json
  if (host === 'videoapi.my.mail.ru') {
    const m = /^https?:\/\/videoapi\.my\.mail\.ru\/videos\/embed\/(.+)\.html$/i.exec(url);
    if (m) return { hedef: `https://videoapi.my.mail.ru/videos/${m[1]}.json`, json: true, not: 'video JSON ucu' };
  }
  // Yandex Disk: herkese açık kaynak API'si
  if (host === 'yadi.sk' || host === 'disk.yandex.com.tr' || host === 'disk.yandex.com') {
    return { hedef: `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(url)}`, json: true, not: 'Yandex Disk genel API' };
  }
  // turkanime.tv köprüsüyle verilen pixeldrain kimliği
  if (host === 'turkanime.tv') {
    const id = /pixeldrain\.php\?id=([\w-]+)/.exec(url)?.[1];
    if (id) return { hedef: `https://pixeldrain.com/api/file/${id}/info`, json: true, not: 'pixeldrain API' };
  }
  // Dailymotion: gömme sayfası geo engelli (403); oEmbed JSON'u kararı veriyor
  if (host === 'dailymotion.com') {
    const id = /\/video\/([a-zA-Z0-9]+)/.exec(url)?.[1];
    if (id) return { hedef: `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(`https://www.dailymotion.com/video/${id}`)}&format=json`, json: true, not: 'oEmbed API' };
  }
  return { hedef: url, not: '' };
}

/* ================================================================ */
/* 3 · Sınıflandırıcılar                                            */
/* ================================================================ */

const OYNATICI_ISARET = /(<video\b|playerjs|jwplayer|videojs|video\.js|\.m3u8|file\s*:\s*["']|sources?\s*:\s*\[|<iframe[^>]+src=|fileid)/i;
const YOK_ISARET = /(file was deleted|file not found|video not found|no longer available|has been removed|does not exist|not been found|sayfa bulunamadı|video bulunamadı|не найден|недоступн|удален)/i;
const BOT_ISARET = /(request forbidden by administrative rules|just a moment|attention required|cf-error|ddos-guard|checking your browser|access denied|captcha)/i;

/** Host'a özgü karar kuralları. Yeni bir kural eklerken kalibrasyon ölçümünü belgeleyin. */
export const KURALLAR = [
  {
    ad: 'sibnet',
    hostlar: ['video.sibnet.ru'],
    fn(b) {
      if (b.kod === 200) {
        if (/file\s*:\s*["']/i.test(b.govde)) return ok('oynatıcı kaynağı sayfada (file: işareti)');
        if (YOK_ISARET.test(b.govde)) return olu('sibnet: video bulunamadı');
        return belirsiz('sibnet sayfası oynatıcı işareti içermiyor');
      }
      if (b.kod === 403 || b.kod === 429) {
        return { durum: DURUM.BELIRSIZ, sebep: `sibnet oran sınırı (HTTP ${b.kod})`, botDuvarı: true };
      }
      return null; // genel kurallara bırak
    },
  },
  {
    ad: 'mail-meta',
    hostlar: ['my.mail.ru'],
    fn(b) {
      if (b.json && b.kod === 200) {
        if (/"meta"\s*:/.test(b.govde) || /"provider"\s*:/.test(b.govde)) return ok('mail.ru video meta verisi alındı');
        if (/video_not_found|not found/i.test(b.govde)) return olu('mail.ru: video bulunamadı');
        return belirsiz('mail.ru meta yanıtı beklenen alanları içermiyor');
      }
      if (b.kod === 404) return olu('mail.ru: video bulunamadı (404)');
      return null;
    },
  },
  {
    ad: 'mail-videoapi',
    hostlar: ['videoapi.my.mail.ru'],
    fn(b) {
      if (b.json && b.kod === 200) {
        if (/"meta"\s*:|"provider"\s*:/.test(b.govde)) return ok('mail.ru video verisi alındı');
        if (/not found/i.test(b.govde)) return olu('mail.ru: video bulunamadı');
        return belirsiz('mail.ru yanıtı beklenen alanları içermiyor');
      }
      if (b.kod === 404) return olu('mail.ru: video bulunamadı (404)');
      return null;
    },
  },
  {
    ad: 'okru',
    hostlar: ['odnoklassniki.ru', 'ok.ru'],
    fn(b) {
      if (b.kod === 200) {
        if (/vp_video_stub_txt/.test(b.govde)) {
          const m = /<div class="vp_video_stub_txt">([^<]{0,90})/.exec(b.govde)?.[1]?.trim() || '';
          // ok.ru iki ayrı stub metni kullanıyor: silinmiş video ile erişimi kısıtlanmış
          // (bölgesel/kısıtlı) video. İkisi de oynatılamaz ama sebebi ayrı yazılır.
          if (/(kısıtlan|restricted|ограничен|заблокирован)/i.test(m)) return engelli(`ok.ru: erişim kısıtlı${m ? ` (${m})` : ''}`);
          return olu(`ok.ru: video yok${m ? ` (${m})` : ''}`);
        }
        if (/\.m3u8|OK\.VideoPlayer|videoembed/i.test(b.govde)) return ok('ok.ru oynatıcısı yüklendi');
        return belirsiz('ok.ru sayfası oynatıcı işareti içermiyor');
      }
      if (b.kod === 404 || b.kod === 410) return olu(`ok.ru: HTTP ${b.kod}`);
      return null;
    },
  },
  {
    ad: 'gdrive',
    hostlar: ['drive.google.com', 'docs.google.com'],
    fn(b) {
      if (b.kod === 404 || b.kod === 410) return olu('Drive dosyası yok (silinmiş veya erişilemez)');
      if (b.kod === 200) {
        const baslik = /<title>([^<]{0,150})<\/title>/i.exec(b.govde)?.[1]?.trim() || '';
        if (baslik && !/(sayfa bulunamadı|page not found|bulunamadı)/i.test(baslik)) {
          const ad = baslik.replace(/\s*-\s*Google Drive\s*$/i, '').slice(0, 60);
          return ok(`Drive dosyası mevcut${ad ? ` (${ad})` : ''}`);
        }
        return belirsiz('Drive önizleme sayfası dosya adı vermedi (erişim kısıtlı olabilir)');
      }
      return null;
    },
  },
  {
    ad: 'uqload',
    hostlar: ['uqload.com', 'uqload.co', 'uqload.vc', 'uqload.io', 'uqload.to'],
    fn(b) {
      if (b.kod === 404) return olu('uqload: dosya yok');
      if (b.kod === 200) {
        if (/is no longer available|expired or has been deleted/i.test(b.govde)) return olu('uqload: dosya silinmiş/süresi geçmiş');
        if (OYNATICI_ISARET.test(b.govde)) return ok('uqload oynatıcısı bulundu');
        return belirsiz('uqload sayfası oynatıcı içermiyor');
      }
      return null;
    },
  },
  {
    ad: 'mp4upload',
    hostlar: ['mp4upload.com', 'www.mp4upload.com'],
    fn(b) {
      if (/File was deleted/i.test(b.govde)) return olu('mp4upload: dosya silinmiş');
      if (b.kod === 200 && OYNATICI_ISARET.test(b.govde)) return ok('mp4upload oynatıcısı bulundu');
      if (b.kod === 404) return olu('mp4upload: HTTP 404');
      return null;
    },
  },
  {
    ad: 'voe',
    hostlar: ['voe.sx', 'voe.to'],
    fn(b) {
      if (b.kod === 404 || b.kod === 410) return olu('voe: video bulunamadı');
      if (b.kod === 200 && (/(ddos-guard|checking your browser|just a moment)/i.test(b.govde) || /ddos-guard/i.test(b.sunucu || ''))) {
        return belirsiz('voe DDoS koruması: içerik JS ile geldiği için HTTP kanıtı yok');
      }
      return null;
    },
  },
  {
    ad: 'dailymotion',
    hostlar: ['dailymotion.com', 'www.dailymotion.com', 'geo.dailymotion.com'],
    fn(b) {
      if (b.json && b.kod === 200) {
        if (/"title"\s*:/.test(b.govde)) return ok('Dailymotion oEmbed verisi alındı');
        if (/Invalid video/i.test(b.govde)) return olu('Dailymotion: video bulunamadı');
        return belirsiz('Dailymotion yanıtı çözümlenemedi');
      }
      if (b.kod === 404) return olu('Dailymotion: video bulunamadı (404)');
      return null;
    },
  },
  {
    ad: 'yandexdisk',
    hostlar: ['yadi.sk', 'disk.yandex.com.tr', 'disk.yandex.com', 'disk.yandex.ru'],
    fn(b) {
      if (b.kod === 200 && b.json) {
        if (/"type"\s*:\s*"file"/.test(b.govde)) {
          const ad = /"name"\s*:\s*"([^"]{0,70})"/.exec(b.govde)?.[1] || '';
          return ok(`Yandex Disk dosyası mevcut${ad ? ` (${ad.slice(0, 45)})` : ''}`);
        }
        if (/NotFoundError|not found/i.test(b.govde)) return olu('Yandex Disk: dosya bulunamadı');
        return belirsiz('Yandex Disk yanıtı beklenen biçimde değil');
      }
      if (b.kod === 404) return olu('Yandex Disk: dosya bulunamadı (404)');
      return null;
    },
  },
  {
    ad: 'pixeldrain',
    hostlar: ['pixeldrain.com', 'turkanime.tv'],
    fn(b) {
      if (b.kod === 200 && /"success"\s*:\s*true/.test(b.govde)) return ok('pixeldrain dosyası mevcut');
      if (b.kod === 404) return olu('pixeldrain: dosya bulunamadı (404)');
      return null;
    },
  },
  {
    // VK gömme sayfası, video yayındaysa dosya listesini JSON olarak gömüyor:
    //   {"files":{"mp4_144":"https://vkvd…okcdn.ru/…"},"hls":…}
    // Video yoksa/silindiyse bu alanlar hiç gelmez (gövde ~64 KB JS kabuğu olur).
    // Ölçüm: docs/09 · 3 canlı örnekte dosya alanı var, uydurma ve rastgele 3 örnekte yok.
    ad: 'vk',
    hostlar: ['vk.com', 'm.vk.com', 'vkvideo.ru'],
    fn(b) {
      if (b.kod === 404 || b.kod === 410) return olu(`VK: HTTP ${b.kod}`);
      if (b.kod === 200) {
        if (/mp4_\d+|okcdn\.ru/.test(b.govde)) return ok('VK video dosyaları sayfada listelenmiş');
        // Dosya listesi yoksa ÖLÜ DEMEYİZ. Ölçüm (docs/09): VK, yük altında canlı videolar
        // için de dosyasız sayfa (64–65 KB JS kabuğu) servis ediyor — 20 rastgele "ölü"
        // kaydın 6'sı sakin koşulda canlı çıktı, yani %30 yanlış ölüm demekti.
        // Yanlış gizleme kullanıcı kaybı olduğu için karar "belirsiz" (ADR-0003).
        return belirsiz('VK: sayfada oynatılabilir dosya listesi yok (silinmiş, gizli ya da bot sayfası)');
      }
      return null;
    },
  },
  {
    ad: 'mega',
    hostlar: ['mega.nz', 'mega.io'],
    fn(b) {
      if (b.kod === 404 || b.kod === 410) return olu('MEGA: dosya bulunamadı');
      // MEGA gömme sayfası HTTP'de her zaman oynatıcı JS'i ile gelir; dosyanın
      // varlığını HTTP katmanı gösteremez (dosya kimliği AES anahtarı içerir ve
      // MEGA API'si oturum/handle dönüşümü ister). Genel kural burada "ok"
      // veremez: yanlış rozet vermemek için bilinçli olarak belirsiz.
      if (b.kod === 200) return belirsiz('MEGA: HTTP katmanı dosya varlığını gösteremiyor (API/oturum gerekli)');
      return null;
    },
  },
];

/** Genel kurallar: tüm host'larda geçerli temel kanıt değerlendirmesi. */
export function genelKural(b) {
  const g = b.govde || '';
  if (b.hata) {
    if (/ENOTFOUND|EAI_AGAIN/i.test(b.hata)) return olu(`alan adı çözümlenemedi (${b.hata})`);
    return belirsiz(`ağ hatası: ${b.hata}`);
  }
  if (b.kod === 404 || b.kod === 410) return olu(`HTTP ${b.kod}: kaynak yok`);
  if (b.kod === 451) return engelli('HTTP 451: yasal olarak engellenmiş');
  if (b.kod === 403 || b.kod === 401) {
    if (BOT_ISARET.test(g)) return { durum: DURUM.BELIRSIZ, sebep: `bot duvarı / oran sınırı (HTTP ${b.kod})`, botDuvarı: true };
    return belirsiz(`HTTP ${b.kod}: erişim reddedildi`);
  }
  if (b.kod === 429) return { durum: DURUM.BELIRSIZ, sebep: 'HTTP 429: oran sınırı', botDuvarı: true };
  if (b.kod >= 500) return belirsiz(`HTTP ${b.kod}: sunucu hatası`);
  if (b.kod === 200 || b.kod === 206) {
    if (BOT_ISARET.test(g) && g.length < 5000) return { durum: DURUM.BELIRSIZ, sebep: 'bot doğrulama sayfası', botDuvarı: true };
    if (OYNATICI_ISARET.test(g)) return ok('oynatıcı işareti bulundu');
    if (g.length < 20000 && YOK_ISARET.test(g)) return olu('sayfa "bulunamadı/silindi" diyor');
    if (g.length < 400) return belirsiz(`kısa yanıt (${g.length} B): karar için kanıt yok`);
    return belirsiz('oynatıcı işareti bulunamadı');
  }
  return belirsiz(`beklenmeyen HTTP ${b.kod}`);
}

/**
 * Kararı verirken URL'nin "gerçek" host'una bakarız: href.li gibi yönlendirme
 * sarmallarında arşivdeki host ile hedef host farklıdır (ör. href.li → vk.com).
 */
export function siniflandir(b) {
  for (const kural of KURALLAR) {
    if (!kural.hostlar.includes(b.host) && !kural.hostlar.includes(b.hedefHost)) continue;
    const sonuc = kural.fn(b);
    if (sonuc) return sonuc;
  }
  return genelKural(b);
}

/* ================================================================ */
/* 4 · Durum dosyası ve host sağlığı                                */
/* ================================================================ */

// `--sikistir` dosyayı yeniden yazar; açık tutulan bir tanıtıcı Windows'ta rename'i bloklar.
// Modül olarak içe alındığında (testler) yazma tanıtıcısı hiç açılmaz.
const durumAkisi =
  !DOGRUDAN || AYAR.durumRaporu || AYAR.kendiniTest || AYAR.sikistir ? null : fs.openSync(YOLLAR.linkDurum, 'a');

function durumYaz(kayit) {
  if (!durumAkisi) return;
  fs.writeSync(durumAkisi, JSON.stringify(kayit) + '\n');
}

/** link-durum.jsonl: url -> en son ölçüm (son satır geçerli) */
function kendiDurumumuz() {
  const map = new Map();
  for (const [url, kayit] of saglikOku([YOLLAR.linkDurum])) map.set(url, kayit);
  return map;
}

const hostSagligi = okuJson(YOLLAR.linkHost, {}) || {};

/**
 * Host sağlığı: bot duvarı / oran sınırı görülen host'u soğumaya alır.
 * Soğuma süresi her yeni engelde iki katına çıkar (üst sınır 12 saat): ısrarla
 * engelleyen bir host her koşuda dilim bütçesini yakmasın.
 */
function hostaIsaret(host, botDuvarı, sebep) {
  if (!hostSagligi[host]) hostSagligi[host] = { ardisik: 0, engelSayisi: 0, sogumaBitis: 0, sonDurum: '', sonSebep: '' };
  const h = hostSagligi[host];
  h.ardisik = botDuvarı ? (h.ardisik || 0) + 1 : 0;
  h.sonSebep = sebep;
  const esik = /oran sınırı|429/.test(sebep) ? 2 : 5;
  if (botDuvarı && h.ardisik >= esik) {
    h.engelSayisi = (h.engelSayisi || 0) + 1;
    const kat = Math.min(2 ** (h.engelSayisi - 1), 36);
    h.sogumaBitis = SIMDI() + Math.min(AYAR.soguma * kat, 12 * 3600_000);
    h.sonDurum = 'sogumada';
    h.ardisik = 0;
    return true;
  }
  return false;
}

/* ================================================================ */
/* 5 · Plan: hangi URL'ler, hangi sırayla                           */
/* ================================================================ */

const eskiSaglik = saglikOku([YOLLAR.health]);
const bizimSaglik = kendiDurumumuz();

/**
 * Kullanıcı bildirimleri: url -> sıra (en yeni bildirim önce).
 * Bildirim bir KARAR değil önceliktir; yalnızca tarama sırasını değiştirir.
 * 30 günden eski kayıtlar dikkate alınmaz.
 */
function bildirimSirasi() {
  const harita = new Map();
  if (!AYAR.bildirim || !fs.existsSync(YOLLAR.bildirim)) return harita;
  const esik = SIMDI() - 30 * 86_400_000;
  for (const satir of fs.readFileSync(YOLLAR.bildirim, 'utf8').split(/\r?\n/)) {
    if (!satir.trim()) continue;
    try {
      const k = JSON.parse(satir);
      if (!k.url || (zamanOku(k.zaman) || 0) < esik) continue;
      if (!harita.has(k.url)) harita.set(k.url, harita.size);
    } catch {
      /* bozuk satır yok sayılır */
    }
  }
  return harita;
}

function planKur() {
  const db = new DatabaseSync(YOLLAR.db, { readOnly: true });
  const satirlar = db
    .prepare(
      'SELECT l.deger AS url, l.player AS player, b.anime_id AS animeId, COALESCE(m.score, 0) AS puan ' +
        'FROM link l JOIN bolum b ON b.id = l.bolum_id LEFT JOIN anime_meta m ON m.anime_id = b.anime_id'
    )
    .all();
  db.close();

  const urler = new Map(); // url -> { url, player, host, puan, adet }
  for (const s of satirlar) {
    let k = urler.get(s.url);
    if (!k) {
      urler.set(s.url, (k = { url: s.url, player: s.player, host: hostAl(s.url), puan: s.puan || 0, adet: 0 }));
    } else if ((s.puan || 0) > k.puan) {
      k.puan = s.puan || 0;
    }
    k.adet++;
  }

  const simdi = SIMDI();
  const yeniEsik = simdi - AYAR.yenile * 3600_000;
  const gecerlilikEsik = simdi - AYAR.gecerlilik * 86_400_000;

  const dalgalar = { 1: [], 2: [], 3: [], 4: [] };
  const atlanan = { taze: 0, sogumada: 0, host: 0, dalga: 0, kok: 0, filtre: 0 };
  const bildirimler = bildirimSirasi();
  const oncelikli = [];

  for (const k of urler.values()) {
    if (!/^https?:\/\//i.test(k.url)) {
      atlanan.kok++;
      continue;
    }
    if (AYAR.hostlar && !AYAR.hostlar.includes(k.host)) {
      atlanan.host++;
      continue;
    }
    if (AYAR.haricHostlar && AYAR.haricHostlar.includes(k.host)) {
      atlanan.host++;
      continue;
    }
    const eski = eskiSaglik.get(k.url);
    const bizim = bizimSaglik.get(k.url);
    const bizimZaman = zamanOku(bizim?.zaman) || 0;

    if (AYAR.durumFiltre && (!bizim || !AYAR.durumFiltre.includes(bizim.durum))) {
      atlanan.filtre++;
      continue;
    }

    const bildirimli = bildirimler.has(k.url);
    if (!AYAR.zorla && bizim && !bildirimli) {
      if (bizim.durum === DURUM.BELIRSIZ) {
        if (bizimZaman > yeniEsik) {
          atlanan.taze++;
          continue;
        }
      } else if (bizimZaman > gecerlilikEsik) {
        atlanan.taze++;
        continue;
      }
    }

    let dalga;
    if (eski && (eski.durum === DURUM.OLU || eski.durum === DURUM.ENGELLI)) dalga = 1;
    else if (eski && eski.durum === DURUM.OK) dalga = 2;
    else if (k.puan >= 60) dalga = 3;
    else dalga = 4;

    if (!AYAR.dalgalar.includes(dalga)) {
      atlanan.dalga++;
      continue;
    }
    const soguma = hostSagligi[k.host]?.sogumaBitis || 0;
    if (!AYAR.zorla && soguma > simdi) {
      atlanan.sogumada++;
      continue;
    }
    dalgalar[dalga].push(k);
    if (bildirimli) oncelikli.push(k);
  }

  const sirala = (dizi) => dizi.sort((a, b) => b.puan - a.puan || a.url.localeCompare(b.url));
  oncelikli.sort((a, b) => (bildirimler.get(a.url) ?? 999) - (bildirimler.get(b.url) ?? 999));
  const plan = [...oncelikli, ...sirala(dalgalar[1]), ...sirala(dalgalar[2]), ...sirala(dalgalar[3]), ...sirala(dalgalar[4])];
  return { plan: hostDagit(plan), dalgalar, atlanan, toplam: urler.size, bildirimOncelik: oncelikli.length };
}

/**
 * Sıralamayı host'lar arasında harmanlar (round-robin).
 * Gerekçesi: dalga 1'in neredeyse tamamı sibnet; harmanlamazsak bir dilimin tamamı
 * tek bir host'a gider ve o host engellendiğinde koşu boşa düşer.
 */
function hostDagit(plan) {
  const kovalar = new Map();
  for (const is of plan) {
    let d = kovalar.get(is.host);
    if (!d) kovalar.set(is.host, (d = []));
    d.push(is);
  }
  const liste = [...kovalar.values()];
  const cikti = [];
  for (let i = 0; cikti.length < plan.length; i++) {
    for (const d of liste) if (i < d.length) cikti.push(d[i]);
  }
  return cikti;
}

/* ================================================================ */
/* 6 · Tarama motoru: eşzamanlı, host-dostu, kesintiye dayanıklı     */
/* ================================================================ */

const istatistik = {
  tarandi: 0,
  ok: 0,
  olu: 0,
  engelli: 0,
  belirsiz: 0,
  hata: 0,
  botDuvarı: 0,
  yazilan: 0,
  hostlar: new Map(), // host -> { tarandi, ok, olu, engelli, belirsiz, ms, hata }
};

function istatistikHost(host) {
  let h = istatistik.hostlar.get(host);
  if (!h) istatistik.hostlar.set(host, (h = { tarandi: 0, ok: 0, olu: 0, engelli: 0, belirsiz: 0, ms: 0, hata: 0 }));
  return h;
}

async function istekYap(url, ek = {}, yenidenDeneme = 1) {
  const ctrl = new AbortController();
  const zamanlayici = setTimeout(() => ctrl.abort(), AYAR.zamanAsimi);
  const t0 = SIMDI();
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': UA,
        accept: ek.json ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8',
        ...(ek.basliklar || {}),
      },
    });
    const buf = Buffer.from(await r.arrayBuffer());
    return {
      kod: r.status,
      son: r.url,
      govde: govdeCoz(buf, r.headers.get('content-type')),
      sunucu: r.headers.get('server') || '',
      bayt: buf.length,
      ms: SIMDI() - t0,
      hata: null,
    };
  } catch (e) {
    const kod = e.cause?.code || e.name || 'HATA';
    const agHatasi = /(ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR|AbortError|TimeoutError|fetch failed|socket)/i.test(String(kod));
    if (agHatasi && yenidenDeneme > 0) {
      await bekle(1200);
      return istekYap(url, ek, yenidenDeneme - 1);
    }
    return { kod: 0, son: url, govde: '', bayt: 0, ms: SIMDI() - t0, hata: String(kod) };
  } finally {
    clearTimeout(zamanlayici);
  }
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/** Host bazlı adil zamanlayıcı: eşzamanlılık + istek aralığı + soğuma. */
class Zamanlayici {
  constructor(plan) {
    this.hostlar = new Map();
    this.sira = [];
    for (const is of plan) {
      let h = this.hostlar.get(is.host);
      if (!h) {
        this.hostlar.set(is.host, (h = { ad: is.host, isler: [], aktif: 0, sonIstek: 0, sogumaBitis: hostSagligi[is.host]?.sogumaBitis || 0 }));
        this.sira.push(h);
      }
      h.isler.push(is);
    }
    this.bekleyen = plan.length;
    this.aktif = 0;
    this.atlananSoguma = 0;
  }

  /** Sıradaki işi seçer; uygun host yoksa null döner. */
  sirradaki() {
    if (this.bekleyen === 0 || this.aktif >= AYAR.es) return null;
    const simdi = SIMDI();
    let en = null;
    for (const h of this.sira) {
      if (!h.isler.length || h.aktif >= AYAR.hostEs) continue;
      if (simdi < h.sonIstek + AYAR.hostAralik) continue;
      if (en === null || h.sonIstek < en.sonIstek) en = h;
    }
    if (!en) return null;
    const is = en.isler.shift();
    en.aktif++;
    en.sonIstek = simdi;
    this.aktif++;
    this.bekleyen--;
    return { host: en, is };
  }

  birak(host) {
    host.aktif--;
    this.aktif--;
  }

  /** Bir host engel yediğinde kalan işlerini bu koşudan düşürür (koşu asılı kalmasın). */
  hostuDurdur(host, sebep) {
    // DİKKAT: düşürülen işler `bekleyen` sayacından da çıkarılmalı; yoksa işçiler
    // hiç bitmeyen bir döngüde bekler (koşu asılı kalır).
    this.atlananSoguma += host.isler.length;
    this.bekleyen -= host.isler.length;
    host.isler.length = 0;
    hostSagligi[host.ad] = { ...(hostSagligi[host.ad] || {}), sogumaBitis: SIMDI() + AYAR.soguma, sonDurum: 'sogumada', sonSebep: sebep, ardisik: 0 };
  }

  bittiMi() {
    return this.bekleyen === 0 && this.aktif === 0;
  }
}

let DURDUR = false;
let durdurmaSebebi = '';
process.on('SIGINT', () => {
  DURDUR = true;
  durdurmaSebebi = 'kullanıcı kesmesi (Ctrl+C)';
  log('\n   [i] Kesme alındı: uçuştaki istekler tamamlanıyor, sonuçlar yazılıyor...');
});
process.on('SIGTERM', () => {
  DURDUR = true;
  durdurmaSebebi = 'SIGTERM';
});

async function taramaYap(plan) {
  const zamanlayici = new Zamanlayici(plan);
  let sonRapor = SIMDI();

  async function calistir(secim) {
    const { host, is } = secim;
    const hedef = hedefBelirle(is.url, is.host);
    const cevap = await istekYap(hedef.hedef, { json: hedef.json });
    const hedefHost = hostAl(cevap.son || hedef.hedef);
    const karar = siniflandir({ ...cevap, host: is.host, hedefHost, url: is.url, json: hedef.json });
    const kayit = {
      url: is.url,
      durum: karar.durum,
      sebep: karar.sebep,
      player: is.player,
      host: is.host,
      zaman: zamanMetni(),
      ms: cevap.ms,
      http: cevap.kod || 0,
      kaynak: 'link-tara',
      ...(hedef.not ? { uc: hedef.not } : {}),
    };
    durumYaz(kayit);
    istatistik.yazilan++;

    istatistik.tarandi++;
    if (karar.durum === DURUM.OK) istatistik.ok++;
    else if (karar.durum === DURUM.OLU) istatistik.olu++;
    else if (karar.durum === DURUM.ENGELLI) istatistik.engelli++;
    else istatistik.belirsiz++;
    if (cevap.hata) istatistik.hata++;
    if (karar.botDuvarı) istatistik.botDuvarı++;

    const h = istatistikHost(is.host);
    h.tarandi++;
    h.ms += cevap.ms;
    h[karar.durum === DURUM.OK ? 'ok' : karar.durum === DURUM.OLU ? 'olu' : karar.durum === DURUM.ENGELLI ? 'engelli' : 'belirsiz']++;
    if (cevap.hata) h.hata++;

    if (hostaIsaret(is.host, !!karar.botDuvarı, karar.sebep)) {
      zamanlayici.hostuDurdur(host, karar.sebep);
      if (!AYAR.sessiz) log(`   [!] ${is.host} → soğumaya alındı (${karar.sebep}); kalan ${zamanlayici.atlananSoguma} iş bu koşuda atlandı`);
    }

    if (!AYAR.sessiz && SIMDI() - sonRapor > 5000) {
      sonRapor = SIMDI();
      ilerlemeYaz(zamanlayici, plan.length);
    }
  }

  async function isci() {
    for (;;) {
      if (DURDUR || SIMDI() - BASLA > AYAR.sure) {
        if (!DURDUR && SIMDI() - BASLA > AYAR.sure) {
          DURDUR = true;
          durdurmaSebebi = `süre sınırı (${Math.round(AYAR.sure / 60000)} dk)`;
          log('\n   [i] Süre sınırına ulaşıldı; sonuçlar yazıldı, kalan işler sonraki koşuya bırakıldı.');
        }
        return;
      }
      const secim = zamanlayici.sirradaki();
      if (!secim) {
        if (zamanlayici.bittiMi()) return;
        await bekle(40);
        continue;
      }
      try {
        await calistir(secim);
      } catch (e) {
        istatistik.hata++;
        durumYaz({
          url: secim.is.url,
          durum: DURUM.BELIRSIZ,
          sebep: `beklenmeyen hata: ${String(e.message || e).slice(0, 90)}`,
          player: secim.is.player,
          host: secim.is.host,
          zaman: zamanMetni(),
          kaynak: 'link-tara',
        });
      } finally {
        zamanlayici.birak(secim.host);
      }
    }
  }

  const isciSayisi = Math.min(AYAR.es, plan.length);
  await Promise.all(Array.from({ length: isciSayisi }, () => isci()));
  return zamanlayici;
}

function ilerlemeYaz(zamanlayici, toplam) {
  const gecen = (SIMDI() - BASLA) / 1000;
  const hiz = istatistik.tarandi / Math.max(gecen, 0.001);
  const kalan = zamanlayici.bekleyen + zamanlayici.aktif;
  const tahmin = hiz > 0 ? Math.round(kalan / hiz) : 0;
  const dk = Math.floor(tahmin / 60);
  const sn = tahmin % 60;
  log(
    `   ${String(istatistik.tarandi).padStart(6)}/${String(toplam).padEnd(6)} · ` +
      `ok ${String(istatistik.ok).padStart(5)} · ölü ${String(istatistik.olu).padStart(5)} · ` +
      `engelli ${String(istatistik.engelli).padStart(4)} · belirsiz ${String(istatistik.belirsiz).padStart(5)} · ` +
      `${hiz.toFixed(1)}/sn · kalan ~${dk}dk ${String(sn).padStart(2)}sn`
  );
}

/* ================================================================ */
/* 7 · Rapor                                                         */
/* ================================================================ */

function kapsamRaporu() {
  const db = new DatabaseSync(YOLLAR.db, { readOnly: true });
  const hamTekil = db.prepare('SELECT COUNT(DISTINCT deger) AS n FROM link').get().n;
  db.close();
  const tum = saglikOku();
  const kendi = kendiDurumumuz();
  const say = { ok: 0, olu: 0, engelli: 0, belirsiz: 0 };
  for (const v of tum.values()) say[v.durum === DURUM.OK ? 'ok' : v.durum === DURUM.OLU ? 'olu' : v.durum === DURUM.ENGELLI ? 'engelli' : 'belirsiz']++;
  return {
    uretim: new Date().toISOString(),
    hamTekilUrl: hamTekil,
    kontrolEdilenUrl: tum.size,
    kapsamYuzdesi: Number(((tum.size / hamTekil) * 100).toFixed(2)),
    kendiTarama: kendi.size,
    kendiKapsamYuzdesi: Number(((kendi.size / hamTekil) * 100).toFixed(2)),
    dagilim: say,
    kesinYuzde: Number((((say.ok + say.olu + say.engelli) / hamTekil) * 100).toFixed(2)),
  };
}

function akilliRapor(kapsam) {
  const kendi = kendiDurumumuz();
  const sebepSayaci = new Map();
  const durumSayaci = { ok: 0, olu: 0, engelli: 0, belirsiz: 0 };
  const hostSayaci = new Map();
  for (const v of kendi.values()) {
    const d = v.durum === DURUM.OK ? 'ok' : v.durum === DURUM.OLU ? 'olu' : v.durum === DURUM.ENGELLI ? 'engelli' : 'belirsiz';
    durumSayaci[d]++;
    const anahtar = v.sebep.replace(/\(.*/, '').trim().slice(0, 60);
    sebepSayaci.set(anahtar, (sebepSayaci.get(anahtar) || 0) + 1);
    const h = v.host || '';
    if (!hostSayaci.has(h)) hostSayaci.set(h, { tarandi: 0, ok: 0, olu: 0, engelli: 0, belirsiz: 0 });
    const g = hostSayaci.get(h);
    g.tarandi++;
    g[d]++;
  }
  const rapor = {
    uretim: new Date().toISOString(),
    kapsam,
    durumSayaci,
    sebepler: [...sebepSayaci.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([sebep, sayi]) => ({ sebep, sayi })),
    hostlar: [...hostSayaci.entries()]
      .map(([host, g]) => ({ host, ...g, okYuzde: g.tarandi ? Number(((g.ok / g.tarandi) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.tarandi - a.tarandi),
    hostSagligi: Object.entries(hostSagligi).map(([host, h]) => ({ host, ...h, sogumaBitisIso: h.sogumaBitis ? new Date(h.sogumaBitis).toISOString() : null })),
  };
  fs.mkdirSync(YOLLAR.rapor, { recursive: true });
  yazJson(path.join(YOLLAR.rapor, 'link-tarama.json'), rapor, false);

  const md = [
    '# Link taraması raporu',
    '',
    `- Üretim: \`${rapor.uretim}\``,
    `- Durum dosyası: \`tools/cache/link-durum.jsonl\` (${kendi.size} kayıt)`,
    `- Kapsam: **${kapsam.kapsamYuzdesi}%** (${kapsam.kontrolEdilenUrl.toLocaleString('tr-TR')} / ${kapsam.hamTekilUrl.toLocaleString('tr-TR')} tekil URL)`,
    `- Kesin karara varılan: **${kapsam.kesinYuzde}%**`,
    '',
    '## Durum dağılımı (birleşik)',
    '',
    '| Durum | Adet |',
    '|---|---:|',
    `| Çalışıyor | ${kapsam.dagilim.ok} |`,
    `| Ölü | ${kapsam.dagilim.olu} |`,
    `| Engelli | ${kapsam.dagilim.engelli} |`,
    `| Belirsiz | ${kapsam.dagilim.belirsiz} |`,
    '',
    '## Host kırılımı (kendi taramamız)',
    '',
    '| Host | Tarandı | Ok | Ölü | Engelli | Belirsiz | Ok % |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...rapor.hostlar.map((h) => `| ${h.host} | ${h.tarandi} | ${h.ok} | ${h.olu} | ${h.engelli} | ${h.belirsiz} | ${h.okYuzde} |`),
    '',
    '## Karar sebepleri (ilk 15)',
    '',
    '| Sebep | Adet |',
    '|---|---:|',
    ...rapor.sebepler.map((s) => `| ${s.sebep} | ${s.sayi} |`),
  ];
  if (rapor.hostSagligi.length) {
    md.push('', '## Host sağlığı / soğuma', '', '| Host | Ardışık engel | Soğuma bitişi | Son sebep |', '|---|---:|---|---|');
    for (const h of rapor.hostSagligi) md.push(`| ${h.host} | ${h.ardisik} | ${h.sogumaBitisIso || '-'} | ${(h.sonSebep || '').slice(0, 70)} |`);
  }
  md.push('');
  fs.writeFileSync(path.join(YOLLAR.rapor, 'link-tarama.md'), md.join('\n'), 'utf8');
  return rapor;
}

/* ================================================================ */
/* 7b · Sicil denetimi: eski taramanın oran sınırı artefaktları      */
/* ================================================================ */

/**
 * Arşivdeki eski araç (`kontrol_gecmisi.jsonl`) 23.09.2026 akşamı sibnet'i
 * tararken oran sınırına takılmış: ilk 800 kayıt "çalışıyor", sonra ani bir
 * kırılma ile kayıtların %100'ü "ölü" damgası almış ("player bulunamadı").
 * Kanıt: docs/09. Bugün aynı URL'ler 200 dönüyor ve oynatıcı işareti içeriyor
 * (kendini test + 8 örneğin 6'sı canlı).
 *
 * Bu uç, söz konusu artefakt kayıtlarını `belirsiz` olarak işaretler: link
 * yeniden görünür olur ama rozet almaz ve gerçek doğrulama sırasını (dalga 1)
 * korur. Eski dosya değiştirilmez; karar bizim durum dosyamıza yazılır.
 */
export function sicilArtefaktlari(kayitlar, host) {
  const ilgili = kayitlar.filter((k) => hostAl(k.url) === host);
  const artefaktlar = [];
  let ardisikOlu = 0;
  let oncekiZaman = 0;
  let bozukMod = false;

  for (const k of ilgili) {
    const zaman = zamanOku(k.zaman) || 0;
    // 30 dakikadan uzun boşluk = yeni tarama oturumu
    if (oncekiZaman && zaman - oncekiZaman > 30 * 60_000) {
      bozukMod = false;
      ardisikOlu = 0;
    }
    oncekiZaman = zaman;

    if (k.durum === 'ölü') {
      ardisikOlu++;
      // Aynı oturumda 20 ardışık "ölü" = oran sınırı kırılması
      if (ardisikOlu >= 20) bozukMod = true;
      if (bozukMod) artefaktlar.push(k);
    } else {
      ardisikOlu = 0;
    }
  }
  return { ilgili: ilgili.length, artefaktlar };
}

/** Arşiv kayıtlarını okur (I/O) ve saf çekirdeğe devreder. */
function sicilDenetimi(host = 'video.sibnet.ru') {
  const satirlar = fs
    .readFileSync(YOLLAR.health, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return sicilArtefaktlari(satirlar, host);
}

/**
 * Durum dosyasını sıkıştırır: her URL için yalnızca son kayıt kalır.
 * Yeniden taramalar aynı URL'yi defalarca yazdığı için dosya zamanla şişer;
 * sıkıştırma kayıpsızdır (son satır zaten geçerli olandır).
 */
function sikistir() {
  const satirlar = fs.readFileSync(YOLLAR.linkDurum, 'utf8').split(/\r?\n/).filter(Boolean);
  const son = new Map();
  let bozuk = 0;
  for (const satir of satirlar) {
    try {
      son.set(JSON.parse(satir).url, satir);
    } catch {
      bozuk++;
    }
  }
  const gecici = YOLLAR.linkDurum + '.tmp';
  fs.writeFileSync(gecici, [...son.values()].join('\n') + '\n', 'utf8');
  fs.renameSync(gecici, YOLLAR.linkDurum);
  log(`   sıkıştırma: ${satirlar.length} satır → ${son.size} kayıt${bozuk ? ` (${bozuk} bozuk satır atıldı)` : ''}`);
}

if (AYAR.sikistir) {
  baslik('Durum dosyası sıkıştırılıyor');
  sikistir();
  process.exit(0);
}

if (AYAR.sicilDenetim) {
  baslik('Sicil denetimi: eski taramanın oran sınırı artefaktları');
  const host = AYAR.sicilDenetim === true ? 'video.sibnet.ru' : AYAR.sicilDenetim;
  const { ilgili, artefaktlar } = sicilDenetimi(host);
  log(`   host            : ${host}`);
  log(`   eski kayıt      : ${ilgili}`);
  // Kendi ölçtüğümüz kayıtları ezmeyiz: artefakt damgası yalnızca *hiç ölçülmemiş*
  // eski kayıtlar için yazılır (ölçülmüş olan gerçek kanıt taşır).
  const olculenler = kendiDurumumuz();
  const yazilacak = artefaktlar.filter((k) => !olculenler.has(k.url));
  log(`   artefakt (ölü)  : ${artefaktlar.length}`);
  log(`   zaten ölçülmüş  : ${artefaktlar.length - yazilacak.length}`);
  if (!AYAR.kuru) {
    for (const k of yazilacak) {
      durumYaz({
        url: k.url,
        durum: DURUM.BELIRSIZ,
        sebep: 'eski taramanın oran sınırı artefaktı (yeniden doğrulama sırasında)',
        player: 'SIBNET',
        host,
        zaman: zamanMetni(),
        kaynak: 'sicil-denetim',
      });
    }
    log(`   ${yazilacak.length} kayıt "belirsiz" olarak işaretlendi (link görünür, rozetsiz).`);
  }
  process.exit(0);
}

/* ================================================================ */
/* 8 · Kendini test (canlı URL'lerle sınıflandırıcı sınaması)        */
/* ================================================================ */

const TEST_ORNEKLERI = [
  // [url, beklenen durum, açıklama]
  ['https://uqload.com/embed-6bwo7pmyvvo2.html', DURUM.OK, 'uqload canlı (eski tarama: çalışıyor)'],
  ['https://uqload.com/embed-zzzzzzzzzzzz.html', DURUM.OLU, 'uqload uydurma kimlik'],
  ['https://my.mail.ru/video/embed/4898784563322425160', DURUM.OK, 'mail.ru meta ucu'],
  ['https://videoapi.my.mail.ru/videos/embed/gmail.com/olmayankullanici123/_myvideo/1.html', DURUM.OLU, 'mail.ru olmayan kullanıcı'],
  ['https://ok.ru/videoembed/1843982830138', DURUM.OK, 'ok.ru oynatıcı yüklüyor'],
  ['https://ok.ru/videoembed/99999999999999', DURUM.OLU, 'ok.ru olmayan video'],
  ['https://drive.google.com/file/d/10KWPOvPY-BD6vOOfY5IiGhC0BtWwXAEQ/preview', DURUM.OK, 'Drive mevcut dosya'],
  ['https://drive.google.com/file/d/ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ/preview', DURUM.OLU, 'Drive olmayan dosya'],
  ['https://voe.sx/e/v6mmjkkcrb5p', DURUM.BELIRSIZ, 'voe DDoS koruması (kanıt yok)'],
  // sibnet oran sınırına bağlı olarak iki sonuç da doğru: engellenirse belirsiz,
  // sayfa gelirse oynatıcı işaretiyle "ok".
  ['https://video.sibnet.ru/shell.php?videoid=3858977', [DURUM.OK, DURUM.BELIRSIZ], 'sibnet (oran sınırı ya da oynatıcı)'],
  ['https://www.dailymotion.com/embed/video/x82sry8', DURUM.OK, 'dailymotion oEmbed'],
  ['https://www.dailymotion.com/embed/video/zzzzzzz', DURUM.OLU, 'dailymotion olmayan video'],
  ['https://yadi.sk/i/4_6NurZyVmAMOQ', DURUM.OK, 'Yandex Disk genel API'],
  ['https://yadi.sk/i/OLMAYAN-KIMLIK-12345', DURUM.OLU, 'Yandex Disk olmayan dosya'],
  ['https://mp4upload.com/embed-zzzzzzzzzzzz.html', DURUM.OLU, 'mp4upload silinmiş dosya'],
  ['https://my.mail.ru/mail/bcykn/video/embed/_myvideo/118', DURUM.OK, 'mail.ru yol biçimi (video JSON ucu)'],
  ['https://my.mail.ru/mail/olmayankullanici999/video/embed/_myvideo/424242', DURUM.OLU, 'mail.ru yol biçimi, olmayan video'],
  // VK yük altında canlı videolar için de dosyasız sayfa döndürebiliyor; iki sonuç kabul.
  ['https://href.li/?https://vk.com/video_ext.php?oid=370694491&id=456239234&hash=ba30f7b413221546&hd=1', [DURUM.OK, DURUM.BELIRSIZ], 'VK (href.li sarmalı) canlı video'],
  ['https://vk.com/video_ext.php?oid=1&id=1&hash=0000000000000000&hd=1', DURUM.BELIRSIZ, 'VK dosya listesi yok → ölü denilemez (yük altında canlı da dosyasız gelebiliyor)'],
  ['https://mega.nz/embed/lKQERJYK#5vfv6wU9ok4K', DURUM.BELIRSIZ, 'MEGA HTTP ile kanıtlanamıyor'],
];

async function kendiniTest() {
  baslik('Kendini test: sınıflandırıcı canlı URL sınaması');
  let basarili = 0;
  let basarisiz = 0;
  for (const [url, beklenenHam, aciklama] of TEST_ORNEKLERI) {
    const beklenenler = Array.isArray(beklenenHam) ? beklenenHam : [beklenenHam];
    const host = hostAl(url);
    const hedef = hedefBelirle(url, host);
    const cevap = await istekYap(hedef.hedef, { json: hedef.json });
    const karar = siniflandir({ ...cevap, host, hedefHost: hostAl(cevap.son || hedef.hedef), url, json: hedef.json });
    const tamam = beklenenler.includes(karar.durum);
    if (tamam) basarili++;
    else basarisiz++;
    console.log(
      `  ${tamam ? '✓' : '✗'} ${String(karar.durum).padEnd(9)} (beklenen ${String(beklenenler.join('|')).padEnd(9)}) ${aciklama}`
    );
    console.log(`      ${url.slice(0, 110)} → HTTP ${cevap.kod} ${cevap.ms}ms · ${karar.sebep}`);
  }
  console.log(`\n  ${basarili}/${TEST_ORNEKLERI.length} geçti${basarisiz ? `, ${basarisiz} başarısız` : ''}`);
  process.exit(basarisiz ? 1 : 0);
}

/* ================================================================ */
/* 9 · Ana akış                                                      */
/* ================================================================ */

if (AYAR.kendiniTest) {
  await kendiniTest();
}

if (AYAR.durumRaporu) {
  const kapsam = kapsamRaporu();
  akilliRapor(kapsam);
  baslik('Link sağlığı kapsamı');
  console.log(`   arşivdeki tekil URL : ${kapsam.hamTekilUrl.toLocaleString('tr-TR')}`);
  console.log(`   kontrol edilmiş     : ${kapsam.kontrolEdilenUrl.toLocaleString('tr-TR')}  (%${kapsam.kapsamYuzdesi})`);
  console.log(`     · kendi taramamız : ${kapsam.kendiTarama.toLocaleString('tr-TR')}`);
  console.log(`   dağılım             : ok ${kapsam.dagilim.ok} · ölü ${kapsam.dagilim.olu} · engelli ${kapsam.dagilim.engelli} · belirsiz ${kapsam.dagilim.belirsiz}`);
  console.log(`   kesin karara varılan: %${kapsam.kesinYuzde}`);
  console.log(`\n   Rapor: tools/rapor/link-tarama.md`);
  process.exit(0);
}

/* CLI akışı yalnızca betik doğrudan çalıştırıldığında koşar; modül olarak içe
   alındığında (testler) bu blok atlanır ve yalnızca saf fonksiyonlar kullanılır. */
if (DOGRUDAN) {
  baslik('Link taraması hazırlanıyor');
  const { plan, dalgalar, atlanan, toplam, bildirimOncelik } = planKur();
  log(`   arşivdeki tekil URL   : ${toplam.toLocaleString('tr-TR')}`);
  if (AYAR.bildirim) log(`   bildirim önceliği      : ${bildirimOncelik.toLocaleString('tr-TR')}`);
  log(`   dalga 1 (eski-şüpheli): ${dalgalar[1].length.toLocaleString('tr-TR')}`);
  log(`   dalga 2 (tazeleme)    : ${dalgalar[2].length.toLocaleString('tr-TR')}`);
  log(`   dalga 3 (popüler)     : ${dalgalar[3].length.toLocaleString('tr-TR')}`);
  log(`   dalga 4 (kalan)       : ${dalgalar[4].length.toLocaleString('tr-TR')}`);
  log(
    `   atlanan               : taze ${atlanan.taze} · soğumada ${atlanan.sogumada} · host filtresi ${atlanan.host} · ` +
      `dalga dışı ${atlanan.dalga}${AYAR.durumFiltre ? ` · durum filtresi ${atlanan.filtre}` : ''}`
  );

  const dilim = plan.slice(0, AYAR.dilim);
  if (AYAR.kuru) {
    const hostSayaci = new Map();
    for (const is of dilim) hostSayaci.set(is.host, (hostSayaci.get(is.host) || 0) + 1);
    log(`\n   [kuru koşu] taranacak: ${dilim.length} URL`);
    for (const [h, n] of [...hostSayaci.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) log(`      ${String(n).padStart(7)}  ${h}`);
    process.exit(0);
  }
  if (!dilim.length) {
    log('\n   [i] Taranacak yeni URL yok. `--zorla` ile yeniden tarayabilir veya `--gecerlilik` süresini bekle.');
    process.exit(0);
  }

  log(`\n   tarama başlıyor: ${dilim.length} URL · ${AYAR.es} eşzamanlı işçi · host başına ${AYAR.hostEs} istek / ${AYAR.hostAralik} ms`);
  log(`   durum dosyası: tools/cache/link-durum.jsonl (her sonuç anında yazılır, kesintiye dayanıklı)`);

  const zamanlayici = await taramaYap(dilim);

  if (durumAkisi) fs.closeSync(durumAkisi);
  yazJson(YOLLAR.linkHost, hostSagligi, false);

  baslik('Tarama özeti');
  const gecen = ((SIMDI() - BASLA) / 1000).toFixed(1);
  log(`   süre        : ${gecen} sn`);
  log(`   taranan     : ${istatistik.tarandi}`);
  log(`   ok          : ${istatistik.ok}`);
  log(`   ölü         : ${istatistik.olu}`);
  log(`   engelli     : ${istatistik.engelli}`);
  log(`   belirsiz    : ${istatistik.belirsiz}`);
  if (zamanlayici.atlananSoguma) log(`   soğumada atlanan: ${zamanlayici.atlananSoguma}`);
  if (durdurmaSebebi) log(`   durdurma sebebi : ${durdurmaSebebi}`);

  const hostSirali = [...istatistik.hostlar.entries()].sort((a, b) => b[1].tarandi - a[1].tarandi);
  if (hostSirali.length) {
    log('\n   host                  tarandı      ok     ölü  engelli belirsiz   ort.ms');
    for (const [host, s] of hostSirali) {
      log(
        `   ${host.padEnd(22)} ${String(s.tarandi).padStart(7)} ${String(s.ok).padStart(7)} ${String(s.olu).padStart(7)} ` +
          `${String(s.engelli).padStart(8)} ${String(s.belirsiz).padStart(8)} ${String(Math.round(s.ms / Math.max(s.tarandi, 1))).padStart(8)}`
      );
    }
  }

  const kapsam = kapsamRaporu();
  log(`\n   kapsam: %${kapsam.kapsamYuzdesi} (${kapsam.kontrolEdilenUrl}/${kapsam.hamTekilUrl}) · kesin: %${kapsam.kesinYuzde}`);
  log(`   sonraki adım: npm run veri && npm run build   (kapsam /kunye sayfasına bu şekilde yansır)`);

  if (AYAR.rapor) {
    akilliRapor(kapsam);
    log(`   rapor: tools/rapor/link-tarama.md`);
  }
}
