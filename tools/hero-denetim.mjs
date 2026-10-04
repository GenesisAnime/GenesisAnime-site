/**
 * hero-denetim.mjs — mobil hero için **gerçek tarayıcıda** görsel regresyon kontrolü
 * ==============================================================================
 * Neden: hero'nun mobil sözleşmesi CSS metninden doğrulanabiliyor (`hero.test.mjs`)
 * ama ölçülen sonuç — “oynatma düğmesi ekranda mı, hiçbir düğme kırpılmış mı” —
 * yalnız gerçek yerleşimde belli olur. Bu betik derlenmiş `out/` klasörünü yerel
 * bir sunucudan açar ve iki gerçek telefon ölçüsünde ölçer:
 *
 *   320×568  iPhone SE 1. nesil sınıfı (kısa ekran; hero özeti gizlenir)
 *   390×844  yaygın modern telefon
 *
 * Denetlenen kurallar:
 *   1. Birincil düğme (“Hemen İzle”) tamamen görünür ve sabit alt menünün
 *      **üstünde** biter (eski hâl: 320×568'de düğme y=558'de, menü üstü 500 —
 *      oynatma düğmesi ekranın dışındaydı).
 *   2. Hero'daki **hiçbir düğme kırpılmaz** (`scrollWidth ≤ clientWidth`) —
 *      kullanıcı geri bildirimi: “detaylar düğmesi kesilmiş”.
 *   2b. **Hiçbir hero düğmesi sabit alt menünün altında kalmaz.** Metin kırpılmasa
 *      bile düğme menünün altına düşerse dokunulamaz (ayrı hata sınıfı; 320×568'de
 *      “Detaylar” tam bu yüzden görünmez oluyordu).
 *   3. Hero yüksekliği, başlık+menü dışında kalan alanın 1,35 katını aşmaz
 *      (hero ekranı yutmasın; eski hâl 568−111−68 = 389 px alana 751 px sığdırıyordu).
 *   4. Sayfada yatay taşma yok.
 *
 * Çalıştırma:
 *   npm run denetim:hero            (önce `npm run build` gerekir)
 *   npm run denetim:hero -- --canli https://genesisanime.github.io/GenesisAnime-site/
 *
 * Playwright projede kurulu değilse global kurulum aranır (`npm root -g`). Hiçbiri
 * yoksa betik **atlandı** der ve 0 ile çıkar (CI'da playwrght kurulu olmayabilir);
 * gerçek denetim için: `npm i -D playwright && npx playwright install chromium`.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { ROOT } from './lib/ortak.mjs';

const argv = process.argv.slice(2);
const canliArg = argv.indexOf('--canli');
const CANLI = canliArg >= 0 ? argv[canliArg + 1] : null;

/** Ölçülecek gerçek telefon ölçüleri ve beklentiler. */
const OLCULER = [
  { ad: '320×568 (iPhone SE sınıfı)', genislik: 320, yukseklik: 568, oranPayi: 1.35 },
  { ad: '390×844 (modern telefon)', genislik: 390, yukseklik: 844, oranPayi: 1.35 },
];

/* ---------------------------------------------------------------- */
/* Playwright çözümü (proje → global)                                */
/* ---------------------------------------------------------------- */

async function playwrightBul() {
  try {
    return await import('playwright');
  } catch {
    /* devam: global kurulum */
  }
  try {
    const kok = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const aday = path.join(kok, 'playwright');
    if (fs.existsSync(aday)) {
      const gecici = createRequire(import.meta.url);
      return gecici(aday);
    }
  } catch {
    /* yok */
  }
  return null;
}

