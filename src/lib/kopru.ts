/**
 * kopru.ts — gömülü oynatıcılarla postMessage köprüsü
 *
 * Neden var: kaynaklar `<iframe>` ile gömülüyor ve cross-origin olduğu için
 * video elemanına erişemiyoruz. Bazı host'lar ise **resmî postMessage API'si**
 * yayınlıyor; onlarda gerçek oynatma konumunu ve süresini öğrenebiliyor, hatta
 * oynat/duraklat/sar komutu gönderebiliyoruz.
 *
 * Ölçüm (tahmin değil): `tools/kopru-test.html` (olay kanalı) ve
 * `tools/kopru-komut-test.html` (komut kanalı) gerçek embed'lerle çalıştırıldı.
 * Kritik bulgular:
 *   1. VK `js_api=1` parametresi olmadan tek olay bile yayınlamıyor; parametre
 *      eklendiğinde `inited` (süre dahil) ve `timeupdate`/`seeked`/`started`
 *      olayları geliyor. `referrerPolicy="no-referrer"` bu kanalı engellemiyor.
 *   2. Komutlar **nesne** olarak gönderilmeli. `JSON.stringify` ile gönderilen
 *      aynı komutlar cevapsız kaldı; nesne biçiminde `seeked` + `started`
 *      olayları döndü. Bu yüzden `komutlar()` asla metin üretmez.
 *   3. Komut gönderildikten sonra cevap olayı gecikebilir; oynatıcı henüz
 *      dinleyici kurmamışken gönderilen komut sessizce kaybolur. Bu yüzden
 *      çağıran taraf komutu **olay gelene kadar yineler** (`komutDenemesi`).
 *   4. Sibnet (kaynakların ~%42'si) ve Dailymotion hiç cevap vermedi; onlar
 *      "opak" sınıfındadır: iframe kalır, ölü kontrol düğmesi gösterilmez.
 *
 * Veri kaynağı sapması: VK adresleri arşivde `href.li/?https://vk.com/...`
 * sarmalayıcısıyla yazılı. API gerçek origin ile konuşmak zorunda olduğu için
 * sarmalayıcı iframe'e girmeden önce çözülür.
 */

export type KopruAdi = 'vk' | 'ok' | 'mail';

export type KopruEylem = 'oynat' | 'duraklat' | 'sar';

export interface Kopru {
  ad: KopruAdi;
  /** Kullanıcıya gösterilen kısa host adı. */
  etiket: string;
  /** Ölçümle doğrulanmış: komut kanalı çalışıyor (oynat/duraklat/sar). */
  komut: boolean;
  /** Ölçümle doğrulanmış: gerçek saniye/süre geliyor (ilerleme çubuğu kurulabilir). */
  telemetri: boolean;
  /** En az bir "hazır" olayı geliyor — embed'in gerçekten yüklendiğinin kanıtı. */
  hazirSinyali: boolean;
}

export interface KopruOlayi {
  /** hazir: oynatıcı hazır · konum: gerçek saniye/süre · durum: oynuyor/duraklatıldı · yok: anlamsız yük */
  tur: 'hazir' | 'konum' | 'durum' | 'yok';
  saniye?: number;
  sure?: number;
  oynuyor?: boolean;
}

/**
 * Ölçüm sonucu (2026-10-02, `tools/kopru-komut-test.html`, 6 denemeli koşu).
 * `komut` yalnızca komut kanalı **kanıtlanmış** host'ta true olur; kanıt yoksa
 * düğme gösterilmez (ölü düğme, düğmesizlikten kötüdür).
 *
 *   VK            → nesne biçiminde komut 1. denemede çalıştı; `seeked`, `started`,
 *                   34× `timeupdate` ve `duration: 1450` geldi.
 *   Odnoklassniki → 6 denemede yalnız `initToParent` + `inited`; saniye/süre yok.
 *   Mail.ru       → 1. denemede `inited` + `autoplay`, sonrası sessiz; süre yok.
 *   Sibnet, Dailymotion → hiç olay yok (köprü listesinde değiller).
 */
const KOPRULER: Record<KopruAdi, Kopru> = {
  vk: { ad: 'vk', etiket: 'VK', komut: true, telemetri: true, hazirSinyali: true },
  ok: { ad: 'ok', etiket: 'Odnoklassniki', komut: false, telemetri: false, hazirSinyali: true },
  mail: { ad: 'mail', etiket: 'Mail.ru', komut: false, telemetri: false, hazirSinyali: true },
};

