/**
 * kapak-yerel.mjs — AniList'te yalnız **PNG** kapağı olan yapımlar için yerel JPEG üretir
 * =====================================================================================
 * Sorun: `npm run poster:xl` yalnız `/cover/large/*.jpe?g` adreslerini `p2` yapar.
 * AniList'te 11.300 kayıttan 1.491'inin *büyük* kapağı PNG'dir ve o dosyalar
 * 460×631–690 için **184–903 KB** iniyor (aynı görselin JPEG'i 460 px'te 50–100 KB).
 * Bunları olduğu gibi vermek karta 400 KB'lık indirme demek olurdu; PNG'yi yok
 * saymak ise yüksek yoğunluk kapağını tamamen kaybetmek demek.
 *
 * Çözüm: talep gören yapımlar için kapağı **bir kez** çevirip yerelde saklıyoruz:
 * Chromium (Playwright, bu depoda zaten var) PNG'yi 460 px genişlikte JPEG'e
 * yeniden kodlar, dosya `public/kapak/<slug>.jpg` olur ve `p2` alanına **mutlak
 * site adresi** yazılır (MAL/AniList/TMDB adresleri gibi). Böylece istemcide
 * hiçbir yol çözümlemesi gerekmez; `srcSet` 460w adayını doğrudan kullanır.
 *
 * Neden hepsi değil: 1.491 dosya × ~60 KB ≈ **88 MB** eder ve depoyu ikiye
 * katlar. Varsayılan kural yalnız **ana sayfada görünen** (hero + satırlar)
 * ya da `kaynakSayisi ≥ --esik` yapımları çevirir; kalanlar sonraki turlarda
 * aynı araçla (`--esik 100`, `--tumu`) eklenebilir. Ölçüm (04.10):
 * ana sayfa kartlarının 211'inde `p2` yoktu, 173'ünün AniList kapağı PNG.
 *
 * Kullanım:
 *   npm run kapak:yerel                   ana sayfa + en çok kaynaklı yapımlar
 *   npm run kapak:yerel -- --esik 100     eşiği düşür (daha çok dosya)
 *   npm run kapak:yerel -- --tumu         PNG'si olan tüm yapımlar
 *   npm run kapak:yerel -- --kuru         yalnız raporla, dosya yazma
 *   npm run kapak:yerel -- --yenile       var olan JPEG'i yeniden üret
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT, YOLLAR, baslik, log, okuJson } from './lib/ortak.mjs';
import { kartlariYaz } from './ana-sayfa-kartlar.mjs';

const API = 'https://graphql.anilist.co';
const PARCA_BOYUT = 50;
const BEKLEME_MS = 1500;
const EN_FAZLA_DENEME = 5;
/** Yerel kapağın genişliği (kart 178 px · 2× = 356; 3× için 460 kullanılır). */
const GENISLIK = 460;
/** Chromium JPEG kalitesi — ölçüm: q82 ≈ 75 KB, q78 ≈ 66 KB, q72 ≈ 59 KB. */
const KALITE = 0.78;
const ONBELLEK = path.join(ROOT, 'tools', 'cache', 'kapak-yerel');
const CIKTI_DIZIN = path.join(ROOT, 'public', 'kapak');
const ANIME_DIZIN = path.join(ROOT, 'public', 'data', 'anime');
const ANA_SAYFA = path.join(ROOT, 'public', 'data', 'ana-sayfa.json');
const RAPOR = path.join(ROOT, 'tools', 'rapor', 'kapak-yerel.json');

const argv = process.argv.slice(2);
const argDeger = (ad) => {
  const i = argv.indexOf(ad);
  return i >= 0 ? argv[i + 1] : null;
};
const ESIK = argDeger('--esik') ? Number(argDeger('--esik')) : 300;
const TUMU = argv.includes('--tumu');
const KURU = argv.includes('--kuru');
const YENILE = argv.includes('--yenile');
/** Verinin taşıyacağı mutlak taban; üretim adresiyle aynı (site genelinde MUTLAK adres kuralı). */
const TABAN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://genesisanime.github.io').replace(/\/$/, '') + '/GenesisAnime-site';

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

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

/* ---------------------------------------------------------------- */
/* 1 · Hedefler                                                       */
/* ---------------------------------------------------------------- */

baslik('1/5 · PNG kapağı olan hedefler seçiliyor');

const ana = okuJson(ANA_SAYFA, { hero: [], satirlar: [] });
const anaSayfaSluglar = new Set();
for (const h of ana.hero || []) anaSayfaSluglar.add(h.s);
for (const s of ana.satirlar || []) for (const o of s.ogeler || []) anaSayfaSluglar.add(o.s);

