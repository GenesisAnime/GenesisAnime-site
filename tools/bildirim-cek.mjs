/**
 * bildirim-cek.mjs — API'deki kullanıcı bildirimlerini yerel tarama kuyruğuna çeker
 * ================================================================================
 * Oynatıcıdaki "Kaynak çalışmıyor" düğmesi, oturum açmış/anonim kullanıcıdan
 * API'ye (api/, Cloudflare Workers) bir bildirim yazar. Bu araç o kayıtları
 * `tools/cache/bildirim.jsonl` dosyasına aktarır; `link-tara.mjs --bildirim`
 * de bu dosyayı okuyup bildirilen URL'leri kuyruğun ÖNÜNE alır.
 *
 * Önemli: bildirim bir KARAR değil, yalnızca önceliktir. URL yine taranır,
 * durumu somut kanıtla belirlenir (bkz. AGENTS §1.4b, ADR-0003).
 *
 * Kullanım:
 *   GENESIS_API_URL=https://genesisanime-api.<hesap>.workers.dev \
 *   GENESIS_ADMIN_TOKEN=... npm run link:bildirim
 *   npm run link:bildirim -- --api=... --token=... --gun=7 --kuru
 *   npm run link:bildirim -- --dosya=rapor.json        (çevrimdışı içe aktarma)
 *
 * Çıktı: tools/cache/bildirim.jsonl (append-only; aynı url+anime+bölüm tekrar yazılmaz)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { YOLLAR, hostAl, log, baslik, kb } from './lib/ortak.mjs';

const DOGRUDAN = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;

/* ================================================================ */
/* 0 · Ayarlar                                                       */
/* ================================================================ */

export const AYAR = {
  api: process.env.GENESIS_API_URL || '',
  token: process.env.GENESIS_ADMIN_TOKEN || '',
  durum: 'yeni',
  sinir: 1000,
  /** Yalnızca bu kadar günden yeni bildirimler aktarılır (link-tara ile aynı pencere). */
  gun: 30,
  dosya: '',
  kuru: false,
  sessiz: false,
};

function yardim() {
  console.log(`
bildirim-cek.mjs — kullanıcı bildirimlerini tarama kuyruğuna aktarır

  --api=URL        Worker adresi (yoksa GENESIS_API_URL)
  --token=JETON    yönetici jetonu (yoksa GENESIS_ADMIN_TOKEN)
  --durum=D        hangi durumdaki bildirimler çekilsin    (varsayılan yeni)
  --sinir=N        en fazla kaç kayıt çekilsin              (varsayılan 1000)
  --gun=N          yalnızca son N gün içindeki kayıtlar     (varsayılan 30)
  --dosya=YOL      ağ yerine yerel JSON/JSONL dosyasından oku (çevrimdışı)
  --kuru           yazmaz, yalnızca rapor verir
`);
}

if (DOGRUDAN) {
  for (const arg of process.argv.slice(2)) {
    const [anahtar, deger] = arg.replace(/^--/, '').split('=');
    switch (anahtar) {
      case 'yardim':
      case 'help':
        yardim();
        process.exit(0);
      case 'kuru':
        AYAR.kuru = true;
        break;
      case 'api':
        AYAR.api = deger || '';
        break;
      case 'token':
        AYAR.token = deger || '';
        break;
      case 'durum':
        AYAR.durum = deger || 'yeni';
        break;
      case 'dosya':
        AYAR.dosya = deger || '';
        break;
      case 'sinir':
        AYAR.sinir = Math.max(1, Number(deger) || 1000);
        break;
      case 'gun':
        AYAR.gun = Math.max(1, Number(deger) || 30);
        break;
      default:
        console.log(`   [i] bilinmeyen bayrak yok sayıldı: --${anahtar}=${deger ?? ''}`);
    }
  }
}

/* ================================================================ */
/* 1 · Saf yardımcılar (testler buradan kullanır)                    */
/* ================================================================ */

// Arşivdeki en uzun anime slug'ı 144 karakter (API ile aynı sınır).
const SLUG_DESENI = /^[a-z0-9][a-z0-9-]{0,199}$/;

/**
 * API/D1 kaydını kuyruk satırına çevirir; geçersiz satırı null döndürür.
 * Alanlar daraltılır: url (http/https), anime (slug), bölüm (pozitif tam sayı),
 * tur (bilinen değerler), zaman (ISO).
 */
export function bildirimKaydi(ham) {
  if (!ham || typeof ham !== 'object') return null;
  const url = typeof ham.url === 'string' ? ham.url.trim() : '';
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (ham.anime && !SLUG_DESENI.test(String(ham.anime))) return null;

  const bolum = Number.parseInt(ham.bolum, 10);
  const tur = ['calismiyor', 'eksik', 'yanlis-bolum', 'donuk'].includes(ham.tur) ? ham.tur : 'calismiyor';
  return {
    url,
    host: hostAl(url),
    anime: ham.anime ? String(ham.anime) : null,
    bolum: Number.isInteger(bolum) && bolum > 0 ? bolum : null,
    tur,
    zaman: typeof ham.zaman === 'string' && !Number.isNaN(Date.parse(ham.zaman)) ? ham.zaman : new Date().toISOString(),
  };
}

/** Kuyruk satırının kimliği: aynı kaynak + aynı bölüm tek satırdır. */
export function kayitKimligi(k) {
  return `${k.url}|${k.anime ?? ''}|${k.bolum ?? ''}`;
}

