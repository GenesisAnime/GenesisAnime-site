/**
 * poster-esle.mjs — AniList kimliği OLMAYAN yapımlar için başlık eşleştirmesiyle
 * yüksek yoğunluk kapağı (`p2`) üretir
 * =================================================================================
 * Bağlam: `npm run poster:xl` yalnız arşiv veritabanındaki `anime_meta.anilist_id`
 * eşleşmelerini kullanır (5.850 yapım) ve oradan gelen kapakların bir kısmı
 * elenir — AniList'in `extraLarge` alanı bazı kayıtlarda **PNG** (326–903 KB,
 * aynı 460 px için JPEG'in 6 katı) ya da yalnız **medium** (230×331, MAL'ın
 * 225×320'sinden büyük değil) oluyor. Geriye kalan yapımların (6.107 − 5.850)
 * hiç AniList kimliği yok; bu araç onları **iki bağımsız yolla** eşler:
 *
 *   1. MAL kimliği (kesin): poster URL'i eski MAL şemasındaysa
 *      (`/images/anime/<klasör>/<MAL_kimliği>.jpg`) doğrudan `idMal_in` sorgusu
 *      yapılır ve AniList'in döndürdüğü kayıt **yalnız idMal birebir eşitse**
 *      kabul edilir — bu, ad benzerliğine hiç bakmayan kesin bir eşlemedir.
 *   2. Başlık araması: `Page(perPage: 8) { media(search: …) }` sonuçları arşiv
 *      başlıklarıyla (`ad`, `adEn`) karşılaştırılır ve üç şart birlikte aranır:
 *      ad benzerliği ≥ 0,90 (normalize edilmiş tam eşleşme 1,00), yıl farkı ≤ 1,
 *      format ailesi uyumlu. Yanlış eşleşme **boş kapaktan kötüdür**: kartta
 *      başka bir yapımın afişi görünür — bu yüzden kabul eşiği yüksek tutulur ve
 *      her karar gerekçesiyle rapora yazılır.
 *
 * Kabul edilen kapak da `poster:xl` ile aynı kurala tabidir: yalnız
 * `/cover/large/*.jpe?g` (PNG ve medium kazanç sağlamaz, bkz. yukarısı).
 *
 * Çıktılar:
 *   public/data/anime/*.json      → `"poster"` alanının ardına `"p2"` (tek alan)
 *   public/data/ana-sayfa.json    → hero/satır kartları da p2 alır (minified!)
 *   public/data/ana-sayfa-kartlar.json → kırpılmış kart dosyası yeniden üretilir
 *   tools/rapor/poster-esle.json  → eşleşme/ret gerekçeleriyle ölçüm raporu
 *
 * Kullanım:
 *   npm run poster:esle                 tüm hedefler
 *   npm run poster:esle -- --kuru       yalnız raporla, dosya yazma
 *   npm run poster:esle -- --yenile     arama önbelleğini yok say
 *   npm run poster:esle -- --limit 30   ilk 30 hedefle dene
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, YOLLAR, baslik, log, okuJson, varMiYol } from './lib/ortak.mjs';
import { baslikBenzerligi, baslikNormalize } from './lib/tmdb.mjs';
import { kartlariYaz } from './ana-sayfa-kartlar.mjs';

const API = 'https://graphql.anilist.co';
const BEKLEME_MS = 1500;
const EN_FAZLA_DENEME = 5;
const ONBELLEK = path.join(ROOT, 'tools', 'cache', 'poster-esle');
const RAPOR = path.join(ROOT, 'tools', 'rapor', 'poster-esle.json');
const ANIME_DIZIN = path.join(ROOT, 'public', 'data', 'anime');
const ANA_SAYFA = path.join(ROOT, 'public', 'data', 'ana-sayfa.json');

/** AniList kapak kökü: yalnız `/cover/large/` + JPEG kabul edilir. */
const KAPAK_KOKU = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/';

const argv = process.argv.slice(2);
const argDeger = (ad) => {
  const i = argv.indexOf(ad);
  return i >= 0 ? argv[i + 1] : null;
};
const LIMIT = argDeger('--limit') ? Number(argDeger('--limit')) : Infinity;
const KURU = argv.includes('--kuru');
const YENILE = argv.includes('--yenile');

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- */
/* AniList istemcisi (poster-xl ile aynı dayanıklılık kuralları)      */
/* ---------------------------------------------------------------- */

async function anilist(query, variables, deneme = 1) {
  const yanit = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (yanit.status === 429 || yanit.status >= 500) {
    if (deneme > EN_FAZLA_DENEME) throw new Error(`AniList ${yanit.status}`);
    await bekle(yanit.status === 429 ? 6000 * deneme : 2000 * deneme);
    return anilist(query, variables, deneme + 1);
  }
  if (!yanit.ok) throw new Error(`AniList ${yanit.status}`);
  const govde = await yanit.json();
  if (govde.errors?.length) throw new Error(`AniList hata: ${govde.errors[0].message}`);
  return govde.data;
}