const dosyalar = fs.readdirSync(ANIME_DIZIN).filter((f) => f.endsWith('.json'));
const hedefler = [];
for (const ad of dosyalar) {
  const j = JSON.parse(fs.readFileSync(path.join(ANIME_DIZIN, ad), 'utf8'));
  if (j.p2) continue;
  const anId = typeof j.anilist === 'number' ? j.anilist : j.anilist?.id ?? null;
  if (!anId) continue;
  const oncelik = anaSayfaSluglar.has(j.slug) || (j.kaynakSayisi || 0) >= ESIK;
  if (!TUMU && !oncelik) continue;
  hedefler.push({ slug: j.slug, id: anId, kaynakSayisi: j.kaynakSayisi || 0, anaSayfa: anaSayfaSluglar.has(j.slug) });
}
log(`   ana sayfa kartı: ${anaSayfaSluglar.size} · hedef: ${hedefler.length} (${TUMU ? 'tümü' : `ana sayfa veya ≥${ESIK} kaynak`})`);

/* ---------------------------------------------------------------- */
/* 2 · AniList kapak adresleri (önbellekli)                           */
/* ---------------------------------------------------------------- */

baslik('2/5 · AniList kapak adresleri');

fs.mkdirSync(ONBELLEK, { recursive: true });
const kapakDosya = path.join(ONBELLEK, 'kapak.json');
const kapaklar = YENILE ? {} : okuJson(kapakDosya, {});
const SORGU = `query($ids: [Int]) {
  Page(page: 1, perPage: ${PARCA_BOYUT}) { media(id_in: $ids, type: ANIME) { id coverImage { extraLarge large } } }
}`;
const bekleyen = hedefler.map((h) => h.id).filter((id) => !kapaklar[String(id)]);
for (let i = 0; i < bekleyen.length; i += PARCA_BOYUT) {
  const parca = bekleyen.slice(i, i + PARCA_BOYUT);
  const veri = await anilist(SORGU, { ids: parca });
  for (const m of veri.Page.media) kapaklar[String(m.id)] = m.coverImage?.extraLarge || m.coverImage?.large || null;
  for (const id of parca) if (!(String(id) in kapaklar)) kapaklar[String(id)] = null;
  fs.writeFileSync(kapakDosya, JSON.stringify(kapaklar));
  await bekle(BEKLEME_MS);
}
const pngler = [];
const uzakJpg = [];
for (const h of hedefler) {
  const url = kapaklar[String(h.id)];
  if (!url) continue;
  if (/\/cover\/large\/.*\.jpe?g$/i.test(url)) uzakJpg.push({ ...h, url });
  else if (/\/cover\/large\/.*\.png$/i.test(url)) pngler.push({ ...h, url });
}
log(`   PNG (yerel üretim): ${pngler.length} · uzak JPEG (doğrudan p2): ${uzakJpg.length} · kapak yok: ${hedefler.length - pngler.length - uzakJpg.length}`);

/* ---------------------------------------------------------------- */
/* 3 · PNG → JPEG (Chromium)                                          */
/* ---------------------------------------------------------------- */

baslik('3/5 · Kapaklar 460 px JPEG’e çevriliyor');

if (!KURU) fs.mkdirSync(CIKTI_DIZIN, { recursive: true });
const tarayici = KURU || !pngler.length ? null : await chromium.launch();
const sayfa = tarayici ? await tarayici.newPage() : null;
if (sayfa) await sayfa.goto('about:blank');

let uretilen = 0;
let atlanan = 0;
let toplamBayt = 0;
let kaynakBayt = 0;
const uretimler = [];
for (const h of pngler) {
  const hedef = path.join(CIKTI_DIZIN, `${h.slug}.jpg`);
  if (fs.existsSync(hedef) && !YENILE) {
    const bayt = fs.statSync(hedef).size;
    uretimler.push({ slug: h.slug, anilist: h.id, bayt, anaSayfa: h.anaSayfa });
    toplamBayt += bayt;
    atlanan++;
    continue;
  }
  if (KURU) continue;
  try {
    const png = Buffer.from(await (await fetch(h.url)).arrayBuffer());
    kaynakBayt += png.length;
    const b64 = png.toString('base64');
    const jpegB64 = await sayfa.evaluate(
      async ({ b64, genislik, kalite }) => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
        const bmp = await createImageBitmap(blob);
        const y = Math.round((genislik / bmp.width) * bmp.height);
        const oc = new OffscreenCanvas(genislik, y);
        const ctx = oc.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, 0, 0, genislik, y);
        const cikti = await oc.convertToBlob({ type: 'image/jpeg', quality: kalite });
        const tampon = new Uint8Array(await cikti.arrayBuffer());
        let s = '';
        for (let i = 0; i < tampon.length; i += 0x8000) s += String.fromCharCode(...tampon.subarray(i, i + 0x8000));
        return btoa(s);
      },
      { b64, genislik: GENISLIK, kalite: KALITE }
    );
    const jpeg = Buffer.from(jpegB64, 'base64');
    fs.writeFileSync(hedef, jpeg);
    toplamBayt += jpeg.length;
    uretimler.push({ slug: h.slug, anilist: h.id, bayt: jpeg.length, anaSayfa: h.anaSayfa });
    uretilen++;
  } catch (e) {
    log(`   ! ${h.slug}: ${e.message}`);
  }
}
if (tarayici) await tarayici.close();

