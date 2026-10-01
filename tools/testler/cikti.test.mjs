/**
 * cikti.test.mjs — derleme sonrası (out/) yayın çıktısının denetimi
 * ==================================================================
 * `npm run build`'in ürettiği out/ ağacını, link sağlık kaydıyla karşılaştırır.
 * Ağ ve SQLite yok; bağımlılık yok (node:test + node:assert).
 *
 * Neyi korur?
 *   · out/data/anime dosya kümesi public/data/anime ile birebir (bayat artık yok)
 *   · yayına giden veride ölü/engelli URL sızıntısı yok
 *   · "ok" rozeti yalnızca sağlık kaydı gerçekten ok olan kaynaklarda; tersi de
 *     geçerli (doğrulanmış kaynak rozetsiz kalmaz) — bilinmeyen/belirsiz bir
 *     kaynağa rozet sızması kullanıcıya yanlış güven işareti verir
 *   · html/txt çıktısının hiçbir yerinde gizlenmesi gereken URL yok
 *     (oynatıcı kaynakları istemcide JSON'dan kurulur; bu denetim verinin
 *     yanlışlıkla sayfaya gömülmesini gelecekte de yakalar)
 *   · PWA varlıkları (manifest, servis çalışanı, ikonlar) ve OG kartı yayında
 *   · seri/fansub grup sayfaları veriyle birebir (ne eksik ne fazla)
 *   · hesap sayfası KVKK metnini taşır, gizli anahtar sızdırmaz
 *
 * out/ yoksa testler atlanır (önce `npm run build`). Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { DURUM, ROOT, YOLLAR, saglikOku } from '../lib/ortak.mjs';

const OUT = path.join(ROOT, 'out');
const OUT_ANIME = path.join(OUT, 'data', 'anime');
const ATLA = fs.existsSync(OUT) ? false : 'out/ yok — önce `npm run build`';

const ORNEK_SINIRI = 8;

function kutu() {
  return { adet: 0, ornek: [] };
}
function ekle(k, mesaj) {
  k.adet++;
  if (k.ornek.length < ORNEK_SINIRI) k.ornek.push(mesaj);
}
function sifirOlmali(k, ne) {
  assert.equal(k.adet, 0, `${ne}: ${k.adet} hata — örnek: ${k.ornek.slice(0, 4).join(' · ')}`);
}

let _saglik;
const saglikKaydi = () => (_saglik ??= saglikOku());
let _yasak;
/** Sitede gizlenen durumların URL kümesi (ölü + engelli). */
const yasakKumesi = () => {
  if (!_yasak) {
    _yasak = new Set();
    for (const [url, kayit] of saglikKaydi()) {
      if (kayit.durum === DURUM.OLU || kayit.durum === DURUM.ENGELLI) _yasak.add(url);
    }
  }
  return _yasak;
};

let _tarama;
/**
 * out/data/anime/*.json dosyalarını tek geçişte okur: sızıntı, yanlış rozet ve
 * eksik rozet denetimlerinin sonuçlarını toplar (testler arasında paylaşılır).
 */
