/**
 * tmdb-kapsam.mjs — görsel kapsamının ölçümü (AĞ YOK)
 * ===================================================
 * Neden: "4K kapsamı %91,4" cümlesi yalnızca **banner'ı olanlar** kümesi için
 * doğruydu; arşivin tamamına bakan bir huni yoktu. Bu araç kapsamı katman katman
 * sayar ve her adımda kaç yapımın kaybolduğunu gösterir:
 *
 *   1. arşiv                  — 6.107 anime dosyası
 *   2. AniList kimliği        — `anilist` alanı (arşiv DB'sinden); yoksa eşleme imkânsız
 *   3. TMDB kimliği           — anime-list (Fribb) eşlemesinde karşılığı var mı
 *   4. backdrop kaydı         — tools/cache/tmdb-backdrop.json
 *   5. 4K katmanı (≥3000 px)  — `banner4k` (hero + bant)
 *   6. HD katmanı (<3000 px)  — `bannerTmdb` (bant; boş bandı da doldurur)
 *   7. bant kaynağı           — anime sayfası bandını kimin doldurduğu
 *
 * Çıktı: konsol özeti + `tools/rapor/tmdb-kapsam.json`.
 *
 * Kullanım: `npm run tmdb:kapsam`
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, YOLLAR, baslik, log, yazJson } from './lib/ortak.mjs';
import { anilistKimligiCikar } from './lib/tmdb.mjs';

const ESLEME = path.join(ROOT, 'tools', 'cache', 'tmdb.json');
const BACKDROP = path.join(ROOT, 'tools', 'cache', 'tmdb-backdrop.json');
const RAPOR = path.join(ROOT, 'tools', 'rapor', 'tmdb-kapsam.json');

const oku = (dosya, varsayilan) => (fs.existsSync(dosya) ? JSON.parse(fs.readFileSync(dosya, 'utf8')) : varsayilan);

baslik('TMDB / banner görsel kapsamı');

const esleme = oku(ESLEME, { kayitlar: {} }).kayitlar || {};
const backdrops = oku(BACKDROP, { kayitlar: {} }).kayitlar || {};

const s = {
  arsiv: 0,
  bannerli: 0,
  bannersiz: 0,
  anilistKimlikli: 0,
  anilistKimliksiz: 0,
  anilistBannerdanCikarilan: 0,
  tmdbKimlik: 0,
  tmdbKimliksiz: 0,
  backdropKaydi: 0,
  backdropYok: 0,
  dortK: 0,
  hd: 0,
  hdDenKucuk: 0,
  bannerli4K: 0,
  bannersiz4K: 0,
  bannersizHd: 0,
  band4K: 0,
  bandHd: 0,
  bandAniList: 0,
  bandYok: 0,
};

/** Genişlik kovaları: katman eşiklerinin dayanağı. */
const kovalar = { '>=3840': 0, '>=3000': 0, '>=2560': 0, '>=1920': 0, '>=1280': 0, '<1280': 0 };
const kova = (g) => {
  if (g >= 3840) kovalar['>=3840']++;
  else if (g >= 3000) kovalar['>=3000']++;
  else if (g >= 2560) kovalar['>=2560']++;
  else if (g >= 1920) kovalar['>=1920']++;
  else if (g >= 1280) kovalar['>=1280']++;
  else kovalar['<1280']++;
};

const kimliksiz = [];
const eslesmesiz = [];

