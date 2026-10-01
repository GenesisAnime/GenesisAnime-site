/**
 * enrich-anilist.mjs — AniList zenginleştirmesi
 * ==================================================================
 * Arşiv veritabanındaki `anime_meta.anilist_id` eşleşmelerini kullanır
 * (5.850 anime) ve AniList GraphQL'den şu alanları çeker:
 *   banner, kapak (extraLarge), özet, gerçek türler, etiketler,
 *   ilişkili yapımlar (SEQUEL/PREQUEL/SIDE_STORY/SPIN_OFF/ALTERNATIVE),
 *   fragman ve yasal izleme bağlantıları (externalLinks type=STREAMING).
 *
 * Neden gerekli: arşiv veritabanında `banner_url`, `summary` ve
 * `relations_json` kolonları tamamen boş (0 kayıt).
 *
 * Özellikler:
 *   - Toplu istek: Page(perPage: 50) + media(id_in: [...])  → ~117 istek
 *   - Disk önbelleği: tools/cache/anilist/<ilk>-<son>.json (durdur/tekrar çalıştır)
 *   - Hız sınırı: istekler arası 700 ms (AniList 90 istek/dk)
 *   - 429/5xx için artan bekleme ile 4 deneme
 *
 * Kullanım:
 *   npm run veri:anilist              tümünü çek
 *   npm run veri:anilist -- --limit 300    ilk 300 anime ile dene
 *   npm run veri:anilist -- --yenile       önbelleği yok say
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { YOLLAR, log, baslik, okuJson, varMiYol } from './lib/ortak.mjs';

const API = 'https://graphql.anilist.co';
const PARCA_BOYUT = 50;
const BEKLEME_MS = 700;
const EN_FAZLA_DENEME = 4;

const argv = process.argv.slice(2);
function argVar(ad) {
  return argv.includes(ad);
}
function argDeger(ad) {
  const i = argv.indexOf(ad);
  return i >= 0 ? argv[i + 1] : null;
}

const LIMIT = argDeger('--limit') ? Number(argDeger('--limit')) : Infinity;
const YENILE = argVar('--yenile');

const SORGU = `query($ids: [Int]) {
  Page(page: 1, perPage: ${PARCA_BOYUT}) {
    media(id_in: $ids, type: ANIME) {
      id
      idMal
      title { romaji english native }
      coverImage { extraLarge large color }
      bannerImage
      description(asHtml: false)
      genres
      tags { name rank }
      format
      status
      season
      seasonYear
      episodes
      duration
      averageScore
      trailer { id site }
      externalLinks { site url type }
      relations {
        edges {
          relationType
          node { id type format title { romaji english } coverImage { large } }
        }
      }
    }
  }
}`;

/* ---------------------------------------------------------------- */
/* Metin temizleme                                                    */
/* ---------------------------------------------------------------- */

const VARLIKLAR = {
  '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ',
  '&#039;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
  '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&middot;': '·',
  '&eacute;': 'é', '&uuml;': 'ü', '&ouml;': 'ö', '&ccedil;': 'ç', '&deg;': '°',
};

function varlikCoz(metin) {
  return metin
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&[a-zA-Z]+;/g, (m) => VARLIKLAR[m] ?? '');
}

/** AniList açıklaması HTML çıkarılmış düz metne çevrilir. */
function ozetTemizle(html, sinir = 2000) {
  if (!html) return null;
  let s = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  s = varlikCoz(s)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (s.length > sinir) s = s.slice(0, sinir - 1).trimEnd() + '…';
  return s || null;
}

/** İlişki türlerinden anlamlı olanlar; ADAPTATION (manga/novel kaynağı) alınmaz. */
const ILISKI_TURLERI = new Set([
  'SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'PARENT', 'SUMMARY', 'OTHER',
]);

/* ---------------------------------------------------------------- */
/* Girdi                                                              */
/* ---------------------------------------------------------------- */

baslik('1/4 · Arşivden AniList kimlikleri okunuyor');

