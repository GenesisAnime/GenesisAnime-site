/**
 * poster-xl.mjs — kapak (poster) kalitesini AniList kapağıyla yükseltir
 * =====================================================================
 * Sorun: arşivdeki kapakların %98'i MyAnimeList'ten gelir ve MAL'ın en büyük
 * anime kapağı **225×320**. Kart 142 px (mobil) / 178 px (masaüstü) olsa da
 * telefon 2–3× yoğunlukta 284–426 px ister; MAL CDN'i bu isteği *büyütme* ile
 * karşılıyordu (`/r/356x508/` = 225 px kaynağın şişirilmiş hâli, 31–38 KB).
 * Ölçüm (04.10, 6 poster): orijinal 225×320 · 35/42/15/15/16/18 KB,
 * `/r/178x254/` 10–15 KB, `/r/225x319/` 15–24 KB, `/r/356x508/` 31–38 KB.
 *
 * Çözüm: aynı yapımın AniList kapağı **460×650**'dir (büyütme değil, gerçek
 * kaynak). Arşiv veritabanındaki `anime_meta.anilist_id` eşleşmeleri kullanılıp
 * kapaklar AniList GraphQL'den çekilir ve anime dosyalarına `p2` olarak yazılır:
 *
 *   "poster": "https://cdn.myanimelist.net/images/anime/6/73520.jpg",
 *   "p2":     "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx6682-XXXX.jpg"
 *
 * İstemci (`src/lib/gorsel.ts`) `p2`yi yalnız **yüksek yoğunluk** adayı olarak
 * kullanır: 1× ekranda MAL'ın 178 px varyantı (10–15 KB) iner, 2×/3× ekranda
 * AniList'in 460 px kapağı — kalite artar, zayıf ekranlarda bayt artmaz.
 *
 * Özellikler:
 *   - Toplu istek: Page(perPage: 50) media(id_in: [...]) → ~117 istek
 *   - Disk önbelleği: tools/cache/poster-xl/<ilk>-<son>.json (durdur/tekrar çalıştır)
 *   - Hız sınırı: istekler arası 700 ms (AniList 90 istek/dk)
 *   - 429/5xx için artan bekleme ile 4 deneme
 *
 * Kullanım:
 *   npm run poster:xl                 tümünü çek ve veriyi güncelle
 *   npm run poster:xl -- --limit 50   ilk 50 anime ile dene
 *   npm run poster:xl -- --kuru       yalnız raporla, dosya yazma
 *   npm run poster:xl -- --yenile     önbelleği yok say
 *
 * NOT: Veri hattının tamamı (`npm run veri`) arşiv SQLite + TMDB önbelleğini
 * gerektirir; bu araç **yalnız kapak alanını** ekler ve diğer alanlara dokunmaz.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { YOLLAR, ROOT, log, baslik, okuJson, varMiYol, yazJson } from './lib/ortak.mjs';

const API = 'https://graphql.anilist.co';
const PARCA_BOYUT = 50;
/** AniList 90 istek/dk sınırı koyuyor ama kısa pencerede 429 veriyor: 1,5 sn. */
const BEKLEME_MS = 1500;
const EN_FAZLA_DENEME = 6;
const ONBELLEK = path.join(ROOT, 'tools', 'cache', 'poster-xl');
const ANIME_DIZIN = path.join(ROOT, 'public', 'data', 'anime');
const ANA_SAYFA = path.join(ROOT, 'public', 'data', 'ana-sayfa.json');

const argv = process.argv.slice(2);
const argDeger = (ad) => {
  const i = argv.indexOf(ad);
  return i >= 0 ? argv[i + 1] : null;
};
const LIMIT = argDeger('--limit') ? Number(argDeger('--limit')) : Infinity;
const KURU = argv.includes('--kuru');
const YENILE = argv.includes('--yenile');

const SORGU = `query($ids: [Int]) {
  Page(page: 1, perPage: ${PARCA_BOYUT}) {
    media(id_in: $ids, type: ANIME) {
      id
      coverImage { extraLarge large }
    }
  }
}`;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * AniList kapağı: **460×662** (ölçüldü: bx5 460×662 97 KB, bx6 460×690 96 KB).
 * Yalnız `/cover/large/` + JPEG kabul edilir: aynı yolun PNG'leri (bazı eski
 * kayıtlar) 326–489 KB iniyor ve kart için kabul edilemez; `/cover/medium/`
 * (230×331, 28–33 KB) ise MAL'ın 225×320'sinden büyük değil, kazanç sağlamaz.
 */
function kapakSec(m) {
  const aday = m?.coverImage?.extraLarge || m?.coverImage?.large || null;
  return aday && /\/cover\/large\/.+\.jpe?g$/i.test(aday) ? aday : null;
}

async function parcaCek(ids, deneme = 1) {
  const yanit = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: SORGU, variables: { ids } }),
  });
  if (yanit.status === 429 || yanit.status >= 500) {
    if (deneme > EN_FAZLA_DENEME) throw new Error(`AniList ${yanit.status} (${ids[0]}…)`);
    /* 429'da kısa beklemek işe yaramıyor: pencere dolduğunda 6 sn × deneme. */
    await bekle(yanit.status === 429 ? 6000 * deneme : 2000 * deneme);
    return parcaCek(ids, deneme + 1);
  }
  if (!yanit.ok) throw new Error(`AniList ${yanit.status}`);
  const govde = await yanit.json();
  if (govde.errors?.length) throw new Error(`AniList hata: ${govde.errors[0].message}`);
  return govde.data.Page.media || [];
}