const SORGU_MAL = `query($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(idMal_in: $ids, type: ANIME) { id idMal }
  }
}`;

const SORGU_ARA = `query($s: String) {
  Page(page: 1, perPage: 8) {
    media(search: $s, type: ANIME) {
      id
      idMal
      format
      seasonYear
      startDate { year }
      title { romaji english native }
      synonyms
      coverImage { extraLarge large }
    }
  }
}`;

function kapakSec(m) {
  const aday = m?.coverImage?.extraLarge || m?.coverImage?.large || null;
  return aday && aday.startsWith(KAPAK_KOKU) && /\.jpe?g$/i.test(aday) ? aday : null;
}

/* ---------------------------------------------------------------- */
/* 1 · Hedefler                                                       */
/* ---------------------------------------------------------------- */

baslik('1/4 · p2 hedefleri toplanıyor');

const dosyalar = fs.readdirSync(ANIME_DIZIN).filter((f) => f.endsWith('.json'));
let p2li = 0;
let kimlikliAtlanan = 0;
const hedefler = [];

for (const ad of dosyalar) {
  const j = JSON.parse(fs.readFileSync(path.join(ANIME_DIZIN, ad), 'utf8'));
  if (j.p2) {
    p2li++;
    continue;
  }
  const anId = typeof j.anilist === 'number' ? j.anilist : j.anilist?.id ?? null;
  if (anId) {
    /* AniList kaydı ZATEN biliniyor; eksik olan kapak (PNG/medium). Arama yeni bir
       kayıt bulsaydı yanlış yapımın afişini getirme riski taşırdı. */
    kimlikliAtlanan++;
    continue;
  }
  const malId = (() => {
    const m = String(j.poster || '').match(/myanimelist\.net\/images\/anime\/\d+\/(\d+)\.(?:jpe?g|png|webp)/i);
    if (!m) return null;
    const n = Number(m[1]);
    /* Eski MAL şeması: dosya adı **MAL kimliğinin kendisi** (bugün ~62.000'e kadar).
       Yeni şema 6 haneli CDN klasörü kullanıyor (ör. 154498) — MAL kimliği değil. */
    return n > 0 && n <= 70000 ? n : null;
  })();
  const adlar = [j.ad, j.adEn].map((x) => String(x || '').trim()).filter(Boolean);
  if (!adlar.length) continue;
  hedefler.push({
    slug: j.slug,
    anilist: anId,
    malId,
    adlar,
    yil: Number(j.yil) || null,
    format: String(j.format || '').toUpperCase() || null,
    kapak: null,
    karar: null,
  });
}

log(`   p2'li: ${p2li} · kimliği olup kapağı elenen: ${kimlikliAtlanan} · hedef: ${hedefler.length}`);
const secili = Number.isFinite(LIMIT) ? hedefler.slice(0, LIMIT) : hedefler;
log(`   işlenecek: ${secili.length} (${secili.filter((h) => h.malId).length} MAL kimliğiyle)`);

/* ---------------------------------------------------------------- */
/* 2 · Arama (önbellekli)                                             */
/* ---------------------------------------------------------------- */

baslik('2/4 · AniList araması');

fs.mkdirSync(ONBELLEK, { recursive: true });
const onbellek = new Map();
if (!YENILE && varMiYol(ONBELLEK)) {
  for (const f of fs.readdirSync(ONBELLEK)) {
    if (!f.endsWith('.json') || f === 'mal.json') continue;
    onbellek.set(f.replace(/\.json$/, ''), okuJson(path.join(ONBELLEK, f), null));
  }
}
log(`   önbellek: ${onbellek.size} kayıt`);

/* MAL kimlikleri tek turda toplu sorulur (kesin eşleme, ad karşılaştırması yok). */
const malHarita = YENILE ? new Map() : new Map(Object.entries(okuJson(path.join(ONBELLEK, 'mal.json'), {})));
const malBekleyen = [...new Set(secili.filter((h) => h.malId && !malHarita.has(String(h.malId))).map((h) => h.malId))];
if (malBekleyen.length) {
  for (let i = 0; i < malBekleyen.length; i += 50) {
    const parca = malBekleyen.slice(i, i + 50);
    const veri = await anilist(SORGU_MAL, { ids: parca });
    for (const m of veri.Page.media) malHarita.set(String(m.idMal), m.id);
    await bekle(BEKLEME_MS);
  }
  fs.writeFileSync(path.join(ONBELLEK, 'mal.json'), JSON.stringify(Object.fromEntries(malHarita)));
}
log(`   MAL kimliğiyle bulunan: ${malHarita.size}/${malBekleyen.length + malHarita.size}`);

