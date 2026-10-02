/**
 * tmdb-zenginlestir.mjs — TMDB backdrop yollarını çeker (API ANAHTARI GEREKİR)
 * ==========================================================================
 * Girdi : `tools/cache/tmdb.json`      (npm run tmdb:esle — anahtarsız eşleme)
 * Çıktı : `tools/cache/tmdb-backdrop.json`  (slug → seçilen backdrop)
 *
 * Neden ayrı adım? Eşleme anahtarsız ve deterministik; görsel yolları ise
 * yalnızca TMDB API'sinden geliyor. İki adımı ayırmak, anahtar gelmeden tüm
 * boru hattının kurulup sınanmasını sağlıyor.
 *
 * Anahtar şu sırayla aranır: `TMDB_ANAHTAR` ortam değişkeni → kök `.env`.
 * v3 (32 karakter hex) `?api_key=` ile, v4 token (JWT) `Authorization: Bearer`
 * ile kullanılır (bkz. tools/lib/tmdb.mjs · anahtarYontemi).
 *
 * Kullanım:
 *   npm run tmdb:zenginlestir -- --sadece-hero   # yalnızca öne çıkanlar havuzu (24 istek)
 *   npm run tmdb:zenginlestir -- --limit=200     # ilk 200 kayıt (sınama)
 *   npm run tmdb:zenginlestir                    # eşlenen tüm kayıtlar (kesintisiz sürer)
 *   npm run tmdb:zenginlestir -- --yenile        # önbelleği yok say, baştan çek
 *   npm run tmdb:zenginlestir -- --kuru          # anahtar/eşleme denetimi, istek yok
 *
 * Kırpım notu: TMDB görselleri 16:9; anime sayfası bandı 7,8:1 olduğu için dikey
 * eksenin ~%23'ü görünür (hero bandında %82). Seçilen görsel bu yüzden "en geniş"
 * olan; `yeterli:false` işaretli kayıtlar 4K değildir.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, YOLLAR, baslik, envDeger, log, yazJson } from './lib/ortak.mjs';
import { anahtarYontemi, backdropUrl, enIyiBackdrop } from './lib/tmdb.mjs';

const ESLEME = path.join(ROOT, 'tools', 'cache', 'tmdb.json');
const CIKTI = path.join(ROOT, 'tools', 'cache', 'tmdb-backdrop.json');
const API = 'https://api.themoviedb.org/3';
const BEKLEME_MS = 60; // ~16 istek/sn: TMDB sınırının altında nazik bir tempo

const argDeger = (ad) => {
  const a = process.argv.find((x) => x.startsWith(`--${ad}=`));
  return a ? a.slice(ad.length + 3) : null;
};
const argVar = (ad) => process.argv.includes(`--${ad}`);
const limit = argDeger('limit') ? Number(argDeger('limit')) : Infinity;
const kuru = argVar('kuru');
const yenile = argVar('yenile');
const sadeceHero = argVar('sadece-hero');

const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

baslik('TMDB backdrop zenginleştirme');

const anahtar =
  process.env.TMDB_ANAHTAR ||
  process.env.TMDB_API_KEY ||
  envDeger(path.join(ROOT, '.env'), 'TMDB_ANAHTAR', 'TMDB_API_KEY');
const yontem = anahtarYontemi(anahtar);
if (!yontem && !kuru) {
  log('   ! TMDB anahtarı yok.');
  log('     Ücretsiz anahtar: https://www.themoviedb.org/settings/api → “API Key (v3 auth)”');
  log('     Sonra kök `.env` dosyasına şu satırı ekleyin (dosya gitignore\'da):');
  log('       TMDB_ANAHTAR=<anahtar>');
  log('     (v4 “API Read Access Token” da kabul edilir: JWT ise Bearer başlığı kullanılır.)');
  process.exit(1);
}
log(
  `   anahtar: ${
    yontem ? (yontem === 'baslik' ? 'v4 token (Bearer)' : 'v3 anahtar (api_key)') : 'YOK (yalnızca --kuru denetimi yapılabilir)'
  }`
);

if (!fs.existsSync(ESLEME)) {
  log('   ! eşleme yok: önce `npm run tmdb:esle` çalıştırın (anahtarsız adım).');
  process.exit(1);
}
const esleme = JSON.parse(fs.readFileSync(ESLEME, 'utf8'));
log(`   eşleme: ${Object.keys(esleme.kayitlar).length} kayıt · üretim ${esleme.uretim}`);

/* Hangi kayıtlar çekilecek? */
let hedefler = Object.entries(esleme.kayitlar);
const ana = JSON.parse(fs.readFileSync(path.join(YOLLAR.publicData, 'ana-sayfa.json'), 'utf8'));
const hero = new Set(ana.hero.map((h) => h.s));
if (sadeceHero) {
  hedefler = hedefler.filter(([slug]) => hero.has(slug));
  log(`   --sadece-hero: ${hedefler.length} kayıt`);
} else {
  // Öne çıkanlar ÖNCE çekilir: uzun koşuda görünen kısım ilk yarım dakikada hazır olur.
  hedefler = [...hedefler.filter(([s]) => hero.has(s)), ...hedefler.filter(([s]) => !hero.has(s))];
}

const onceki = !yenile && fs.existsSync(CIKTI) ? JSON.parse(fs.readFileSync(CIKTI, 'utf8')) : { kayitlar: {} };
const kayitlar = { ...onceki.kayitlar };
if (!yenile && Object.keys(kayitlar).length) log(`   önbellek: ${Object.keys(kayitlar).length} kayıt hazır (--yenile ile baştan çekilir)`);