/** Mevcut JSONL'i kimlik kümesine çevirir (bozuk satırlar yok sayılır). */
export function mevcutKimlikler(dosya = YOLLAR.bildirim) {
  const kume = new Set();
  if (!fs.existsSync(dosya)) return kume;
  for (const satir of fs.readFileSync(dosya, 'utf8').split(/\r?\n/)) {
    if (!satir.trim()) continue;
    try {
      const k = bildirimKaydi(JSON.parse(satir));
      if (k) kume.add(kayitKimligi(k));
    } catch {
      /* bozuk satır yok sayılır */
    }
  }
  return kume;
}

/**
 * Gelen ham kayıtları süzer: geçersizleri at, yaşlıları at, dosyada ve
 * partide tekrarları at. `{ yeni, gecersiz, eski, tekrar }` sayaçlarını da döndürür.
 */
export function yeniKayitlar(hamListe, mevcut = new Set(), simdi = Date.now()) {
  const esik = simdi - AYAR.gun * 86_400_000;
  const sayac = { gecersiz: 0, eski: 0, tekrar: 0 };
  const yeni = [];
  const gorulen = new Set();
  for (const ham of hamListe || []) {
    const k = bildirimKaydi(ham);
    if (!k) {
      sayac.gecersiz++;
      continue;
    }
    if (Date.parse(k.zaman) < esik) {
      sayac.eski++;
      continue;
    }
    const kimlik = kayitKimligi(k);
    if (mevcut.has(kimlik) || gorulen.has(kimlik)) {
      sayac.tekrar++;
      continue;
    }
    gorulen.add(kimlik);
    yeni.push(k);
  }
  return { yeni, ...sayac };
}

/* ================================================================ */
/* 2 · Kaynak okuma                                                  */
/* ================================================================ */

async function apiOku() {
  if (!AYAR.api) throw new Error('API adresi yok: --api=... ya da GENESIS_API_URL gerekli');
  if (!AYAR.token) throw new Error('Yönetici jetonu yok: --token=... ya da GENESIS_ADMIN_TOKEN gerekli');
  const url = `${AYAR.api.replace(/\/$/, '')}/bildirim?durum=${encodeURIComponent(AYAR.durum)}&limit=${AYAR.sinir}`;
  const yanit = await fetch(url, { headers: { Authorization: `Bearer ${AYAR.token}` } });
  if (!yanit.ok) throw new Error(`API yanıtı ${yanit.status}: ${(await yanit.text()).slice(0, 200)}`);
  const govde = await yanit.json();
  if (!govde || !Array.isArray(govde.kayitlar)) throw new Error('API beklenen biçimde kayıt döndürmedi');
  return govde.kayitlar;
}

function dosyaOku(dosya) {
  const ham = fs.readFileSync(dosya, 'utf8');
  const icerik = ham.trim().startsWith('[') || ham.trim().startsWith('{') ? JSON.parse(ham) : ham
    .split(/\r?\n/)
    .filter(Boolean)
    .map((s) => JSON.parse(s));
  if (Array.isArray(icerik)) return icerik;
  return Array.isArray(icerik.kayitlar) ? icerik.kayitlar : [];
}

/* ================================================================ */
/* 3 · CLI akışı                                                     */
/* ================================================================ */

if (DOGRUDAN) {
  baslik('bildirim-cek — kullanıcı bildirimleri → tools/cache/bildirim.jsonl');

  try {
    const mevcut = mevcutKimlikler();
    const ham = AYAR.dosya ? dosyaOku(AYAR.dosya) : await apiOku();
    const { yeni, gecersiz, eski, tekrar } = yeniKayitlar(ham, mevcut);

    log(`   kaynak      : ${AYAR.dosya ? AYAR.dosya : `${AYAR.api} (durum: ${AYAR.durum})`}`);
    log(`   gelen satır : ${ham.length.toLocaleString('tr-TR')}`);
    log(`   yeni        : ${yeni.length.toLocaleString('tr-TR')}`);
    log(`   tekrar      : ${tekrar.toLocaleString('tr-TR')}`);
    log(`   eski (>${AYAR.gun}g): ${eski.toLocaleString('tr-TR')}`);
    log(`   geçersiz    : ${gecersiz.toLocaleString('tr-TR')}`);
    log(`   dosyada     : ${mevcut.size.toLocaleString('tr-TR')} kayıt`);

    const hostlar = new Map();
    for (const k of yeni) hostlar.set(k.host, (hostlar.get(k.host) || 0) + 1);
    const ilk = [...hostlar.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (ilk.length) log(`   host dağılımı: ${ilk.map(([h, n]) => `${h} ${n}`).join(' · ')}`);

    if (AYAR.kuru) {
      log('\n   [kuru] hiçbir şey yazılmadı.');
      if (yeni.length) log(`   örnek: ${yeni.slice(0, 3).map((k) => `${k.host}${k.anime ? ` · ${k.anime}` : ''}`).join(' | ')}`);
    } else if (yeni.length) {
      fs.mkdirSync(path.dirname(YOLLAR.bildirim), { recursive: true });
      fs.appendFileSync(YOLLAR.bildirim, yeni.map((k) => JSON.stringify(k)).join('\n') + '\n', 'utf8');
      const boyut = fs.statSync(YOLLAR.bildirim).size;
      log(`\n   yazıldı: ${path.relative(process.cwd(), YOLLAR.bildirim)} → ${mevcut.size + yeni.length} kayıt (${kb(boyut)})`);
      log('   sonraki adım: npm run link:tara -- --bildirim --dilim=2000');
    } else {
      log('\n   yazılacak yeni bildirim yok.');
    }
  } catch (hata) {
    console.error(`   [x] ${hata.message}`);
    process.exit(1);
  }
}