for (const dosya of fs.readdirSync(YOLLAR.animeData)) {
  const a = JSON.parse(fs.readFileSync(path.join(YOLLAR.animeData, dosya), 'utf8'));
  s.arsiv++;
  const banli = Boolean(a.banner);
  if (banli) s.bannerli++;
  else s.bannersiz++;

  if (!a.anilist && anilistKimligiCikar(a.banner)) s.anilistBannerdanCikarilan++;
  if (!a.anilist) {
    s.anilistKimliksiz++;
    if (kimliksiz.length < 4000) kimliksiz.push({ slug: a.slug, ad: a.ad, yil: a.yil, format: a.format, adEn: a.adEn });
    // Kimliksiz yapım eşlemeye giremez: bandı AniList banner'ından ya da hiç yoktan gelir.
    if (banli) s.bandAniList++;
    else s.bandYok++;
    continue;
  }
  s.anilistKimlikli++;

  if (!esleme[a.slug]) {
    s.tmdbKimliksiz++;
    if (eslesmesiz.length < 4000) {
      eslesmesiz.push({ slug: a.slug, ad: a.ad, yil: a.yil, anilist: a.anilist, adEn: a.adEn, bannerli: banli });
    }
    if (banli) s.bandAniList++;
    else s.bandYok++;
    continue;
  }
  s.tmdbKimlik++;

  const k = backdrops[a.slug];
  const genislik = k && !k.yok ? Number(k.genislik) || 0 : 0;
  if (!genislik) {
    s.backdropYok++;
    if (banli) s.bandAniList++;
    else s.bandYok++;
    continue;
  }
  s.backdropKaydi++;
  kova(genislik);

  const dortK = genislik >= 3000;
  const hd = !dortK && backdrops[a.slug] && (banli ? genislik >= 1900 : true);
  if (dortK) {
    s.dortK++;
    s.band4K++;
    if (banli) s.bannerli4K++;
    else s.bannersiz4K++;
  } else if (hd) {
    s.hd++;
    s.bandHd++;
    if (!banli) s.bannersizHd++;
  } else {
    s.hdDenKucuk++;
    if (banli) s.bandAniList++;
    else s.bandYok++;
  }
}

const yuzde = (x, y) => (y ? ((100 * x) / y).toFixed(1) : '0.0');

log('   huni');
log(`     arşiv                        : ${s.arsiv}  (banner'lı ${s.bannerli} · banner'sız ${s.bannersiz})`);
log(`     AniList kimliği              : ${s.anilistKimlikli} · kimliksiz ${s.anilistKimliksiz} (eşlemeye giremez)`);
log(`       (banner URL'inden çıkarılabilen, alan boşken: ${s.anilistBannerdanCikarilan})`);
log(`     TMDB kimliği (Fribb)         : ${s.tmdbKimlik}  · arşivin %${yuzde(s.tmdbKimlik, s.arsiv)}'i`);
log(`       eşlemede bulunamayan       : ${s.tmdbKimliksiz}${s.anilistKimliksiz ? ` (+ kimliksiz ${s.anilistKimliksiz})` : ''}`);
log(`     backdrop kaydı               : ${s.backdropKaydi}  · backdrop yok: ${s.backdropYok}`);
log(`     4K katmanı (≥3000) → banner4k: ${s.dortK}  · arşivin %${yuzde(s.dortK, s.arsiv)}'i · bunların banner'sızı ${s.bannersiz4K}`);
log(`     HD katmanı (<3000) → bannerTmdb: ${s.hd}  · bunların banner'sızı ${s.bannersizHd}`);
log(`     HD altı (AniList tercih edilir): ${s.hdDenKucuk}`);

log('\n   genişlik kovaları');
for (const [ad, n] of Object.entries(kovalar)) log(`     ${ad.padEnd(8)}: ${n}`);

log('\n   anime sayfası bandını ne dolduruyor?');
log(`     4K backdrop        : ${s.band4K}`);
log(`     TMDB (HD)          : ${s.bandHd}`);
log(`     AniList banner'ı   : ${s.bandAniList}`);
log(`     hiçbiri (boş band) : ${s.bandYok}`);

const rapor = {
  uretim: new Date().toISOString(),
  kaynak: 'public/data/anime/*.json + tools/cache/{tmdb,tmdb-backdrop}.json',
  sayac: s,
  kovalar,
  oranlar: {
    anilist_kimlik: yuzde(s.anilistKimlikli, s.arsiv),
    tmdb_kimlik: yuzde(s.tmdbKimlik, s.arsiv),
    dortK: yuzde(s.dortK, s.arsiv),
    band_dolu: yuzde(s.band4K + s.bandHd + s.bandAniList, s.arsiv),
    band_tmdb: yuzde(s.band4K + s.bandHd, s.arsiv),
  },
  ornek: { anilist_kimliksiz: kimliksiz.slice(0, 20), eslesmesiz: eslesmesiz.slice(0, 20) },
};
yazJson(RAPOR, rapor, true);
log('\n   rapor: tools/rapor/tmdb-kapsam.json');