function ciktiTarama() {
  if (_tarama) return _tarama;
  assert.ok(fs.existsSync(OUT_ANIME), `${path.relative(ROOT, OUT_ANIME)} yok — önce \`npm run build\``);
  const dosyalar = fs.readdirSync(OUT_ANIME).filter((a) => a.endsWith('.json'));
  const hatalar = { sizinti: kutu(), yanlisRozet: kutu(), eksikRozet: kutu() };
  const saglik = saglikKaydi();
  const yasak = yasakKumesi();
  // Arşiv sağlık dosyası yoksa (ör. CI'da depo dışında kalır) kayıt eksikliği
  // "yanlış rozet" kanıtı sayılmaz; aşağıdaki sayaçta raporlanır.
  const arsivVar = fs.existsSync(YOLLAR.health);
  let kaynak = 0;
  let rozetli = 0;
  let okBeklenen = 0;
  let dogrulanamayan = 0;

  for (const dosya of dosyalar) {
    const veri = JSON.parse(fs.readFileSync(path.join(OUT_ANIME, dosya), 'utf8'));
    for (const b of veri.bolumler) {
      for (const s of b.src) {
        kaynak++;
        const url = s[2];
        if (typeof url !== 'string') continue; // biçim denetimi veri.test.mjs'te
        if (yasak.has(url)) ekle(hatalar.sizinti, `${dosya} b${b.n}: ${url.slice(0, 80)}`);
        const durum = saglik.get(url)?.durum;
        const rozet = s.length === 4 && s[3] === 'ok';
        if (durum === DURUM.OK) okBeklenen++;
        if (rozet) {
          rozetli++;
          if (durum !== DURUM.OK) {
            if (durum === undefined && !arsivVar) {
              dogrulanamayan++; // kısmi haritada kaydı olmayan rozet: doğrulanamadı
            } else {
              ekle(hatalar.yanlisRozet, `${dosya} b${b.n}: ${url.slice(0, 70)} (durum: ${durum ?? 'kayıt yok'})`);
            }
          }
        } else if (durum === DURUM.OK) {
          ekle(hatalar.eksikRozet, `${dosya} b${b.n}: ${url.slice(0, 70)} (durum: ok, rozet yok)`);
        }
      }
    }
  }

  _tarama = { hatalar, dosyaSayisi: dosyalar.length, kaynak, rozetli, okBeklenen, dogrulanamayan, arsivVar };
  return _tarama;
}

let _html;
/** out/ altındaki .html/.txt dosyalarında gizli URL taraması (data/ ve _next/ hariç). */
function htmlTarama() {
  if (_html) return _html;
  const yasak = yasakKumesi();
  const hatalar = kutu();
  const urun = /https?:\/\/[^\s"'<>\\)\]}]+/g;
  let dosya = 0;
  let url = 0;

  const yuru = (d) => {
    for (const g of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, g.name);
      if (g.isDirectory()) {
        if (d === OUT && (g.name === 'data' || g.name === '_next')) continue; // JSON ayrı, JS paketlerinde veri yok
        yuru(p);
        continue;
      }
      if (!/\.(html|txt)$/.test(g.name)) continue;
      dosya++;
      const metin = fs.readFileSync(p, 'utf8');
      for (const m of metin.matchAll(urun)) {
        url++;
        if (yasak.has(m[0])) ekle(hatalar, `${path.relative(OUT, p)}: ${m[0].slice(0, 80)}`);
      }
    }
  };
  yuru(OUT);

  _html = { hatalar, dosya, url };
  return _html;
}

/* ================================================================ */
/* 1 · out/data/anime ↔ public/data/anime dosya kümesi               */
/* ================================================================ */

test('out/data: dosya kümesi public/data ile birebir', { skip: ATLA }, () => {
  const pubAnime = path.join(YOLLAR.publicData, 'anime');
  const pubSluglar = new Set(
    fs.readdirSync(pubAnime).filter((a) => a.endsWith('.json')).map((a) => a.slice(0, -'.json'.length))
  );
  const outSluglar = new Set(
    fs.readdirSync(OUT_ANIME).filter((a) => a.endsWith('.json')).map((a) => a.slice(0, -'.json'.length))
  );

  assert.equal(outSluglar.size, pubSluglar.size, `out'ta ${outSluglar.size}, public/data'da ${pubSluglar.size} anime dosyası`);
  assert.deepEqual([...pubSluglar].filter((s) => !outSluglar.has(s)).slice(0, 5), [], 'derlemeye girmeyen anime dosyası');
  assert.deepEqual([...outSluglar].filter((s) => !pubSluglar.has(s)).slice(0, 5), [], 'out/ içinde bayat anime dosyası');
  for (const ad of ['katalog.json', 'kunye.json', 'saglik.json', 'ana-sayfa.json', 'taksonomi.json']) {
    assert.ok(fs.existsSync(path.join(OUT, 'data', ad)), `out/data/${ad} yok`);
  }
});

/* ================================================================ */
/* 2 · Yayına giden veride ölü/engelli URL sızıntısı                */
/* ================================================================ */

