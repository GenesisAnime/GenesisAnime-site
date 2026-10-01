/**
 * ortak.mjs — veri hattının ortak yardımcıları
 * ------------------------------------------------------------------
 * Veri üreteçleri (export-data, enrich-anilist, report-data) buradan
 * yol, normalizasyon ve tür eşleme bilgilerini alır.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Arşiv kökü: içinde "Yeni turkanimetv arsiv", "Linkleri tespit etme araçları" bulunan klasör. */
export const ARSIV = process.env.GENESIS_ARSIV
  ? path.resolve(process.env.GENESIS_ARSIV)
  : path.resolve(ROOT, '..', '..');

export const YOLLAR = {
  db: process.env.GENESIS_DB
    ? path.resolve(process.env.GENESIS_DB)
    : path.join(ARSIV, 'Yeni turkanimetv arsiv', 'güncel database', 'turkanime-v1 - güncel database.db'),
  health: process.env.GENESIS_HEALTH
    ? path.resolve(process.env.GENESIS_HEALTH)
    : path.join(ARSIV, 'Linkleri tespit etme araçları', 'kontrol_gecmisi.jsonl'),
  /** Kendi tarayıcımızın (tools/link-tara.mjs) artımlı durum dosyası. */
  linkDurum: process.env.GENESIS_LINK_DURUM
    ? path.resolve(process.env.GENESIS_LINK_DURUM)
    : path.join(ROOT, 'tools', 'cache', 'link-durum.jsonl'),
  /** Tarayıcının host bazlı sağlık/soğuma kaydı. */
  linkHost: path.join(ROOT, 'tools', 'cache', 'link-tarama-host.json'),
  /** Kullanıcı bildirimleri (bildirim servisinden çekilen doğrulanmış URL'ler). */
  bildirim: process.env.GENESIS_BILDIRIM
    ? path.resolve(process.env.GENESIS_BILDIRIM)
    : path.join(ROOT, 'tools', 'cache', 'bildirim.jsonl'),
  anilistCache: path.join(ROOT, 'tools', 'cache', 'anilist.json'),
  anilistRapor: path.join(ROOT, 'tools', 'cache', 'anilist-rapor.json'),
  publicData: path.join(ROOT, 'public', 'data'),
  animeData: path.join(ROOT, 'public', 'data', 'anime'),
  generated: path.join(ROOT, 'src', 'generated'),
  rapor: path.join(ROOT, 'tools', 'rapor'),
};

export function varMiYol(p) {
  return fs.existsSync(p);
}

export function yazJson(dosya, veri, girintisiz = false) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.writeFileSync(dosya, girintisiz ? JSON.stringify(veri) : JSON.stringify(veri, null, 2), 'utf8');
  return fs.statSync(dosya).size;
}

export function okuJson(dosya, varsayilan = null) {
  if (!fs.existsSync(dosya)) return varsayilan;
  return JSON.parse(fs.readFileSync(dosya, 'utf8'));
}

export function kb(bayt) {
  return `${(bayt / 1024).toFixed(1)} KB`;
}

export function mb(bayt) {
  return `${(bayt / 1024 / 1024).toFixed(2)} MB`;
}

export function log(...a) {
  console.log(...a);
}

export function baslik(metin) {
  console.log('\n' + '─'.repeat(70));
  console.log(metin);
  console.log('─'.repeat(70));
}

/* ---------------------------------------------------------------- */
/* Türkçe metin normalizasyonu (arama için)                          */
/* ---------------------------------------------------------------- */

const TR_KUCUK = { İ: 'i', I: 'ı', Ş: 'ş', Ğ: 'ğ', Ü: 'ü', Ö: 'ö', Ç: 'ç' };

const ASKI_MAP = {
  ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u',
  é: 'e', è: 'e', ê: 'e', ñ: 'n', å: 'a', ä: 'a', ö: 'o', ø: 'o', æ: 'ae', ß: 'ss',
};