if (kuru) {
  log(`\n   --kuru: ${hedefler.length} kayıt çekilecekti, istek atılmadı.`);
  log('   örnek istek:', `${API}/tv/<id>/images?include_image_language=null,en`);
  process.exit(0);
}

let cekilen = 0;
let atlanan = 0;
let hata = 0;
let bulunamayan = 0;
const genislikler = [];
const basla = Date.now();
/**
 * Özet sayaçlar ÖNBELLEĞİN TAMAMINDAN hesaplanır: eskiden yalnızca o koşuda
 * çekilenleri sayıyordu, bu yüzden `--limit`/kısmi koşudan sonra özet "4K: 343"
 * gibi koşuya özel ama toplam gibi görünen bir sayı yazıyordu.
 */
const onbellekGenislikleri = () =>
  Object.values(kayitlar)
    .filter((k) => k && !k.yok && Number(k.genislik) > 0)
    .map((k) => Number(k.genislik));
const dortKsayi = () => onbellekGenislikleri().filter((g) => g >= 3000).length;

/**
 * Ara kayıt: uzun koşu yarıda kesilirse (kapatma, ağ kopması) biriken iş kaybolmaz;
 * sonraki koşu `atlanan` sayacıyla kaldığı yerden devam eder.
 */
function kaydet() {
  yazJson(
    CIKTI,
    {
      uretim: new Date().toISOString(),
      kaynak: 'TMDB /3/{tv|movie}/{id}/images',
      ozet: {
        kayit: Object.keys(kayitlar).length,
        cekilen,
        atlanan,
        hata,
        bulunamayan,
        dortK: dortKsayi(),
        en_genis: onbellekGenislikleri().length ? Math.max(...onbellekGenislikleri()) : 0,
        ortalama_genislik: onbellekGenislikleri().length
          ? Math.round(onbellekGenislikleri().reduce((t, g) => t + g, 0) / onbellekGenislikleri().length)
          : 0,
      },
      kayitlar,
    },
    true
  );
}

for (const [slug, kayit] of hedefler) {
  if (kayitlar[slug] && !yenile) { atlanan++; continue; }
  if (cekilen >= limit) break;

  const yol = `/${kayit.tip}/${kayit.id}/images?include_image_language=null,en`;
  const url = yontem === 'param' ? `${API}${yol}${yol.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(anahtar)}` : `${API}${yol}`;
  let yanit;
  try {
    yanit = await fetch(url, {
      headers: yontem === 'baslik' ? { Authorization: `Bearer ${anahtar}` } : {},
    });
  } catch (e) {
    hata++;
    log(`   ! ${slug}: ${e.message}`);
    continue;
  }
  if (yanit.status === 429) {
    log('   · TMDB oran sınırı: 5 sn bekleniyor');
    await uyu(5000);
    continue; // bu kayıt bir sonraki turda çekilir
  }
  if (!yanit.ok) {
    hata++;
    if (hata <= 5) log(`   ! ${slug}: HTTP ${yanit.status}`);
    await uyu(BEKLEME_MS);
    continue;
  }

  const govde = await yanit.json();
  const secilen = enIyiBackdrop(govde.backdrops);
  if (!secilen) {
    bulunamayan++;
    kayitlar[slug] = { yok: true };
  } else {
    kayitlar[slug] = {
      tip: kayit.tip,
      id: kayit.id,
      // Kaynak izi: Fribb eşlemesi mi, arama tabanlı eşleme mi (bkz. tmdb-ara-esle.mjs).
      kaynak: kayit.kaynak || 'fribb',
      yol: secilen.yol,
      url: backdropUrl(secilen.yol),
      genislik: secilen.genislik,
      yukseklik: secilen.yukseklik,
      yeterli: secilen.yeterli,
    };
    genislikler.push(secilen.genislik);
  }
  cekilen++;
  if (cekilen % 250 === 0) {
    log(`   · ${cekilen} kayıt (${Math.round((Date.now() - basla) / 1000)} sn · 4K adayı ${dortKsayi()})`);
    kaydet(); // ara kayıt
  }
  await uyu(BEKLEME_MS);
}

const dortK = dortKsayi();
const cikti = {
  uretim: new Date().toISOString(),
  kaynak: 'TMDB /3/{tv|movie}/{id}/images',
  ozet: {
    kayit: Object.keys(kayitlar).length,
    cekilen,
    atlanan,
    hata,
    bulunamayan,
    dortK,
    en_genis: onbellekGenislikleri().length ? Math.max(...onbellekGenislikleri()) : 0,
    ortalama_genislik: onbellekGenislikleri().length
      ? Math.round(onbellekGenislikleri().reduce((t, g) => t + g, 0) / onbellekGenislikleri().length)
      : 0,
  },
  kayitlar,
};

log('\n   ölçüm');
log(`     bu koşuda çekilen : ${cekilen} (atlanan ${atlanan} · hata ${hata} · backdrop yok ${bulunamayan})`);
log(`     toplam kayıt      : ${Object.keys(kayitlar).length}`);
log(`     4K adayı (≥3000px): ${dortK}`);
log(`     en geniş / ort.   : ${cikti.ozet.en_genis} / ${cikti.ozet.ortalama_genislik} px`);
log(`     süre              : ${Math.round((Date.now() - basla) / 1000)} sn`);
// `cikti` ile aynı şekli taşır; ara kayıtlarla uyumlu (aynı `kayitlar` haritası) kalır.
yazJson(CIKTI, cikti, true);
log(`\n   yazıldı: tools/cache/tmdb-backdrop.json (${(fs.statSync(CIKTI).size / 1024).toFixed(0)} KB)`);
log('   sonraki adım: `banner4k` alanını veriye eklemek (tools/export-data.mjs) + atıf satırı');
