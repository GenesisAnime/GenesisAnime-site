#!/usr/bin/env node
/**
 * simge-uret.mjs — PWA ikonları + apple-touch ikonu + OG kartı + favicon üretir
 * ======================================================================
 * Bağımlılık yoktur: PNG'ler Node'un zlib'i ve küçük bir CRC32/IDAT yazıcısıyla
 * ham pikselden üretilir. Tasarım dili `src/app/globals.css` belirteçleriyle
 * aynıdır (koyu zemin + mor/magenta ışıma, açık renk "G" işareti).
 *
 * Çıktılar (public/ altına):
 *   favicon.svg               vektör sekme simgesi
 *   og.png                    1200×630 paylaşım kartı (GENESISANIME yazılı)
 *   ikon/ikon-192.png         PWA
 *   ikon/ikon-512.png         PWA
 *   ikon/ikon-maskable-512.png  PWA (maskable, güvenli alan)
 *   ikon/apple-touch-icon.png apple (180×180)
 *
 * Kullanım: npm run simge:uret
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IKON_DIZINI = path.join(ROOT, 'public', 'ikon');

/* ---------------------------------------------------------------- */
/* PNG yazıcı (zlib + CRC32 — bağımlılıksız)                         */
/* ---------------------------------------------------------------- */

const CRC_TABLO = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLO[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function parca(tip, veri) {
  const uzunluk = Buffer.alloc(4);
  uzunluk.writeUInt32BE(veri.length, 0);
  const govde = Buffer.concat([Buffer.from(tip, 'ascii'), veri]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(govde), 0);
  return Buffer.concat([uzunluk, govde, crc]);
}

function pngYaz(tuval) {
  const { gen, yuk, veri } = tuval;
  const satirlar = [];
  for (let y = 0; y < yuk; y++) {
    const satir = Buffer.alloc(1 + gen * 4);
    satir[0] = 0; // filtre yok
    for (let x = 0; x < gen; x++) {
      const i = (y * gen + x) * 4;
      const j = 1 + x * 4;
      satir[j] = veri[i];
      satir[j + 1] = veri[i + 1];
      satir[j + 2] = veri[i + 2];
      satir[j + 3] = veri[i + 3];
    }
    satirlar.push(satir);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(gen, 0);
  ihdr.writeUInt32BE(yuk, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 6; // RGBA
  const imza = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    imza,
    parca('IHDR', ihdr),
    parca('IDAT', zlib.deflateSync(Buffer.concat(satirlar), { level: 9 })),
    parca('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- */
/* Tuval ve yardımcılar                                              */
/* ---------------------------------------------------------------- */

const tuval = (gen, yuk) => ({ gen, yuk, veri: Buffer.alloc(gen * yuk * 4) });

/** Kaynak-üstü alfa bileşimi (0–1 aralığı). */
function pikselKoy(t, x, y, renk, alfa) {
  if (alfa <= 0 || x < 0 || y < 0 || x >= t.gen || y >= t.yuk) return;
  const k = Math.min(1, alfa);
  const i = (y * t.gen + x) * 4;
  t.veri[i] = Math.round(t.veri[i] * (1 - k) + renk[0] * k);
  t.veri[i + 1] = Math.round(t.veri[i + 1] * (1 - k) + renk[1] * k);
  t.veri[i + 2] = Math.round(t.veri[i + 2] * (1 - k) + renk[2] * k);
  t.veri[i + 3] = Math.round(Math.min(255, t.veri[i + 3] * (1 - k) + 255 * k));
}

const kis = (x) => Math.max(0, Math.min(1, x));
function yumus(x, a, b) {
  const t = kis((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function karis(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Koyu zemin + mor/magenta ışıma (globals.css ile aynı renk dünyası). */
function zemineCiz(t) {
  const mor = [168, 85, 247];
  const magenta = [236, 72, 153];
  const ust = [11, 8, 19];
  const alt = [20, 15, 30];
  const yaricap = Math.max(t.gen, t.yuk) * 0.75;
  for (let y = 0; y < t.yuk; y++) {
    for (let x = 0; x < t.gen; x++) {
      let renk = karis(ust, alt, y / Math.max(1, t.yuk - 1));
      const g1 = kis(1 - Math.hypot(x - t.gen * 0.16, y - t.yuk * 0.12) / yaricap);
      const g2 = kis(1 - Math.hypot(x - t.gen * 0.88, y - t.yuk * 0.22) / (yaricap * 0.8));
      renk = karis(renk, mor, g1 * g1 * 0.42);
      renk = karis(renk, magenta, g2 * g2 * 0.24);
      pikselKoy(t, x, y, renk, 1);
    }
  }
}

function yuvarlakKareAlfa(x, y, merkezX, merkezY, yari, yaricap, yumusaklik) {
  const dx = Math.abs(x - merkezX) - (yari - yaricap);
  const dy = Math.abs(y - merkezY) - (yari - yaricap);
  const d = dx > 0 && dy > 0 ? Math.hypot(dx, dy) - yaricap : Math.max(dx, dy) - yaricap;
  return 1 - yumus(d, 0, yumusaklik * 2);
}

/** "G" işareti: sağda açıklığı olan halka + merkez çubuğu. */
function gAlfa(x, y, cx, cy, R, kalin) {
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  const halka = 1 - yumus(Math.max(0, Math.abs(d - R) - kalin / 2), 0, 1.8);
  const aci = Math.abs(Math.atan2(dy, dx)); // 0 = sağ
  const bosluk = 0.52;
  const halkaG = halka * yumus(aci, bosluk - 0.1, bosluk + 0.1);
  const cubuk = dx > -1 && dx < R * 0.96
    ? 1 - yumus(Math.max(0, Math.abs(dy) - kalin / 2), 0, 1.8)
    : 0;
  return Math.max(halkaG, cubuk > 0 && dx > 0 ? cubuk : 0);
}

/* ---------------------------------------------------------------- */
/* İkonlar                                                           */
/* ---------------------------------------------------------------- */

function ikonUret(gen, { maskable }) {
  const t = tuval(gen, gen);
  const cx = gen / 2;
  const cy = gen / 2;
  const yari = gen / 2;
  const yaricap = maskable ? 0 : gen * 0.2;
  const disYari = maskable ? yari : yari - gen * 0.015;
  const R = yari * (maskable ? 0.335 : 0.3);
  const kalin = R * 0.36;
  const beyaz = [244, 239, 252];

  for (let y = 0; y < gen; y++) {
    for (let x = 0; x < gen; x++) {
      const bgA = yuvarlakKareAlfa(x + 0.5, y + 0.5, cx, cy, disYari, yaricap, gen * 0.012);
      if (bgA <= 0) continue;
      // zemin rengi (ısimasız sade gradyan — küçük boyutta sade kalsın)
      const taban = karis([13, 9, 22], [36, 26, 52], (x + y) / (2 * gen));
      const isima = 1 - yumus(Math.hypot(x - gen * 0.28, y - gen * 0.24), 0, gen * 0.85);
      const renk = karis(taban, [168, 85, 247], isima * 0.35);
      pikselKoy(t, x, y, renk, bgA);
      const gA = gAlfa(x + 0.5, y + 0.5, cx, cy, R, kalin);
      if (gA > 0) pikselKoy(t, x, y, beyaz, gA * bgA * 0.97);
    }
  }
  return pngYaz(t);
}

/* ---------------------------------------------------------------- */
/* OG kartı: 1200×630 · işaret + GENESISANIME piksel yazısı           */
/* ---------------------------------------------------------------- */

const HARFLER = {
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function yaziCiz(t, metin, x0, y0, olcek, renk) {
  let x = x0;
  for (const ch of metin) {
    const glif = HARFLER[ch];
    if (!glif) continue;
    for (let gy = 0; gy < glif.length; gy++) {
      for (let gx = 0; gx < glif[gy].length; gx++) {
        if (glif[gy][gx] !== '1') continue;
        for (let py = 0; py < olcek; py++) {
          for (let px = 0; px < olcek; px++) {
            pikselKoy(t, x + gx * olcek + px, y0 + gy * olcek + py, renk, 1);
          }
        }
      }
    }
    x += (glif[0].length + 1) * olcek;
  }
  return x - olcek; // son harfin bittiği x
}

function ogUret() {
  const t = tuval(1200, 630);
  zemineCiz(t);
  const beyaz = [244, 239, 252];

  // işaret
  const cx = 250;
  const cy = 315;
  for (let y = 0; y < t.yuk; y++) {
    for (let x = 0; x < t.gen; x++) {
      const gA = gAlfa(x + 0.5, y + 0.5, cx, cy, 108, 39);
      if (gA > 0) pikselKoy(t, x, y, beyaz, gA * 0.98);
    }
  }

  // yazı + vurgu çizgisi
  const baslaX = 420;
  const bitisX = yaziCiz(t, 'GENESISANIME', baslaX, 268, 9, beyaz);
  const mor = [168, 85, 247];
  const magenta = [236, 72, 153];
  for (let x = baslaX; x < bitisX; x++) {
    const renk = karis(mor, magenta, (x - baslaX) / Math.max(1, bitisX - baslaX));
    for (let y = 378; y < 383; y++) pikselKoy(t, x, y, renk, 1);
  }
  return pngYaz(t);
}

/* ---------------------------------------------------------------- */
/* favicon.svg                                                       */
/* ---------------------------------------------------------------- */

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="GenesisAnime">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a855f7"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#0d0916"/>
  <path d="M40 20.5 A14 14 0 1 0 40 43.5" fill="none" stroke="url(#g)" stroke-width="8" stroke-linecap="round"/>
  <path d="M32 32 H43" fill="none" stroke="url(#g)" stroke-width="8" stroke-linecap="round"/>
</svg>
`;

/* ---------------------------------------------------------------- */
/* Çalıştır                                                          */
/* ---------------------------------------------------------------- */

fs.mkdirSync(IKON_DIZINI, { recursive: true });

const ciktilar = [
  [path.join(IKON_DIZINI, 'ikon-192.png'), ikonUret(192, { maskable: false })],
  [path.join(IKON_DIZINI, 'ikon-512.png'), ikonUret(512, { maskable: false })],
  [path.join(IKON_DIZINI, 'ikon-maskable-512.png'), ikonUret(512, { maskable: true })],
  [path.join(IKON_DIZINI, 'apple-touch-icon.png'), ikonUret(180, { maskable: false })],
  [path.join(ROOT, 'public', 'og.png'), ogUret()],
];

for (const [dosya, veri] of ciktilar) {
  fs.writeFileSync(dosya, veri);
  console.log(`   ${path.relative(ROOT, dosya).replace(/\\/g, '/')} — ${(veri.length / 1024).toFixed(1)} KB`);
}

fs.writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), FAVICON, 'utf8');
console.log('   public/favicon.svg — yazıldı');