if (uretimler.length) {
  log(
    `   üretilen: ${uretilen} · hazır (önbellek): ${atlanan} · toplam ${(toplamBayt / 1024 / 1024).toFixed(1)} MB · ` +
      `ortalama ${(toplamBayt / uretimler.length / 1024).toFixed(1)} KB (PNG kaynağı ${(kaynakBayt / 1024 / 1024).toFixed(1)} MB)`
  );
}

/* ---------------------------------------------------------------- */
/* 4 · p2 yazımı                                                      */
/* ---------------------------------------------------------------- */

baslik('4/5 · p2 alanları yazılıyor');

const slugKapak = new Map();
for (const u of uretimler) slugKapak.set(u.slug, `${TABAN}/kapak/${u.slug}.jpg`);
for (const u of uzakJpg) slugKapak.set(u.slug, u.url);

let yazilan = 0;
let zatenVar = 0;
if (!KURU) {
  for (const ad of dosyalar) {
    const tam = path.join(ANIME_DIZIN, ad);
    const ham = fs.readFileSync(tam, 'utf8');
    if (ham.includes('"p2":"')) {
      zatenVar++;
      continue;
    }
    const slug = JSON.parse(ham).slug;
    const url = slugKapak.get(slug);
    if (!url) continue;
    const yeni = ham.replace(/("poster":"[^"]*"),/, `$1,"p2":${JSON.stringify(url)},`);
    if (yeni === ham || !yeni.includes('"p2":"')) continue;
    fs.writeFileSync(tam, yeni);
    yazilan++;
  }

  /* Ana sayfa verisi: kart dosyası buradan türetilir; **minified** yazılmalı. */
  const ham = fs.readFileSync(ANA_SAYFA, 'utf8');
  const veri = JSON.parse(ham);
  let islenen = 0;
  const ekle = (oge) => {
    const url = slugKapak.get(oge.s);
    if (!url || oge.p2) return;
    oge.p2 = url;
    islenen++;
  };
  for (const h of veri.hero || []) ekle(h);
  for (const s of veri.satirlar || []) for (const o of s.ogeler || []) ekle(o);
  if (JSON.stringify(veri) !== ham) {
    fs.writeFileSync(ANA_SAYFA, JSON.stringify(veri));
    const bayt = kartlariYaz();
    log(`   ana sayfa: ${islenen} karta p2 · kart dosyası ${(bayt / 1024).toFixed(1)} KB`);
  } else {
    log('   ana sayfa değişmedi');
  }
}
log(`   ${KURU ? '(kuru) ' : ''}anime dosyası: ${yazilan} p2 yazıldı · zaten p2'li: ${zatenVar}`);

/* ---------------------------------------------------------------- */
/* 5 · Rapor                                                          */
/* ---------------------------------------------------------------- */

baslik('5/5 · Kapsam');

const p2Son = dosyalar.filter((ad) => fs.readFileSync(path.join(ANIME_DIZIN, ad), 'utf8').includes('"p2":"')).length;
const kartlar = [];
for (const h of ana.hero || []) kartlar.push(h);
for (const s of ana.satirlar || []) for (const o of s.ogeler || []) kartlar.push(o);
const kartP2 = kartlar.filter((o) => o.p2).length;
log(`   anime dosyası: ${p2Son}/${dosyalar.length} (${((p2Son / dosyalar.length) * 100).toFixed(1)}%)`);
log(`   ana sayfa kartı: ${kartP2}/${kartlar.length} (${((kartP2 / kartlar.length) * 100).toFixed(1)}%)`);

const rapor = {
  zaman: new Date().toISOString(),
  taban: TABAN,
  genislik: GENISLIK,
  kalite: KALITE,
  hedef: hedefler.length,
  pngKaynagi: pngler.length,
  uretilen,
  onbellekten: atlanan,
  toplamBayt,
  ortalamaBayt: uretimler.length ? Math.round(toplamBayt / uretimler.length) : 0,
  animeDosyasiP2: p2Son,
  animeDosyasiToplam: dosyalar.length,
  anaSayfaKartP2: kartP2,
  anaSayfaKartToplam: kartlar.length,
  uretimler,
};
fs.mkdirSync(path.dirname(RAPOR), { recursive: true });
fs.writeFileSync(RAPOR, JSON.stringify(rapor, null, 2), 'utf8');
log(`   rapor: ${RAPOR}`);