/** Host → köprü eşlemesi. Ölçümde cevap veren host'lar; alt alan adları da kapsanır. */
const ESLESME: { desen: RegExp; ad: KopruAdi }[] = [
  { desen: /(^|\.)(vk\.com|vk\.video|vk\.ru)$/i, ad: 'vk' },
  { desen: /(^|\.)(ok\.ru|odnoklassniki\.ru|m\.ok\.ru)$/i, ad: 'ok' },
  { desen: /(^|\.)(my\.mail\.ru|mail\.ru)$/i, ad: 'mail' },
];

/**
 * Arşivdeki sarmalayıcıyı çözer: `https://href.li/?https://vk.com/...` →
 * `https://vk.com/...`. Yüzde kodlanmış biçimi de destekler. Çözülemezse girdi
 * aynen döner (toplam fonksiyon; asla throw etmez).
 */
export function sarmalayiciCoz(adres: string): string {
  if (!adres) return adres;
  const m = /^https?:\/\/href\.li\/\?(.+)$/i.exec(adres.trim());
  if (!m) return adres;
  const ham = m[1];
  if (/^https?%3a/i.test(ham)) {
    try {
      return decodeURIComponent(ham);
    } catch {
      return ham;
    }
  }
  return ham;
}

/** VK embed'i API için `js_api=1` ister; diğer parametreleri korur. */
function vkApiAc(adres: string): string {
  try {
    const u = new URL(adres);
    if (u.searchParams.get('js_api') === '1') return adres;
    u.searchParams.set('js_api', '1');
    return u.toString();
  } catch {
    return adres;
  }
}

/**
 * iframe'e verilecek gerçek adres: sarmalayıcı çözülür, köprü varsa oynatıcı
 * API'si etkinleştirilir. Sarmalayıcısız ve köprüsüz adresler dokunulmadan döner.
 */
export function kaynakAdresi(adres: string): string {
  const cozulmus = sarmalayiciCoz(adres);
  const kopru = kopruBul(cozulmus);
  if (kopru?.ad === 'vk') return vkApiAc(cozulmus);
  return cozulmus;
}

/** Adresteki host köprüyü destekliyorsa köprü kaydını, yoksa null döner. */
export function kopruBul(adres: string): Kopru | null {
  if (!adres) return null;
  let host: string;
  try {
    host = new URL(sarmalayiciCoz(adres)).hostname;
  } catch {
    return null;
  }
  for (const { desen, ad } of ESLESME) {
    if (desen.test(host)) return KOPRULER[ad];
  }
  return null;
}

/** Köprünün olay gönderdiği origin (mesaj filtrelemesi için). */
export function kopruOrigin(ad: KopruAdi): string {
  if (ad === 'vk') return 'https://vk.com';
  if (ad === 'ok') return 'https://ok.ru';
  return 'https://my.mail.ru';
}

/**
 * Komut gövde adayları. **Nesne** döner — ölçümde metin biçimi cevapsız kaldı.
 * Birden fazla biçim denenir çünkü aynı ailenin host'ları farklı alan adı
 * kullanabiliyor; sıra, en olası biçim önce gelecek şekilde.
 */
export function komutlar(ad: KopruAdi, eylem: KopruEylem, saniye = 0): unknown[] {
  if (eylem === 'oynat') return [{ method: 'play' }];
  if (eylem === 'duraklat') return [{ method: 'pause' }];
  /* `time` ölçümde çalışan alan adı; `seconds` değil (o biçim hedefi
     değiştirmedi). Yine de ikinci aday olarak duruyor, zararsız. */
  if (ad === 'vk') return [{ method: 'seek', time: saniye }];
  return [
    { method: 'seek', time: saniye },
    { method: 'seek', seconds: saniye },
  ];
}

function sayi(deger: unknown): number | undefined {
  return typeof deger === 'number' && Number.isFinite(deger) ? deger : undefined;
}