test('out/data: ölü/engelli URL sızıntısı yok', { skip: ATLA }, () => {
  assert.ok(yasakKumesi().size > 0, 'sağlık kaydında hiç ölü/engelli yok — denetim anlamsız olurdu');
  const s = ciktiTarama();
  assert.ok(s.dosyaSayisi > 1000, `beklenen anime dosyası sayısı bulunamadı: ${s.dosyaSayisi}`);
  sifirOlmali(s.hatalar.sizinti, 'gizlenmesi gereken URL');
});

/* ================================================================ */
/* 3 · Rozet denetimi: "ok" yalnızca doğrulanmış kaynakta           */
/* ================================================================ */

test('out/data: "ok" rozeti yalnızca gerçekten doğrulanmış kaynaklarda', { skip: ATLA }, () => {
  const s = ciktiTarama();
  assert.ok(s.rozetli > 0, 'hiç rozetli kaynak yok — denetim anlamsız olurdu');
  assert.ok(s.okBeklenen > 0, 'sağlık kaydında ok kaynak yok — denetim anlamsız olurdu');
  sifirOlmali(s.hatalar.yanlisRozet, 'rozet sızıntısı (bilinmeyen/belirsiz kaynağa "ok" işareti)');
  sifirOlmali(s.hatalar.eksikRozet, 'eksik rozet (ok kaynak rozetsiz)');
  // Kısmi harita (arşiv dosyası yok) rozet doğruluğunu tam kanıtlayamaz; bunu
  // sessizce geçmek yerine koşu raporunda görünür kıl.
  if (!s.arsivVar && s.dogrulanamayan > 0) {
    console.log(`   [i] arşiv sağlık dosyası yok: ${s.dogrulanamayan} rozet doğrulanamadı (kısmi harita)`);
  }
});

/* ================================================================ */
/* 4 · PWA ve OG varlıkları                                         */
/* ================================================================ */