if (!varMiYol(YOLLAR.db)) {
  console.error(`[!] Veritabanı bulunamadı: ${YOLLAR.db}`);
  process.exit(1);
}
const db = new DatabaseSync(YOLLAR.db, { readOnly: true });
const kimlikler = db
  .prepare('SELECT anime_id, anilist_id FROM anime_meta WHERE anilist_id IS NOT NULL ORDER BY anime_id')
  .all();
db.close();

/** anime_id -> anilist_id (ilişkileri arşiv slug'ına bağlamak için) */
const animeAnilist = new Map();
for (const k of kimlikler) animeAnilist.set(k.anime_id, Number(k.anilist_id));

let bekleyen = [...animeAnilist.values()];
if (Number.isFinite(LIMIT)) bekleyen = bekleyen.slice(0, LIMIT);
log(`   AniList kimliği: ${bekleyen.length} (toplam ${animeAnilist.size}) · parça boyutu ${PARCA_BOYUT}`);

/* ---------------------------------------------------------------- */
/* Önbellek                                                           */
/* ---------------------------------------------------------------- */

const onbellekDir = path.join(path.dirname(YOLLAR.anilistCache), 'anilist');
fs.mkdirSync(onbellekDir, { recursive: true });

const cache = okuJson(YOLLAR.anilistCache, {});

function parcaDosyasi(parca) {
  const ilk = parca[0];
  const son = parca[parca.length - 1];
  return path.join(onbellekDir, `${ilk}-${son}.json`);
}

/* ---------------------------------------------------------------- */
/* İstek                                                              */
/* ---------------------------------------------------------------- */

function uyu(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function anilistIste(ids, deneme = 1) {
  const yanit = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: SORGU, variables: { ids } }),
  });

  if (yanit.status === 429 || yanit.status >= 500) {
    if (deneme > EN_FAZLA_DENEME) throw new Error(`HTTP ${yanit.status} (deneme bitti)`);
    const bekle = Number(yanit.headers.get('retry-after')) * 1000 || 2000 * deneme ** 2;
    log(`   ! HTTP ${yanit.status} — ${bekle} ms bekleniyor (deneme ${deneme}/${EN_FAZLA_DENEME})`);
    await uyu(bekle);
    return anilistIste(ids, deneme + 1);
  }

  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);

  const govde = await yanit.json();
  if (govde.errors) {
    const mesaj = govde.errors.map((e) => e.message).join('; ');
    if (deneme > EN_FAZLA_DENEME) throw new Error(mesaj);
    log(`   ! GraphQL hatası: ${mesaj} — tekrar deneniyor`);
    await uyu(2000 * deneme);
    return anilistIste(ids, deneme + 1);
  }
  return govde.data.Page.media || [];
}

/** AniList media kaydını bizim kompakt biçime çevirir. */
function donustur(m) {
  const etiketler = (m.tags || [])
    .filter((t) => (t.rank ?? 0) >= 50)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, 18)
    .map((t) => t.name);

  const iliski = [];
  for (const e of (m.relations?.edges || [])) {
    const n = e?.node;
    if (!n || n.type !== 'ANIME') continue;
    if (!ILISKI_TURLERI.has(e.relationType)) continue;
    const ad = n.title?.english || n.title?.romaji;
    if (!ad) continue;
    iliski.push({
      t: e.relationType,
      id: n.id,
      ad,
      p: n.coverImage?.large || null,
      f: n.format || null,
    });
  }

  const yasal = [];
  for (const l of m.externalLinks || []) {
    if (l?.type !== 'STREAMING' || !l.url) continue;
    yasal.push({ a: l.site || 'Yasal kaynak', u: l.url });
    if (yasal.length >= 6) break;
  }

  return {
    id: m.id,
    mal: m.idMal || null,
    adEn: m.title?.english || null,
    adJp: m.title?.native || null,
    romaji: m.title?.romaji || null,
    ban: m.bannerImage || null,
    xl: m.coverImage?.extraLarge || m.coverImage?.large || null,
    renk: m.coverImage?.color || null,
    oz: ozetTemizle(m.description),
    tur: m.genres || [],
    etk: etiketler,
    yil: m.seasonYear || null,
    sezon: m.season || null,
    format: m.format || null,
    durum: m.status || null,
    bolum: m.episodes || null,
    sure: m.duration || null,
    puan: m.averageScore || null,
    frag: m.trailer?.id ? { site: m.trailer.site, id: m.trailer.id } : null,
    yasal,
    iliski,
  };
}

