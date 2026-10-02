#!/usr/bin/env node
/**
 * akis-olcum.mjs — "kendi oynatıcımızda oynatabilir miyiz?" sorusunu ölçer
 *
 * Neden: embed'i `<iframe>` içinde göstermek yerine kendi `<video>` elemanımızda
 * oynatmak, kaynağın **doğrudan akış adresini** (mp4/m3u8) elde etmeyi gerektirir.
 * Bu adres yalnızca embed sayfasının HTML'inde duruyorsa sunucu tarafında
 * çıkarılabilir (tarayıcı cross-origin sayfayı okuyamaz, Node okuyabilir).
 *
 * Bu araç hiçbir şeyi üretime almaz; hangi kaynağın hangi yolu sunduğunu ölçer:
 *   · `dogrudan`  → HTML'de imzasız/tahmin edilebilir mp4/m3u8 (referer şartı ayrıca sınanır)
 *   · `imzali`    → adres var ama sorgu parametreleri jetonlu/süreli (kısa ömürlü)
 *   · `yok`       → akış adresi HTML'de yok (player JS ile üretiliyor / API ister)
 *
 * Çalıştırma: `npm run akis:olcum` (`--host=SIBNET` ile tek player, `--limit=3`)
 *   `--referer` ile aşama 2 de koşar: bulunan adresin **bizim origin'imizden**
 *   oynanıp oynanmadığını ölçer (referer şartı). Ürün kararını bu aşama verir:
 *   `referer-yok` çalışıyorsa kendi `<video>`'muzda oynar, `yalniz-host-refereri`
 *   çıkıyorsa araya proxy koymadan kendi oynatıcımız çalışmaz.
 * Çıktı: tools/rapor/akis-olcum.json + konsol tablosu
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const VERI = path.join(KOK, 'public/data/anime');
const RAPOR = path.join(KOK, 'tools/rapor/akis-olcum.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const arg = (ad, varsayilan) => {
  const bulunan = argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? bulunan.slice(ad.length + 3) : varsayilan;
};
const HEDEF_HOST = arg('host', null);
const LIMIT = Number(arg('limit', '2'));
const SITE = 'https://nutaliaxd.github.io';

/* ------------------------- akış adayı çıkarma ------------------------- */