function nesneCoz(veri: unknown): Record<string, unknown> | null {
  if (veri && typeof veri === 'object') return veri as Record<string, unknown>;
  if (typeof veri !== 'string') return null;
  const kirp = veri.trim();
  if (!kirp.startsWith('{')) return null;
  try {
    const v = JSON.parse(kirp);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Gelen postMessage yükünü tek biçime indirger. Host'ların yük şemaları
 * birbirinden farklı (VK düz olay nesnesi, OK `data` içinde, Mail.ru bazen
 * düz metin "inited") — hepsi burada normalleştirilir. Tanınmayan yük `yok`.
 */
export function olayCoz(veri: unknown): KopruOlayi {
  /* Mail.ru hazır işaretini bazen düz metin (`inited`), bazen JSON ile
     kodlanmış tırnaklı metin (`"inited"`) olarak gönderiyor — ikisi de kabul. */
  if (typeof veri === 'string') {
    let metin = veri.trim();
    if (metin.startsWith('"') && metin.endsWith('"')) {
      try {
        const parsed = JSON.parse(metin);
        if (typeof parsed === 'string') metin = parsed.trim();
      } catch {
        /* tırnaklı ama bozuk: metin olarak denenir */
      }
    }
    if (metin.toLowerCase() === 'inited') return { tur: 'hazir' };
  }

  let v = nesneCoz(veri);
  if (!v) return { tur: 'yok' };

  /* OK: { data: { type: 'initToParent', ... } } */
  if (v.data && typeof v.data === 'object') {
    const ic = v.data as Record<string, unknown>;
    if (ic.type === 'initToParent') return { tur: 'hazir' };
    v = { ...ic, ...v };
  }

  const olayAdi = typeof v.event === 'string' ? v.event.toLowerCase() : '';
  const durum = typeof v.state === 'string' ? v.state.toLowerCase() : '';
  const saniye = sayi(v.time) ?? sayi(v.currentTime);
  const sure = sayi(v.duration);
  const oynuyor =
    durum === 'playing' || olayAdi === 'started' || olayAdi === 'playing'
      ? true
      : durum === 'paused' || olayAdi === 'paused'
        ? false
        : undefined;

  if (olayAdi === 'inited' || durum === 'inited') {
    return { tur: 'hazir', saniye, sure };
  }
  if (saniye !== undefined || sure !== undefined) {
    return { tur: 'konum', saniye, sure, oynuyor };
  }
  if (oynuyor !== undefined) return { tur: 'durum', saniye, sure, oynuyor };
  return { tur: 'yok' };
}

/**
 * Aynı komutu kaç kez yineleyeceğimiz. Ölçümde komut, oynatıcı dinleyiciyi
 * kurmadan gönderildiğinde sessizce kayboluyordu; bu yüzden komut, onay olayı
 * gelene kadar (en fazla bu kadar) yinelenir.
 */
export const KOMUT_DENEME_SAYISI = 6;

/** Denemeler arası bekleme (ms). Oynatıcının dinleyici kurması zaman alıyor. */
export const KOMUT_DENEME_ARASI_MS = 4000;

/** `n`. denemenin gönderileceği an (ms). 0 tabanlı. */
export function komutZamanlamasi(n: number, arasi = KOMUT_DENEME_ARASI_MS): number {
  return Math.max(0, Math.trunc(n)) * arasi;
}

/** Sar komutunun onayında kabul edilen sapma (oynatıcı örneklemesi kayabilir). */
export const SAR_TOLERANS_SANIYE = 8;

/**
 * Gelen olay, gönderdiğimiz komutun **etki ettiğini** kanıtlıyor mu?
 *
 * Neden gerekli: ölçümde komut, oynatıcı dinleyiciyi kurmadan gönderildiğinde
 * sessizce kayboldu. Bu yüzden komut yinelenir ve ancak bu fonksiyon true
 * döndüğünde tekrar durdurulur — "gönderdim, oldu sayılır" varsayımı yok.
 */
export function komutOnaylandi(eylem: KopruEylem, hedef: number, olay: KopruOlayi): boolean {
  if (olay.tur === 'yok') return false;
  if (eylem === 'oynat') return olay.oynuyor === true;
  if (eylem === 'duraklat') return olay.oynuyor === false;
  /* Sar: hedef saniyeye yakın bir konum bildirimi geldiyse uygulanmıştır. */
  return (
    olay.tur === 'konum' &&
    typeof olay.saniye === 'number' &&
    Math.abs(olay.saniye - hedef) <= SAR_TOLERANS_SANIYE
  );
}

/**
 * Saniyeyi oynatıcı saatine çevirir: `1450 → 24:10`, `3725 → 1:02:05`.
 * Köprünün telemetrisi yalnızca burada üretildiği için biçimleyici de burada:
 * gerçek süre bilgisi başka hiçbir modülden gelmiyor.
 */
export function medyaSaati(saniye: number): string {
  if (!Number.isFinite(saniye) || saniye <= 0) return '0:00';
  const t = Math.floor(saniye);
  const iki = (n: number) => String(n).padStart(2, '0');
  const saat = Math.floor(t / 3600);
  const dakika = Math.floor(t / 60) % 60;
  const saniyeKalan = t % 60;
  return saat ? `${saat}:${iki(dakika)}:${iki(saniyeKalan)}` : `${dakika}:${iki(saniyeKalan)}`;
}