/** Türkçe kurallarına uygun küçük harf + aksan sadeleştirme. */
export function araAnahtari(metin) {
  if (!metin) return '';
  let s = '';
  for (const ch of metin) s += TR_KUCUK[ch] ?? ch;
  s = s.toLowerCase();
  let out = '';
  for (const ch of s) out += ASKI_MAP[ch] ?? ch;
  return out
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/* ---------------------------------------------------------------- */
/* Tür eşlemesi: AniList cinsiyetsiz tür listesi -> Türkçe kategoriler */
/* ---------------------------------------------------------------- */

/** AniList `genres` değerleri için doğrudan Türkçe karşılıklar. */
export const ANILIST_TUR = {
  Action: 'Aksiyon',
  Adventure: 'Macera',
  Comedy: 'Komedi',
  Drama: 'Dram',
  Ecchi: 'Ecchi',
  Fantasy: 'Fantastik',
  Horror: 'Korku',
  'Mahou Shoujo': 'Mahou Shoujo',
  Mecha: 'Mecha',
  Music: 'Müzik',
  Mystery: 'Gizem',
  Psychological: 'Psikolojik',
  Romance: 'Romantik',
  'Sci-Fi': 'Bilim Kurgu',
  'Slice of Life': 'Günlük Yaşam',
  Sports: 'Spor',
  Supernatural: 'Doğaüstü',
  Thriller: 'Gerilim',
};

/** AniList etiketlerinden (tags) kurtarılabilecek ek kategoriler. */
export const ETIKET_TUR = {
  action: 'Aksiyon',
  adventure: 'Macera',
  comedy: 'Komedi',
  drama: 'Dram',
  fantasy: 'Fantastik',
  romance: 'Romantik',
  'sci-fi': 'Bilim Kurgu',
  'science fiction': 'Bilim Kurgu',
  thriller: 'Gerilim',
  mystery: 'Gizem',
  horror: 'Korku',
  psychological: 'Psikolojik',
  supernatural: 'Doğaüstü',
  sports: 'Spor',
  mecha: 'Mecha',
  music: 'Müzik',
  ecchi: 'Ecchi',
  isekai: 'Isekai',
  'time travel': 'Zaman Yolculuğu',
  'school life': 'Okul',
  school: 'Okul',
  historical: 'Tarihi',
  military: 'Askeri',
  'martial arts': 'Dövüş Sanatları',
  detective: 'Dedektif',
  'coming of age': 'Büyüme Hikâyesi',
  'survival': 'Hayatta Kalma',
  'post-apocalyptic': 'Kıyamet Sonrası',
  'post apocalyptic': 'Kıyamet Sonrası',
  'female protagonist': 'Kadın Başrol',
  'male protagonist': 'Erkek Başrol',
  'love triangle': 'Üçgen Aşk',
  vampire: 'Vampir',
  'demons': 'Şeytanlar',
  'space': 'Uzay',
  'military': 'Askeri',
  'music': 'Müzik',
  'idol': 'İdol',
  'cooking': 'Yemek',
  'gambling': 'Kumar',
  'delinquents': 'Serseriler',
  'reincarnation': 'Reenkarnasyon',
  'video games': 'Video Oyunları',
  'crime': 'Suç',
  'super power': 'Süper Güçler',
  'cyberpunk': 'Cyberpunk',
  'anthropomorphism': 'Antropomorfizm',
};

/** Katalogda gösterilecek kategori listesi (sıralama burada belirlenir). */
export const TUR_SIRA = [
  'Aksiyon', 'Macera', 'Komedi', 'Dram', 'Fantastik', 'Bilim Kurgu', 'Romantik',
  'Gizem', 'Gerilim', 'Korku', 'Psikolojik', 'Doğaüstü', 'Günlük Yaşam', 'Spor',
  'Müzik', 'Mecha', 'Isekai', 'Okul', 'Tarihi', 'Askeri', 'Dövüş Sanatları',
  'Kıyamet Sonrası', 'Zaman Yolculuğu', 'Cyberpunk', 'Vampir', 'Dedektif',
  'Büyüme Hikâyesi', 'Hayatta Kalma', 'Mahou Shoujo', 'Ecchi', 'Suç',
  'Video Oyunları', 'Reenkarnasyon', 'Kadın Başrol', 'Erkek Başrol',
];

const TUR_ONCELIK = new Map(TUR_SIRA.map((t, i) => [t, i]));

/** Ham tür/etiket metnini (büyük-küçük harf farkı gözetmeden) Türkçe kategoriye çevirir. */
const TUR_ESLEME = new Map();
for (const [k, v] of Object.entries(ANILIST_TUR)) TUR_ESLEME.set(k.toLowerCase(), v);
for (const [k, v] of Object.entries(ETIKET_TUR)) TUR_ESLEME.set(k.toLowerCase(), v);

export function turEsle(ham) {
  if (!ham) return null;
  const metin = String(ham).trim();
  return ANILIST_TUR[metin] || TUR_ESLEME.get(metin.toLowerCase()) || null;
}

export function turSirala(a, b) {
  const ia = TUR_ONCELIK.has(a) ? TUR_ONCELIK.get(a) : 999;
  const ib = TUR_ONCELIK.has(b) ? TUR_ONCELIK.get(b) : 999;
  return ia - ib || a.localeCompare(b, 'tr');
}

/* ---------------------------------------------------------------- */
/* Link sağlık durumu                                                 */
/* ---------------------------------------------------------------- */

export const DURUM = {
  OK: 'ok',
  OLU: 'olu',
  ENGELLI: 'engelli',
  BELIRSIZ: 'belirsiz',
  BILINMIYOR: 'bilinmiyor',
};

/** Sitede rozet alan ve gizlenen durumlar (ADR-0003). */
export const KESIN_DURUMLAR = [DURUM.OK, DURUM.OLU, DURUM.ENGELLI];

const DURUM_ESLEME = {
  'ok': DURUM.OK,
  'çalışıyor': DURUM.OK,
  'calisiyor': DURUM.OK,
  'çalışmıyor': DURUM.OLU,
  'ölü': DURUM.OLU,
  'olu': DURUM.OLU,
  'engellendi': DURUM.ENGELLI,
  'engelli': DURUM.ENGELLI,
  'belirsiz': DURUM.BELIRSIZ,
};

/**
 * Link kontrol geçmişini (JSONL) okur.
 *
 * İki kaynak birleştirilir:
 *   1. arşivdeki eski araç kaydı  (kontrol_gecmisi.jsonl, salt okunur)
 *   2. kendi tarayıcımızın kaydı  (tools/cache/link-durum.jsonl)
 * Sonra okunan dosya kazanır; aynı URL iki dosyada varsa yeni ölçüm geçerlidir.
 * Dosya içinde de son satır geçerlidir (satırlar zaman sıralı yazılıyor).
 */
export function saglikOku(dosyalar = [YOLLAR.health, YOLLAR.linkDurum]) {
  const map = new Map(); // url -> { durum, sebep, zaman, kaynak }
  const liste = Array.isArray(dosyalar) ? dosyalar : [dosyalar];
  for (const dosya of liste) {
    if (!dosya || !fs.existsSync(dosya)) continue;
    const icerik = fs.readFileSync(dosya, 'utf8');
    for (const satir of icerik.split(/\r?\n/)) {
      if (!satir.trim()) continue;
      let kayit;
      try {
        kayit = JSON.parse(satir);
      } catch {
        continue;
      }
      const url = kayit.url;
      if (!url) continue;
      const durum = DURUM_ESLEME[(kayit.durum || '').trim().toLowerCase()] || DURUM.BILINMIYOR;
      map.set(url, {
        durum,
        sebep: kayit.sebep || '',
        zaman: kayit.zaman || '',
        kaynak: kayit.kaynak || '',
        host: kayit.host || hostAl(url),
        player: kayit.player || '',
      });
    }
  }
  return map;
}

export function hostAl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/* ---------------------------------------------------------------- */
/* Bölüm numarası / etiketi çıkarımı                                  */
/* ---------------------------------------------------------------- */

/**
 * Bölüm slug'ından görüntülenecek numara etiketi üretir.
 *   12-bolum        -> "12"
 *   12-5-bolum      -> "12.5"   (küsuratlı bölüm)
 *   special / movie -> null     (sıra numarası kullanılır)
 */
export function bolumNoCikar(slug) {
  const m = /-(\d+)-(\d+)-bolum$/.exec(slug);
  if (m) return `${Number(m[1])}.${m[2]}`;
  const m2 = /-(\d+)-bolum$/.exec(slug);
  if (m2) return m2[1];
  return null;
}

/** Bölüm adından anime adını çıkarıp kısa etiket üretir. */
export function bolumEtiketi(bolumAd, animeAd) {
  if (!bolumAd) return '';
  if (animeAd && bolumAd.toLowerCase().startsWith(animeAd.toLowerCase())) {
    return bolumAd.slice(animeAd.length).trim();
  }
  return bolumAd.trim();
}

/** full_info alanından URL'leri temizler, aşırı uzun metni kısaltır. */
/**
 * Metnin başındaki/sonundaki ayraç artıklarını kırpar.
 * DİKKAT: karakter sınıfında tire MUTLAKA kaçışlı (`\-`) yazılmalı. Kaçışsız tire
 * bir aralık oluşturur (`[\s/\\-–—,.]` → `\` ile `–` arası TÜM karakterler) ve
 * kelimelerin sonundaki harfleri siler ("Rinrintan" -> "R").
 */
const BAS_KIRP = /^[\s/–—,.\-]+/;
const SON_KIRP = /[\s/–—,.\-]+$/;

export function ekipBilgisiTemizle(metin, sinir = 220) {
  if (!metin) return '';
  let s = metin.replace(/https?:\/\/\S+/g, ' ');
  // " | " ile ayrılmış parçaları temizle (baş/son ayraç artıkları)
  s = s
    .split('|')
    .map((p) => p.replace(BAS_KIRP, '').replace(SON_KIRP, '').trim())
    .filter(Boolean)
    .join(' | ');
  // art arda gelen ayraçları teke indir: "Rinrintan / /" -> "Rinrintan"
  s = s.replace(/(?:\s*[/\\]\s*){2,}/g, ' / ').replace(/\s{2,}/g, ' ').trim();
  s = s.replace(BAS_KIRP, '').replace(SON_KIRP, '');
  if (!s || /^[|\s/-]*$/.test(s)) return '';
  if (s.length > sinir) s = s.slice(0, sinir - 1).trimEnd() + '…';
  return s;
}