/* ---------------------------------------------------------------- */
/* 1 · Eşleşmeleri topla                                             */
/* ---------------------------------------------------------------- */

baslik('1/4 · Arşiv veritabanından AniList kimlikleri okunuyor');

const db = new DatabaseSync(YOLLAR.db, { readOnly: true });
const eslesme = db
  .prepare("SELECT anilist_id FROM anime_meta WHERE anilist_id IS NOT NULL AND anilist_id <> ''")
  .all();
const idler = [...new Set(eslesme.map((e) => Number(e.anilist_id)).filter((n) => Number.isInteger(n) && n > 0))].slice(
  0,
  LIMIT
);
log(`eşleşme: ${eslesme.length} anime · işlenecek tekil kimlik: ${idler.length}`);

/* ---------------------------------------------------------------- */
/* 2 · Kapakları çek (parça parça, önbellekli)                       */
/* ---------------------------------------------------------------- */

baslik('2/4 · AniList kapakları çekiliyor');

fs.mkdirSync(ONBELLEK, { recursive: true });

const kapaklar = {}; // anilist_id → url
for (let i = 0; i < idler.length; i += PARCA_BOYUT) {
  const parca = idler.slice(i, i + PARCA_BOYUT);
  const dosya = path.join(ONBELLEK, `${parca[0]}-${parca[parca.length - 1]}.json`);
  let veri = !YENILE && varMiYol(dosya) ? okuJson(dosya, null) : null;
  if (!veri) {
    const medya = await parcaCek(parca);
    veri = {};
    for (const m of medya) {
      const url = kapakSec(m);
      if (url) veri[String(m.id)] = url;
    }
    fs.writeFileSync(dosya, JSON.stringify(veri));
    await bekle(BEKLEME_MS);
  }
  Object.assign(kapaklar, veri);
  if ((i / PARCA_BOYUT) % 10 === 0 || i + PARCA_BOYUT >= idler.length) {
    log(`  ${Math.min(idler.length, i + PARCA_BOYUT)}/${idler.length} · kapak: ${Object.keys(kapaklar).length}`);
  }
}

log(`çekilen kapak: ${Object.keys(kapaklar).length}`);

/* ---------------------------------------------------------------- */
/* 3 · Anime dosyalarına `p2` yaz                                    */
/* ---------------------------------------------------------------- */

baslik('3/4 · Anime dosyalarına p2 (AniList kapağı) yazılıyor');

const dosyalar = fs.readdirSync(ANIME_DIZIN).filter((f) => f.endsWith('.json'));
let yazilan = 0;
let zatenVar = 0;
let kapakYok = 0;
const slugKapak = {}; // slug → url (ana sayfa kartları için)

for (const ad of dosyalar) {
  const tam = path.join(ANIME_DIZIN, ad);
  const ham = fs.readFileSync(tam, 'utf8');
  const j = JSON.parse(ham);
  const anId = typeof j.anilist === 'number' ? j.anilist : j.anilist?.id ?? null;
  const url = anId ? kapaklar[String(anId)] : null;

  if (!url) {
    kapakYok++;
    continue;
  }
  slugKapak[j.slug] = url;
  if (ham.includes('"p2":"')) {
    zatenVar++;
    continue;
  }
  if (KURU) {
    yazilan++;
    continue;
  }
  /* Dosyalar tek satır: `"poster":"…"` alanının hemen ardına eklenir; böylece
     diff yalnız bu alanı kapsar (tüm dosyayı yeniden biçimlendirmeye gerek yok). */
  const yeni = ham.replace(/("poster":"[^"]*"),/, `$1,"p2":${JSON.stringify(url)},`);
  if (yeni === ham || yeni.includes('"p2":"') === false) {
    kapakYok++;
    continue;
  }
  fs.writeFileSync(tam, yeni);
  yazilan++;
}

log(`${KURU ? '(kuru) ' : ''}p2 yazılan: ${yazilan} · zaten var: ${zatenVar} · kapak yok: ${kapakYok}`);

/* ---------------------------------------------------------------- */
/* 4 · Ana sayfa verisine de yaz                                      */
/* ---------------------------------------------------------------- */

baslik('4/4 · Ana sayfa verisine p2 işleniyor');

if (KURU) {
  log('(kuru) dosya yazılmadı');
} else if (varMiYol(ANA_SAYFA)) {
  const ham = fs.readFileSync(ANA_SAYFA, 'utf8');
  const ana = JSON.parse(ham);
  let islenen = 0;
  const ekle = (oge) => {
    const url = slugKapak[oge.s];
    if (!url || oge.p2) return;
    oge.p2 = url;
    islenen++;
  };
  for (const h of ana.hero || []) ekle(h);
  for (const s of ana.satirlar || []) for (const o of s.ogeler || []) ekle(o);

  /* Tur: parse→stringify bu dosyada birebir aynı baytları üretir (doğrulandı);
     yine de yalnız gerçekten değiştiyse yazılır. */
  /* DİKKAT: üretilmiş dosyalar **minified** yazılır (`girintisiz = true`).
     Varsayılan (2 boşluk) kullanılırsa dosya biçimi değişir ve diff tüm
     dosyayı kapsar (bir kez yaşandı: 376 KB → 560 KB). */
  const yeni = JSON.stringify(ana);
  if (yeni !== ham) {
    yazJson(ANA_SAYFA, ana, true);
    log(`ana sayfa kartı: ${islenen} ögeye p2 eklendi`);
  } else {
    log('ana sayfa değişmedi');
  }
} else {
  log('ana-sayfa.json bulunamadı — atlandı');
}

log('Bitti. Kırpılmış kart dosyası için: node tools/ana-sayfa-kartlar.mjs');