/* ---------------------------------------------------------------- */
/* Çekim                                                              */
/* ---------------------------------------------------------------- */

baslik('2/4 · AniList verisi çekiliyor');

const parcalar = [];
for (let i = 0; i < bekleyen.length; i += PARCA_BOYUT) parcalar.push(bekleyen.slice(i, i + PARCA_BOYUT));

let istekSayisi = 0;
let onbellektenGelen = 0;
let hataSayisi = 0;
const eksikler = [];

for (let i = 0; i < parcalar.length; i++) {
  const parca = parcalar[i];
  const dosya = parcaDosyasi(parca);

  if (!YENILE && fs.existsSync(dosya)) {
    const kayitlar = okuJson(dosya, []);
    for (const k of kayitlar) cache[String(k.id)] = k;
    onbellektenGelen++;
    continue;
  }

  try {
    const medyalar = await anilistIste(parca);
    const donusen = medyalar.map(donustur);
    fs.writeFileSync(dosya, JSON.stringify(donusen), 'utf8');
    for (const k of donusen) cache[String(k.id)] = k;
    const bulunan = new Set(donusen.map((k) => k.id));
    for (const id of parca) if (!bulunan.has(id)) eksikler.push(id);
    istekSayisi++;
  } catch (e) {
    hataSayisi++;
    log(`   ! Parça ${i + 1} başarısız: ${e.message}`);
    for (const id of parca) eksikler.push(id);
  }

  if (i % 10 === 9 || i === parcalar.length - 1) {
    log(`   ... ${i + 1}/${parcalar.length} parça (${Object.keys(cache).length} anime)`);
  }
  await uyu(BEKLEME_MS);
}

/* ---------------------------------------------------------------- */
/* Çıktı                                                             */
/* ---------------------------------------------------------------- */

baslik('3/4 · Önbellek birleştiriliyor');

fs.writeFileSync(YOLLAR.anilistCache, JSON.stringify(cache), 'utf8');

let banli = 0;
let ozetli = 0;
let turlu = 0;
let iliskili = 0;
let yasalli = 0;
let fragmanli = 0;
for (const k of Object.values(cache)) {
  if (k.ban) banli++;
  if (k.oz) ozetli++;
  if (k.tur?.length) turlu++;
  if (k.iliski?.length) iliskili++;
  if (k.yasal?.length) yasalli++;
  if (k.frag) fragmanli++;
}

const rapor = {
  zaman: new Date().toISOString(),
  istenen: bekleyen.length,
  onbellektenGelenParca: onbellektenGelen,
  agdanGelenParca: istekSayisi,
  hataliParca: hataSayisi,
  onbellektekiAnime: Object.keys(cache).length,
  bannerli: banli,
  ozetli,
  turlu,
  iliskili,
  yasalBaglantili: yasalli,
  fragmanli,
  bulunamayanKimlikSayisi: eksikler.length,
  onbellekDosyasi: YOLLAR.anilistCache,
  onbellekBoyutu: fs.statSync(YOLLAR.anilistCache).size,
};
fs.mkdirSync(path.dirname(YOLLAR.anilistRapor), { recursive: true });
fs.writeFileSync(YOLLAR.anilistRapor, JSON.stringify(rapor, null, 2), 'utf8');

baslik('4/4 · Özet');
log(`   önbellekte anime       : ${rapor.onbellektekiAnime}`);
log(`   banner / özet / tür    : ${banli} / ${ozetli} / ${turlu}`);
log(`   ilişkili yapım         : ${iliskili} anime`);
log(`   yasal izleme / fragman : ${yasalli} / ${fragmanli}`);
log(`   bulunamayan kimlik     : ${rapor.bulunamayanKimlikSayisi}`);
log(`   dosya boyutu           : ${(rapor.onbellekBoyutu / 1024 / 1024).toFixed(2)} MB`);
log(`   rapor                  : ${YOLLAR.anilistRapor}`);