const pw = await playwrightBul();
if (!pw) {
  console.log('hero-denetim: ATLANDI — playwright bulunamadı (proje ya da global kurulum).');
  console.log('  kurmak için: npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

/* ---------------------------------------------------------------- */
/* Sunucu (yerel out/ ya da canlı adres)                             */
/* ---------------------------------------------------------------- */

const ONEK = '/GenesisAnime-site';
const TURLER = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

let tarayici = null;
let sunucu = null;
let taban = CANLI;

if (!CANLI) {
  const OUT = path.join(ROOT, 'out');
  if (!fs.existsSync(OUT)) {
    console.error('hero-denetim: out/ yok — önce `npm run build` çalıştırın.');
    process.exit(1);
  }
  sunucu = http.createServer((istek, yanit) => {
    let yol = decodeURIComponent(new URL(istek.url, 'http://x').pathname);
    if (yol.startsWith(ONEK)) yol = yol.slice(ONEK.length) || '/';
    let dosya = path.join(OUT, path.normalize(yol));
    try {
      let st = fs.statSync(dosya);
      if (st.isDirectory()) {
        dosya = path.join(dosya, 'index.html');
        st = fs.statSync(dosya);
      }
      yanit.writeHead(200, {
        'content-type': TURLER[path.extname(dosya).toLowerCase()] || 'application/octet-stream',
        'content-length': String(st.size),
      });
      fs.createReadStream(dosya).pipe(yanit);
    } catch {
      yanit.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404: ' + yol);
    }
  });
  await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
  taban = `http://127.0.0.1:${sunucu.address().port}${ONEK}/`;
}

/* ---------------------------------------------------------------- */
/* Ölçüm                                                             */
/* ---------------------------------------------------------------- */

const KURAL = `(() => {
  const nav = document.querySelector('.alt-menu');
  const hero = document.querySelector('.hero');
  const birincil = document.querySelector('.hero-dugmeler .dugme-birincil');
  const dugumler = [...document.querySelectorAll('.hero-dugmeler .dugme')];
  const r = (e) => { const b = e.getBoundingClientRect(); return { y: Math.round(b.y), alt: Math.round(b.bottom), sag: Math.round(b.right) }; };
  return {
    pencere: { g: innerWidth, y: innerHeight },
    heroAd: (document.querySelector('.hero-ad') || {}).textContent || '—',
    hero: hero ? r(hero) : null,
    birincil: birincil ? r(birincil) : null,
    navUst: nav ? Math.round(nav.getBoundingClientRect().top) : null,
    kirpilan: dugumler.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => (e.textContent || '').trim().slice(0, 20)),
    /* Her düğmenin alt kenarı — sabit menüyle çakışma denetimi için. */
    dugmeler: dugumler.map((e) => ({ metin: (e.textContent || '').trim().slice(0, 18), alt: Math.round(e.getBoundingClientRect().bottom) })),
    dugmeSayisi: dugumler.length,
    heroPerdeVar: !!document.querySelector('.hero-perde'),
    kapakKaynagi: (document.querySelector('.hero-gorsel') || {}).currentSrc || null,
    yatayTasma: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`;

const sonuclar = [];
let hata = 0;

try {
  tarayici = await pw.chromium.launch();
  for (const olcu of OLCULER) {
    const sayfa = await tarayici.newPage({
      viewport: { width: olcu.genislik, height: olcu.yukseklik },
      /* Gerçek telefonlar 2–3× yoğunlukta çizer: kapak seçiminin (MAL 225 →
         AniList 460 adayı) gerçek cihazdaki davranışı ancak DPR 2 ile ölçülür. */
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await sayfa.goto(taban, { waitUntil: 'domcontentloaded' });
    await sayfa.waitForSelector('.hero-dugmeler .dugme-birincil', { timeout: 20000 });
    await sayfa.waitForTimeout(900);

    /* Hero öne çıkanları sırayla gezilir: en kötü durum (en uzun ad, en çok
       düğme) ölçülmeden “geçti” denemez. Aksi hâlde dönen hero yüzünden
       denetim zamanlamaya bağlı kalır (ilk sürümde iki koşu farklı sonuç verdi). */
    const noktaSayisi = await sayfa.evaluate(() => document.querySelectorAll('.hero-nokta').length);
    const olcumler = [];
    for (let i = 0; i < Math.max(1, noktaSayisi); i++) {
      if (i > 0) {
        await sayfa.evaluate((k) => document.querySelectorAll('.hero-nokta')[k]?.click(), i);
      }
      await sayfa.waitForTimeout(480);
      olcumler.push(await sayfa.evaluate(KURAL));
    }
    await sayfa.close();

    /* En kötü ölçüm: en yüksek hero, en alttaki düğme, birleşik kırpma listesi. */
    const enYuksek = olcumler.reduce((maks, x) => (x.hero.alt - x.hero.y > maks.hero.alt - maks.hero.y ? x : maks), olcumler[0]);
    const m = {
      ...enYuksek,
      heroAd: enYuksek.heroAd,
      hero: enYuksek.hero,
      birincil: olcumler.reduce((maks, x) => (x.birincil.alt > maks.birincil.alt ? x : maks), olcumler[0]).birincil,
      navUst: enYuksek.navUst,
      kirpilan: [...new Set(olcumler.flatMap((x) => x.kirpilan))],
      dugmeler: [olcumler.flatMap((x) => x.dugmeler).reduce((maks, d) => (d.alt > maks.alt ? d : maks), { metin: '—', alt: 0 })],
      dugmeSayisi: Math.max(...olcumler.map((x) => x.dugmeSayisi)),
      yatayTasma: Math.max(...olcumler.map((x) => x.yatayTasma)),
      olcumSayisi: olcumler.length,
    };

    /* Başlık ile sabit alt menü arasında kalan **gerçek** alan. */
    const kullanilabilir = (m.navUst ?? olcu.yukseklik) - m.hero.y;
    const sinir = Math.round(kullanilabilir * olcu.oranPayi);
    const heroYukseklik = m.hero.alt - m.hero.y;
    const ctaGorunur = m.birincil.alt <= (m.navUst ?? olcu.yukseklik) && m.birincil.alt <= olcu.yukseklik;
    const kirpikYok = m.kirpilan.length === 0;
    const yukseklikUygun = heroYukseklik <= sinir;
    const tasmaYok = m.yatayTasma <= 1;
    /* Sabit alt menünün üst kenarına göre en alttaki düğme; menü yoksa pencere tabanı. */
    const menüTaban = m.navUst ?? olcu.yukseklik;
    const enAlt = m.dugmeler.reduce((maks, d) => (d.alt > maks.alt ? d : maks), { metin: '—', alt: 0 });
    const dugmelerUstte = enAlt.alt <= menüTaban;

    if (!(ctaGorunur && kirpikYok && yukseklikUygun && tasmaYok && dugmelerUstte)) hata++;

    sonuclar.push({
      olcu: olcu.ad,
      olcumSayisi: m.olcumSayisi,
      heroAd: String(m.heroAd).slice(0, 34),
      heroYukseklik,
      sinir,
      ctaAlt: m.birincil.alt,
      menuUstu: m.navUst,
      dugmeSayisi: m.dugmeSayisi,
      enAltDugme: `${enAlt.metin} (${enAlt.alt} px)`,
      dugmelerUstte,
      kırpılan: m.kirpilan.join(', ') || '—',
      yatayTasma: m.yatayTasma,
      ctaGorunur,
      kirpikYok,
      dugmelerUstte,
      yukseklikUygun,
      tasmaYok,
      kapak: String(m.kapakKaynagi || '').replace(/^https:\/\//, '').slice(0, 52),
    });
  }
} finally {
  if (tarayici) await tarayici.close();
  if (sunucu) await new Promise((r) => sunucu.close(r));
}

/* ---------------------------------------------------------------- */
/* Rapor                                                             */
/* ---------------------------------------------------------------- */

console.log(`\nhero-denetim — ${CANLI ? CANLI : 'yerel out/ (BASE_PATH ' + ONEK + ')'}\n`);
for (const s of sonuclar) {
  const im = (x) => (x ? '✓' : '✗');
  console.log(` ${s.olcu} · ${s.olcumSayisi} öne çıkan ölçüldü (en yüksek: ${s.heroAd})`);
  console.log(`   hero yüksekliği         : ${s.heroYukseklik} px (sınır ${s.sinir} px) ${im(s.yukseklikUygun)}`);
  console.log(`   birincil düğme alt kenarı: ${s.ctaAlt} px · sabit menü üstü ${s.menuUstu} px ${im(s.ctaGorunur)}`);
  console.log(`   düğme sayısı / kırpılan  : ${s.dugmeSayisi} / ${s.kırpılan} ${im(s.kirpikYok)}`);
  console.log(`   en alttaki düğme         : ${s.enAltDugme} · sabit menü üstü ${s.menuUstu} px ${im(s.dugmelerUstte)}`);
  console.log(`   yatay taşma              : ${s.yatayTasma} px ${im(s.tasmaYok)}`);
  console.log(`   hero kapağı              : ${s.kapak}`);
}

if (hata) {
  console.error(`\n✗ ${hata} ölçüde kural ihlali (mobil hero sözleşmesi).`);
  process.exit(1);
}
console.log('\n✓ Mobil hero sözleşmesi iki ölçüde de sağlanıyor.');