let yeniIstek = 0;
for (let i = 0; i < secili.length; i++) {
  const h = secili[i];
  if (onbellek.has(h.slug)) continue;
  const sonuclar = [];
  for (const sorgu of h.adlar) {
    try {
      const veri = await anilist(SORGU_ARA, { s: sorgu });
      for (const m of veri.Page.media) {
        sonuclar.push({
          id: m.id,
          mal: m.idMal || null,
          format: m.format || null,
          yil: m.startDate?.year || m.seasonYear || null,
          adlar: [m.title?.romaji, m.title?.english, m.title?.native, ...(m.synonyms || [])].filter(Boolean),
          kapak: kapakSec(m),
        });
      }
      yeniIstek++;
      await bekle(BEKLEME_MS);
    } catch (e) {
      log(`   ! ${h.slug} (${sorgu}): ${e.message}`);
    }
  }
  const kayit = { slug: h.slug, arama: sonuclar, zaman: new Date().toISOString() };
  fs.writeFileSync(path.join(ONBELLEK, `${h.slug}.json`), JSON.stringify(kayit));
  onbellek.set(h.slug, kayit);
  if ((i + 1) % 25 === 0 || i === secili.length - 1) log(`   ... ${i + 1}/${secili.length} hedef (${yeniIstek} istek)`);
}

/* ---------------------------------------------------------------- */
/* 3 · Doğrulama                                                      */
/* ---------------------------------------------------------------- */

baslik('3/4 · Eşleşmeler doğrulanıyor');

/** Format aileleri: SPECIAL/OVA/ONA birbirine karışabilir, TV ve MOVIE karışamaz. */
function formatAilesi(f) {
  const s = String(f || '').toUpperCase();
  if (s === 'TV' || s === 'TV_SHORT') return 'tv';
  if (s === 'MOVIE') return 'film';
  if (s === 'OVA' || s === 'ONA' || s === 'SPECIAL') return 'yan';
  return 'bilinmez';
}

const kabul = [];
const ret = [];
for (const h of secili) {
  const kayit = onbellek.get(h.slug) || { arama: [] };
  const kaynaklar = kayit.arama || [];
  const nedenler = [];

  /* 3a · MAL kimliği kesin eşleme */
  if (h.malId && malHarita.has(String(h.malId))) {
    const id = malHarita.get(String(h.malId));
    const m = kaynaklar.find((k) => k.id === id);
    const kapak = m?.kapak || null;
    if (kapak) {
      kabul.push({ slug: h.slug, anilist: id, kapak, guven: 'mal-kimlik', neden: `idMal ${h.malId} birebir` });
      continue;
    }
    nedenler.push('MAL kimliği eşleşti ama kapak JPEG/large değil');
  } else if (h.malId) {
    nedenler.push(`MAL kimliği (${h.malId}) AniList'te yok`);
  }

  /* 3b · Başlık benzerliği + yıl + format */
  let enIyi = null;
  for (const k of kaynaklar) {
    if (!k.kapak) continue;
    let puan = 0;
    for (const a of h.adlar) for (const b of k.adlar) puan = Math.max(puan, baslikBenzerligi(a, b));
    const yilFark = h.yil && k.yil ? Math.abs(h.yil - k.yil) : null;
    const aile = formatAilesi(h.format);
    const aileUyum = aile === 'bilinmez' || aile === formatAilesi(k.format);
    const tam = puan >= 0.999;
    const uygun = tam ? yilFark === null || yilFark <= 1 : puan >= 0.9 && (yilFark === 0 || yilFark === 1);
    if (!uygun || !aileUyum) continue;
    const guven = tam && (yilFark === 0 || yilFark === null) && aileUyum ? 'tam' : 'yakin';
    const skor = puan * 10 + (yilFark === 0 ? 1 : 0) + (tam ? 0.5 : 0);
    if (!enIyi || skor > enIyi.skor) enIyi = { ...k, puan, yilFark, guven, skor };
  }
  if (enIyi) {
    kabul.push({
      slug: h.slug,
      anilist: enIyi.id,
      kapak: enIyi.kapak,
      guven: enIyi.guven,
      neden: `ad ${enIyi.puan.toFixed(3)} · yıl ${enIyi.yilFark === null ? '?' : `±${enIyi.yilFark}`} · format ${h.format || '?'}→${enIyi.format || '?'}`,
    });
  } else {
    const kapakli = kaynaklar.filter((k) => k.kapak).length;
    nedenler.push(
      kaynaklar.length ? `benzer ad/yıl/format yok (JPEG kapaklı ${kapakli}/${kaynaklar.length} aday)` : 'arama sonucu yok'
    );
    ret.push({ slug: h.slug, nedenler });
  }
}