const AKIS_UZANTI = /\.(?:mp4|m3u8|mpd)(?:$|[?#])/i;

/** JSON içinde kaçırılmış eğik çizgileri (`https:\/\/`) geri açar. */
function kacislariCoz(html) {
  return html.replace(/\\\//g, '/');
}

/**
 * HTML'den akış adayı toplar. Üç kalıp denenir:
 *   1. `file:` / `src:` / `url:` / `video_url:` alanlarına yazılmış uzantılı adres
 *   2. gövdede geçen herhangi bir uzantılı mutlak adres
 *   3. `<source src=...>` ve `sources: [ { file: ... } ]` listeleri
 * Saf fonksiyon: ağ yok, test edilebilir.
 */
export function akisAdaylari(html) {
  const temiz = kacislariCoz(html);
  const bulunan = new Set();

  const alanli = /["']?(?:file|src|source|url|video_url|hls|dash|playlist|videoUrl|video_url)["']?\s*[:=]\s*["']([^"']{8,400})["']/gi;
  for (const m of temiz.matchAll(alanli)) {
    if (AKIS_UZANTI.test(m[1])) bulunan.add(m[1]);
  }

  const mutlak = /https?:\/\/[^\s"'<>\\]+?\.(?:mp4|m3u8|mpd)(?:\?[^\s"'<>\\]*)?/gi;
  for (const m of temiz.matchAll(mutlak)) bulunan.add(m[0]);

  const kaynakEtiket = /<source[^>]+src=["']([^"']+)["']/gi;
  for (const m of temiz.matchAll(kaynakEtiket)) bulunan.add(m[1]);

  return [...bulunan].map((adres) => ({
    adres,
    tur: /\.m3u8/i.test(adres) ? 'hls' : /\.mpd/i.test(adres) ? 'dash' : 'mp4',
    /* Jeton/süre parametresi var mı: imzalı adresler kısa ömürlüdür, önbelleğe alınamaz. */
    imzali: /[?&](?:expires|expire|token|sig|signature|hdnts|hash|st|e)=/i.test(adres) || /\/\/[^/]*\d{6,}\//.test(adres),
  }));
}

/** Aynı akışın varyantlarını (kalite/sorgu farkı) tekilleştirir. */
export function adayTekille(adaylar) {
  const gorulen = new Set();
  const cikti = [];
  for (const a of adaylar) {
    const anahtar = a.adres.replace(/([?&])(?:quality|q|res|height)=\d+/gi, '').split('#')[0];
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    cikti.push(a);
  }
  return cikti;
}

/* ------------------------------ toplama ------------------------------ */

function ornekKaynaklar() {
  const dosyalar = readdirSync(VERI).filter((f) => f.endsWith('.json'));
  const harita = new Map();
  for (const dosya of dosyalar.slice(0, 400)) {
    let json;
    try {
      json = JSON.parse(readFileSync(path.join(VERI, dosya), 'utf8'));
    } catch {
      continue;
    }
    for (const bolum of (json.bolumler ?? []).slice(0, 3)) {
      for (const k of bolum.src ?? []) {
        const player = k[0];
        if (HEDEF_HOST && player !== HEDEF_HOST) continue;
        const liste = harita.get(player) ?? [];
        if (liste.length >= LIMIT) continue;
        const adres = k[2];
        if (adres.startsWith('https://href.li/?')) {
          /* Sarmalayıcı gerçek host'u gizler; ölçüm için çözülür. */
          const gercek = adres.replace('https://href.li/?', '');
          if (!liste.some((x) => x.adres === gercek)) liste.push({ player, adres: gercek });
        } else if (!liste.some((x) => x.adres === adres)) {
          liste.push({ player, adres });
        }
        harita.set(player, liste);
      }
    }
  }
  return harita;
}

async function sayfayiCek(adres) {
  const host = new URL(adres).hostname;
  const kok = `https://${host}/`;
  const basla = Date.now();
  try {
    const yanit = await fetch(adres, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr,en;q=0.9',
        Referer: kok,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const govde = await yanit.text();
    return {
      durum: yanit.status,
      sonAdres: yanit.url,
      boyut: govde.length,
      icerikTipi: yanit.headers.get('content-type') ?? '',
      ms: Date.now() - basla,
      adaylar: adayTekille(akisAdaylari(govde)),
      html: govde,
    };
  } catch (hata) {
    return { durum: 0, hata: hata.message, ms: Date.now() - basla, adaylar: [] };
  }
}

/* ------------------- aşama 2: referer/kilit sınaması ------------------- */

/**
 * Bulunan akış adresini bizim origin'imizden oynatabilir miyiz?
 * Üç varyant sınanır: referer yok (sitenin `no-referrer` davranışı), site
 * referer'ı, kaynağın kendi referer'ı. Yalnız ilk 2 KB çekilir (Range).
 * Sonuç doğrudan ürün kararını verir: "referer-yok" çalışıyorsa kendi
 * `<video>`'muzda oynatılabilir; "host-referer" çalışıyorsa araya proxy gerekir.
 */
async function refererSina(aday, kaynakAdresi) {
  const host = new URL(kaynakAdresi).hostname;
  const sonuclar = [];
  for (const [etiket, referer] of [
    ['referer-yok', null],
    ['site-referer', `${SITE}/`],
    ['host-referer', `https://${host}/`],
  ]) {
    const basliklar = { 'User-Agent': UA, Range: 'bytes=0-2047' };
    if (referer) basliklar.Referer = referer;
    try {
      const yanit = await fetch(aday.adres, { headers: basliklar, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const govde = await yanit.arrayBuffer();
      sonuclar.push({
        varyant: etiket,
        durum: yanit.status,
        tip: (yanit.headers.get('content-type') ?? '').split(';')[0],
        bayt: govde.byteLength,
        aralik: yanit.headers.get('content-range') ?? '',
      });
    } catch (hata) {
      sonuclar.push({ varyant: etiket, durum: 0, hata: hata.message });
    }
  }
  const bul = (etiket) => sonuclar.find((v) => v.varyant === etiket)?.durum ?? 0;
  const hukum =
    bul('referer-yok') === 200 || bul('referer-yok') === 206
      ? 'dogrudan-oynatilabilir'
      : bul('site-referer') === 200 || bul('site-referer') === 206
        ? 'site-referer-yeterli'
        : bul('host-referer') === 200 || bul('host-referer') === 206
          ? 'yalniz-host-refereri -> proxy sart'
          : 'hicbir-varyantta-yanit-yok';
  return { adres: aday.adres, tur: aday.tur, sonuclar, hukum };
}

async function main() {
  const harita = ornekKaynaklar();
  const sonuc = [];
  for (const [player, kaynaklar] of harita) {
    for (const k of kaynaklar) {
      const cekim = await sayfayiCek(k.adres);
      const mp4 = cekim.adaylar.filter((a) => a.tur === 'mp4');
      const hls = cekim.adaylar.filter((a) => a.tur === 'hls');
      const imzali = cekim.adaylar.filter((a) => a.imzali);
      const sinif = !cekim.adaylar.length
        ? 'yok'
        : imzali.length === cekim.adaylar.length
          ? 'imzali'
          : 'dogrudan';
      sonuc.push({
        player,
        adres: k.adres,
        durum: cekim.durum,
        hata: cekim.hata ?? null,
        sonAdres: cekim.sonAdres ?? null,
        boyut: cekim.boyut ?? 0,
        icerikTipi: cekim.icerikTipi ?? '',
        ms: cekim.ms,
        sinif,
        mp4: mp4.length,
        hls: hls.length,
        imzali: imzali.length,
        ornekAdaylar: cekim.adaylar.slice(0, 3).map((a) => ({
          ...a,
          adres: a.adres.length > 160 ? `${a.adres.slice(0, 160)}…` : a.adres,
        })),
      });
      const isaret = sinif === 'dogrudan' ? '✓' : sinif === 'imzali' ? '~' : '✗';
      console.log(
        `${isaret} ${player.padEnd(14)} ${String(cekim.durum).padStart(3)} ${String(cekim.boyut ?? 0).padStart(7)} B  mp4:${mp4.length} hls:${hls.length} imzali:${imzali.length}  ${k.adres.slice(0, 70)}`
      );
    }
  }
  /* İsteğe bağlı aşama 2: bulunan adreslerin kilit durumunu ölç. */
  let refererSinamasi = [];
  if (argv.includes('--referer')) {
    const gorulen = new Set();
    const sayac = new Map();
    for (const s of sonuc) {
      for (const aday of s.ornekAdaylar ?? []) {
        if (gorulen.has(aday.adres)) continue;
        if ((sayac.get(s.player) ?? 0) >= 2) break;
        gorulen.add(aday.adres);
        sayac.set(s.player, (sayac.get(s.player) ?? 0) + 1);
        const sina = await refererSina(aday, s.adres);
        refererSinamasi.push({ player: s.player, kaynak: s.adres, ...sina });
        console.log(`   kilit sınaması ${s.player.padEnd(14)} → ${sina.hukum}`);
      }
    }
    console.log('\n=== özet: kilit durumu ===');
    for (const r of refererSinamasi) console.log(`${r.player.padEnd(14)} ${r.tur.padEnd(5)} ${r.hukum}`);
  }

  mkdirSync(path.dirname(RAPOR), { recursive: true });
  writeFileSync(RAPOR, `${JSON.stringify({ tarih: new Date().toISOString(), sonuc, refererSinamasi }, null, 2)}\n`);
  const ozet = {};
  for (const s of sonuc) ozet[s.player] = ozet[s.player] ?? { dogrudan: 0, imzali: 0, yok: 0 };
  for (const s of sonuc) ozet[s.player][s.sinif] += 1;
  console.log('\n=== özet (sınıf) ===');
  for (const [player, v] of Object.entries(ozet)) {
    console.log(`${player.padEnd(14)} dogrudan:${v.dogrudan} imzali:${v.imzali} yok:${v.yok}`);
  }
  console.log(`\nrapor: ${path.relative(KOK, RAPOR)}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((hata) => {
    console.error('ölçüm düştü:', hata.message);
    process.exit(1);
  });
}
