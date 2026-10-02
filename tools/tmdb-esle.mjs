/**
 * tmdb-esle.mjs — arşiv ↔ TMDB kimliği eşlemesi (ANAHTARSIZ)
 * ==========================================================
 * Neden: 4K/HD banner için TMDB backdrop'ları kullanılacak, ama önce hangi anime
 * hangi TMDB kaydı olduğunu bilmek gerekiyor. AniList'in kendi `externalLinks`
 * alanında TMDB **yok** (ölçüldü: 183 kayıtta 0), bu yüzden topluluk eşleme
 * veri kümesi `anime-list` (Fribb) kullanılır: `anilist_id → themoviedb_id`.
 *
 * KİMLİK NEREDEN? Veriye yazılan `anilist` alanından (arşiv DB'si
 * `anime_meta.anilist_id`). Eskiden kimlik yalnızca **banner URL'inden**
 * çıkarılıyordu: banner'ı olmayan 1.775 yapım bu yüzden eşlemeye hiç girmiyor ve
 * banner'sız sayfaların bandı boş kalıyordu.
 *
 * Ölçüm (02.10.2026): AniList kimliği olan 5.850 yapımın **4.907'si** Fribb'de
 * karşılık buluyor; 1.182'si banner'sızdı — eski hattın tamamen kaçırdığı küme.
 * Kimliği olup Fribb'de olmayan 943 yapım için arama tabanlı eşleme ayrı ve
 * anahtarlı bir adımdır.
 *
 * Girdi/çıktı:
 *   tools/cache/tmdb-esleme-fribb.json   (veri kümesi; yoksa/eskimişse indirilir)
 *   tools/cache/tmdb.json                (slug → { anilist, tip, id })
 *
 * Kullanım:
 *   npm run tmdb:esle              # eşlemeyi tazele (gerekirse veri kümesini indir)
 *   npm run tmdb:esle -- --yenile  # veri kümesini yeniden indir
 *   npm run tmdb:esle -- --kuru    # yazma, yalnızca rapor
 *
 * Bu adım anahtar istemez ve ağa yalnızca veri kümesini indirirken çıkar; TMDB
 * API'si (backdrop yolları) ayrı ve anahtarlı bir adımdır.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, YOLLAR, baslik, log, yazJson } from './lib/ortak.mjs';
import { anilistKimligiCikar, tmdbIdSec } from './lib/tmdb.mjs';

const KAYNAK = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';
const ESLEME_DOSYA = path.join(ROOT, 'tools', 'cache', 'tmdb-esleme-fribb.json');
const CIKTI = path.join(ROOT, 'tools', 'cache', 'tmdb.json');
const EN_FAZLA_GUN = 30;

const argVar = (ad) => process.argv.includes(ad);
const kuru = argVar('--kuru');
const yenile = argVar('--yenile');

async function eslemeGetir() {
  const var_ = fs.existsSync(ESLEME_DOSYA);
  const yasGun = var_ ? (Date.now() - fs.statSync(ESLEME_DOSYA).mtimeMs) / 86400000 : Infinity;
  if (var_ && !yenile && yasGun < EN_FAZLA_GUN) {
    log(`   eşleme veri kümesi hazır (${Math.round(yasGun)} gün önce indirildi)`);
    return;
  }
  log(`   indiriliyor: ${KAYNAK}`);
  const y = await fetch(KAYNAK);
  if (!y.ok) throw new Error(`veri kümesi indirilemedi: HTTP ${y.status}`);
  const metin = await y.text();
  fs.mkdirSync(path.dirname(ESLEME_DOSYA), { recursive: true });
  fs.writeFileSync(ESLEME_DOSYA, metin, 'utf8');
  log(`   indirildi: ${(metin.length / 1024 / 1024).toFixed(1)} MB`);
}

baslik('TMDB eşlemesi — arşiv ↔ anime-list (Fribb)');
await eslemeGetir();

const liste = JSON.parse(fs.readFileSync(ESLEME_DOSYA, 'utf8'));
const indeks = new Map();
for (const kayit of liste) if (kayit.anilist_id) indeks.set(Number(kayit.anilist_id), kayit);
log(`   kayıt: ${liste.length} · AniList kimliği indeksli: ${indeks.size}`);

const kayitlar = {};
let arsiv = 0;
let bannerli = 0;
let bannersiz = 0;
let eslesen = 0;
let bannerliEslesen = 0;
let tv = 0;
let film = 0;
let anilistKimlikli = 0;
let anilistKimliksiz = 0;
let kimliksizEslesen = 0;
const bannerliTip = { tv: 0, movie: 0 };

for (const dosya of fs.readdirSync(YOLLAR.animeData)) {
  const a = JSON.parse(fs.readFileSync(path.join(YOLLAR.animeData, dosya), 'utf8'));
  arsiv++;
  // AniList kimliği öncelikle veriden gelir (`anilist` alanı = arşiv DB'sindeki
  // anime_meta.anilist_id). Eski veri için banner URL'inden çıkarma korunur.
  // Bu değişiklik banner'sız 1.182 yapımı eşlemeye sokar: onların banner'ı
  // olmadığı için kimlik hiç bulunamıyordu ve `banner4k` hiç doğmuyordu.
  const anilist = a.anilist ?? anilistKimligiCikar(a.banner);
  const banli = Boolean(a.banner);
  if (banli) bannerli++;
  else bannersiz++;
  if (anilist) anilistKimlikli++;
  else {
    anilistKimliksiz++;
    continue;
  }
  const kayit = indeks.get(anilist);
  if (!kayit) continue;
  eslesen++;
  if (!banli) kimliksizEslesen++;
  const tmdb = tmdbIdSec(kayit);
  if (!tmdb) continue;
  if (tmdb.tip === 'tv') tv++;
  else film++;
  if (banli) bannerliTip[tmdb.tip]++;
  else bannerliTip[`bannersiz_${tmdb.tip}`] = (bannerliTip[`bannersiz_${tmdb.tip}`] || 0) + 1;
  kayitlar[a.slug] = { anilist, tip: tmdb.tip, id: tmdb.id, bannerli: banli };
}

const tmdbKimlikli = Object.keys(kayitlar).length;
const cikti = {
  uretim: new Date().toISOString(),
  kaynak: 'anime-list (Fribb) + AniList kimliği (verideki `anilist` alanı)',
  ozet: {
    arsiv,
    bannerli,
    bannersiz,
    anilist_kimlikli: anilistKimlikli,
    anilist_kimliksiz: anilistKimliksiz,
    eslesen,
    bannerli_eslesen: bannerliEslesen,
    bannersiz_eslesen: kimliksizEslesen,
    tmdb_kimlikli: tmdbKimlikli,
    tv,
    movie: film,
  },
  kayitlar,
};

log('\n   ölçüm');
log(`     arşiv            : ${arsiv} (banner'lı ${bannerli} · banner'sız ${bannersiz})`);
log(`     AniList kimliği  : ${anilistKimlikli} · kimliksiz ${anilistKimliksiz} (eşlemeye giremez)`);
log(`     kimlik eşleşmesi : ${eslesen} (Fribb'de yok: ${anilistKimlikli - eslesen})`);
log(`       banner'sız eşleşen: ${kimliksizEslesen}`);
log(`     TMDB kimliği     : ${tmdbKimlikli} (arşivin %${((100 * tmdbKimlikli) / arsiv).toFixed(1)}'i, kimliği olanların %${((100 * tmdbKimlikli) / anilistKimlikli).toFixed(1)}'i)`);
log(`     tip              : dizi ${tv} · film ${film}`);
log(
  `     banner'lı kümede : dizi ${bannerliTip.tv} · film ${bannerliTip.movie}` +
    ` · banner'sız: dizi ${bannerliTip.bannersiz_tv || 0} · film ${bannerliTip.bannersiz_movie || 0}`
);

if (kuru) {
  log('\n   --kuru: dosya yazılmadı');
} else {
  yazJson(CIKTI, cikti, true);
  log(`\n   yazıldı: tools/cache/tmdb.json (${(fs.statSync(CIKTI).size / 1024).toFixed(0)} KB)`);
  log('   sonraki adım: backdrop yolları TMDB API anahtarıyla (tools/tmdb-zenginlestir.mjs)');
}