/* Aynı AniList kaydına iki farklı yapım bağlanamaz: bu ya AniList'te tek kayıt
   demektir (ör. iki ayrı OVA) ya da bir eşleşme yanlıştır. İkisinde de doğru
   davranış, ad benzerliği **en yüksek** olanı tutup kalanını reddetmektir —
   aksi hâlde iki kartta aynı afiş görünür (yanlış eşleşme, boş kapaktan kötüdür). */
const idSahibi = new Map();
const kabulSon = [];
const cakisan = [];
for (const k of kabul.sort((a, b) => (b.neden.match(/ad (\d\.\d+)/)?.[1] ?? 0) - (a.neden.match(/ad (\d\.\d+)/)?.[1] ?? 0))) {
  const sahip = idSahibi.get(k.anilist);
  if (sahip) {
    cakisan.push({ slug: k.slug, anilist: k.anilist, neden: `aynı AniList kaydı ${sahip} yapımına bağlı` });
    continue;
  }
  idSahibi.set(k.anilist, k.slug);
  kabulSon.push(k);
}
kabul.length = 0;
kabul.push(...kabulSon);
ret.push(...cakisan);

log(`   kabul: ${kabul.length} · ret: ${ret.length}${cakisan.length ? ` (aynı kayda çakışan: ${cakisan.length})` : ''}`);
for (const k of kabul) log(`   + ${k.slug} → AniList ${k.anilist} (${k.guven}) · ${k.neden}`);

/* ---------------------------------------------------------------- */
/* 4 · Yazım                                                          */
/* ---------------------------------------------------------------- */

baslik('4/4 · p2 yazılıyor');

const slugKapak = new Map(kabul.map((k) => [k.slug, k.kapak]));
let yazilan = 0;
let zatenVar = 0;
if (!KURU) {
  for (const ad of dosyalar) {
    const tam = path.join(ANIME_DIZIN, ad);
    const ham = fs.readFileSync(tam, 'utf8');
    const j = JSON.parse(ham);
    const url = slugKapak.get(j.slug);
    if (!url) continue;
    if (ham.includes('"p2":"')) {
      zatenVar++;
      continue;
    }
    const yeni = ham.replace(/("poster":"[^"]*"),/, `$1,"p2":${JSON.stringify(url)},`);
    if (yeni === ham || !yeni.includes('"p2":"')) continue;
    fs.writeFileSync(tam, yeni);
    yazilan++;
  }

  /* Ana sayfa verisi: kartlar p2'yi `ana-sayfa-kartlar.json` üzerinden okur ve
     dosya **minified** yazılmalıdır (2 boşluklu biçim diff'i tüm dosyaya yayar). */
  if (varMiYol(ANA_SAYFA)) {
    const ham = fs.readFileSync(ANA_SAYFA, 'utf8');
    const ana = JSON.parse(ham);
    let islenen = 0;
    const ekle = (oge) => {
      const url = slugKapak.get(oge.s);
      if (!url || oge.p2) return;
      oge.p2 = url;
      islenen++;
    };
    for (const h of ana.hero || []) ekle(h);
    for (const s of ana.satirlar || []) for (const o of s.ogeler || []) ekle(o);
    if (JSON.stringify(ana) !== ham) {
      fs.writeFileSync(ANA_SAYFA, JSON.stringify(ana));
      log(`   ana sayfa: ${islenen} karta p2 eklendi`);
      const bayt = kartlariYaz();
      log(`   kart dosyası yenilendi: ${(bayt / 1024).toFixed(1)} KB`);
    } else {
      log('   ana sayfa değişmedi');
    }
  }
}

const rapor = {
  zaman: new Date().toISOString(),
  hedef: secili.length,
  kimlikliAtlananKapak: kimlikliAtlanan,
  kabul: kabul.length,
  ret: ret.length,
  guvenDagilimi: kabul.reduce((a, k) => ({ ...a, [k.guven]: (a[k.guven] || 0) + 1 }), {}),
  kabulListesi: kabul,
  retListesi: ret,
  yazilan,
  zatenVar,
};
fs.mkdirSync(path.dirname(RAPOR), { recursive: true });
fs.writeFileSync(RAPOR, JSON.stringify(rapor, null, 2), 'utf8');

log(`   ${KURU ? '(kuru) ' : ''}yazılan dosya: ${yazilan} · zaten p2'li: ${zatenVar}`);
log(`   rapor: ${RAPOR}`);
log(`   kalan aday: ${ret.length} (gerekçeler raporda)`);