/** PNG imzasını ve IHDR boyutlarını doğrular. */
function pngBoyut(dosya) {
  assert.ok(fs.existsSync(dosya), `${path.relative(OUT, dosya)} yok`);
  const b = fs.readFileSync(dosya);
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${path.relative(OUT, dosya)}: PNG imzası yok`);
  return { gen: b.readUInt32BE(16), yuk: b.readUInt32BE(20) };
}

test('PWA: manifest, servis çalışanı ve ikon seti yayında', { skip: ATLA }, () => {
  const manifestYolu = path.join(OUT, 'manifest.webmanifest');
  assert.ok(fs.existsSync(manifestYolu), 'out/manifest.webmanifest yok — PWA eksik');
  const manifest = JSON.parse(fs.readFileSync(manifestYolu, 'utf8'));
  assert.ok(manifest.name.includes('GenesisAnime'), `manifest adı: ${manifest.name}`);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'tr');
  const boyutlar = manifest.icons.map((i) => i.sizes);
  assert.ok(boyutlar.includes('192x192'), 'manifest\'te 192x192 ikon yok');
  assert.ok(boyutlar.includes('512x512'), 'manifest\'te 512x512 ikon yok');
  assert.ok(
    manifest.icons.some((i) => i.purpose === 'maskable'),
    'maskable ikon yok — Android ana ekranda kırpılır'
  );

  assert.ok(fs.existsSync(path.join(OUT, 'sw.js')), 'out/sw.js yok');
  const sw = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8');
  assert.ok(sw.includes('genesisanime-v1'), 'servis çalışanı sürüm damgası eksik');
  assert.ok(!sw.includes('undefined'), 'servis çalışanında gömülü `undefined` var');

  assert.ok(fs.existsSync(path.join(OUT, 'favicon.svg')), 'out/favicon.svg yok');
  const og = pngBoyut(path.join(OUT, 'og.png'));
  assert.deepEqual(og, { gen: 1200, yuk: 630 }, `og.png boyutu ${og.gen}x${og.yuk}`);
  assert.deepEqual(pngBoyut(path.join(OUT, 'ikon', 'ikon-192.png')), { gen: 192, yuk: 192 });
  assert.deepEqual(pngBoyut(path.join(OUT, 'ikon', 'ikon-512.png')), { gen: 512, yuk: 512 });
  assert.deepEqual(pngBoyut(path.join(OUT, 'ikon', 'ikon-maskable-512.png')), { gen: 512, yuk: 512 });
  assert.deepEqual(pngBoyut(path.join(OUT, 'ikon', 'apple-touch-icon.png')), { gen: 180, yuk: 180 });
});

/* ================================================================ */
/* 5 · Seri (franchise) ve fansub sayfaları                         */
/* ================================================================ */

/** out/<dizin> altındaki slug kümelerini index.html sahipliğine göre okur. */
function sayfaKumesiniOku(dizin) {
  const tam = path.join(OUT, dizin);
  assert.ok(fs.existsSync(tam), `out/${dizin} yok — sayfalar üretilmemiş`);
  return new Set(
    fs
      .readdirSync(tam, { withFileTypes: true })
      .filter((g) => g.isDirectory() && fs.existsSync(path.join(tam, g.name, 'index.html')))
      .map((g) => g.name)
  );
}

test('seri/fansub: her grup için bir sayfa üretildi (fazlası/eksiği yok)', { skip: ATLA }, () => {
  const seriVeri = JSON.parse(fs.readFileSync(path.join(YOLLAR.publicData, 'seriler.json'), 'utf8'));
  const fansubVeri = JSON.parse(fs.readFileSync(path.join(YOLLAR.publicData, 'fansublar.json'), 'utf8'));

  const seriSayfalar = sayfaKumesiniOku('seri');
  const seriBeklenen = new Set(seriVeri.seriler.map((s) => s.s));
  assert.deepEqual(
    [...seriBeklenen].filter((s) => !seriSayfalar.has(s)).slice(0, 5),
    [],
    `üretilmeyen seri sayfası: ${seriSayfalar.size}/${seriBeklenen.size}`
  );
  assert.deepEqual([...seriSayfalar].filter((s) => !seriBeklenen.has(s)).slice(0, 5), [], 'out/ içinde fazladan seri sayfası');

  const fansubSayfalar = sayfaKumesiniOku('fansub');
  const fansubBeklenen = new Set(fansubVeri.gruplar.map((g) => g.s));
  assert.deepEqual(
    [...fansubBeklenen].filter((s) => !fansubSayfalar.has(s)).slice(0, 5),
    [],
    `üretilmeyen fansub sayfası: ${fansubSayfalar.size}/${fansubBeklenen.size}`
  );
  assert.deepEqual([...fansubSayfalar].filter((s) => !fansubBeklenen.has(s)).slice(0, 5), [], 'out/ içinde fazladan fansub sayfası');

  for (const sayfa of ['seriler/index.html', 'fansublar/index.html', 'hesap/index.html', 'listem/index.html']) {
    assert.ok(fs.existsSync(path.join(OUT, sayfa)), `out/${sayfa} yok`);
  }
  assert.ok(fs.existsSync(path.join(OUT, '404.html')), 'out/404.html yok');
});

test('hesap sayfası: KVKK metni var, gizli anahtar sızmamış', { skip: ATLA }, () => {
  const html = fs.readFileSync(path.join(OUT, 'hesap', 'index.html'), 'utf8');
  assert.ok(html.includes('KVKK'), 'hesap sayfasında KVKK bölümü yok');
  assert.ok(html.includes('Hesap ve eşitleme'), 'hesap sayfası başlığı yok');
  for (const sizinti of ['ADMIN_TOKEN', 'JWT_SECRET', 'api_token', 'Bearer ']) {
    assert.ok(!html.includes(sizinti), `hesap sayfasında gizli değer sızmış: ${sizinti}`);
  }
});

/* ================================================================ */
/* 7 · HTML/txt çıktısında gizli URL sızıntısı                      */
/* ================================================================ */

test('out html/txt: gizlenmesi gereken URL gömülü değil', { skip: ATLA }, () => {
  const h = htmlTarama();
  assert.ok(h.dosya > 1000, `beklenen html/txt sayısı bulunamadı: ${h.dosya}`);
  sifirOlmali(h.hatalar, 'html/txt içinde gizli URL');
});
