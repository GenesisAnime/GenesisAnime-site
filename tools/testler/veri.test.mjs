/**
 * veri.test.mjs — üretilen site verisinin (public/data) bütünlük testleri
 * ======================================================================
 * Bağımlılık yoktur (node:test + node:assert). Ağa ve SQLite'a dokunmaz;
 * yalnızca `npm run veri` çıktısını (public/data/*) ve link sağlık kaydını
 * (arşiv kontrol_gecmisi.jsonl + tools/cache/link-durum.jsonl) okur.
 *
 * Neyi korur?
 *   · katalog.json sözleşmesi: kolon adları ve satır biçimi
 *   · katalog ↔ anime/<slug>.json birebir eşleşmesi (sessiz dosya kaybı/artığı,
 *     tekrarlanan slug'ın bir dosyayı ezmesi)
 *   · anime dosyası sayaçları: bolumSayisi, kaynakSayisi, bölüm ks, bölüm n
 *   · her kaynak (src) girdisi geçerli biçimde: [player, fansub, url(, "ok")]
 *   · ölü/engelli URL sızıntısı yok — sızıntı, üretilmiş verinin sağlık
 *     kaydından geri kaldığını gösterir; çözümü `npm run veri`'dir
 *   · kunye.json toplamları gerçek dosyalarla birebir (kaynak/tekil/rozetti/bölüm)
 *   · `banner4k` alanı yalnızca gerçek 4K (TMDB `original`) adresi taşır ve genişliğini
 *     bildirir (`banner4kGenislik`, detay bandının `srcSet`i); ana sayfa kartlarındaki
 *     `ban4k`/`bw` ikilisi anlamlıdır ve önbellekle birebir (varsa)
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { DURUM, ROOT, YOLLAR, saglikOku } from '../lib/ortak.mjs';

const VERI = YOLLAR.publicData;
const ANIME = YOLLAR.animeData;
const ORNEK_SINIRI = 8;

/** 4K banner kaynağı (TMDB `original`); önbellek `tools/cache/tmdb-backdrop.json`. */
const TMDB_ORIJINAL = 'https://image.tmdb.org/t/p/original/';
const TMDB_ONBELLEK = path.join(ROOT, 'tools', 'cache', 'tmdb-backdrop.json');

/** katalog.json'un sözleşmesi (export-data.mjs ile aynı sıra). */
const KOLONLAR = [
  'slug', 'ad', 'yil', 'puan', 'format', 'poster', 'bolumSayisi',
  'turler', 'ara', 'durum', 'kaynakSayisi', 'id',
];

function jsonOku(dosya) {
  assert.ok(
    fs.existsSync(dosya),
    `${path.relative(ROOT, dosya)} bulunamadı — önce \`npm run veri\` çalıştırılmalı.`
  );
  return JSON.parse(fs.readFileSync(dosya, 'utf8'));
}

let _katalog;
const katalog = () => (_katalog ??= jsonOku(path.join(VERI, 'katalog.json')));
let _kunye;
const kunye = () => (_kunye ??= jsonOku(path.join(VERI, 'kunye.json')));
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

/** Hata kutusu: toplam sayıyı tutar, mesaj örneklerini sınırlar. */
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

/**
 * Kaynak girdisinin biçim denetimi; sorun açıklaması ya da `null` döner.
 *
 * URL ölçütü, oynatıcının gerçekte yaptığı işle aynıdır: `new URL()` ile
 * ayrıştırılabilen http(s) adresi. Arşivde 5 eski kayıtta boşluk var
 * (4'ünde sondaki boşluk, 1'inde sorgu içi boşluk); tarayıcı bunları
 * yüzde-kodlayarak normalize eder, bu yüzden kırılmazlar.
 */
function kaynakSorunu(s) {
  if (!Array.isArray(s)) return 'kaynak girdisi dizi değil';
  if (s.length !== 3 && s.length !== 4) return `kaynak girdisi uzunluğu ${s.length} (3 ya da 4 olmalı)`;
  if (typeof s[0] !== 'string' || !s[0]) return 'player boş/eksik';
  if (s[1] !== null && (typeof s[1] !== 'string' || !s[1])) return 'fansub geçersiz (null ya da boş olmayan metin olmalı)';
  if (typeof s[2] !== 'string' || !s[2].trim()) return 'url boş/eksik';
  let u;
  try {
    u = new URL(s[2]);
  } catch {
    return `url ayrıştırılamıyor: ${s[2].slice(0, 60)}`;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return `url protokolü "${u.protocol}"`;
  if (!u.hostname) return `url host'suz: ${s[2].slice(0, 60)}`;
  if (s.length === 4 && s[3] !== 'ok') return `4. eleman "${s[3]}" ("ok" olmalı)`;
  return null;
}

let _tarama;
/**
 * Tüm anime dosyalarını tek geçişte okur; sayaçları, kaynak biçimini ve
 * ölü/engelli sızıntısını denetler. Testler arasında paylaşılır (memoize).
 */
function tamTarama() {
  if (_tarama) return _tarama;
  const kat = katalog();
  const satirBySlug = new Map(kat.anime.map((r) => [r[0], r]));
  const dosyalar = fs.readdirSync(ANIME).filter((a) => a.endsWith('.json'));
  const hatalar = {
    kod: kutu(),
    sayac: kutu(),
    bolum: kutu(),
    bicim: kutu(),
    katalog: kutu(),
    sizinti: kutu(),
    banner4k: kutu(),
  };
  const yasak = yasakKumesi();
  const tekil = new Set();
  /** Kaynaklardaki fansub grup adları (kırpılmış) — fansublar.json kapsaması için. */
  const fansubAdlari = new Set();
  let kaynak = 0;
  let bolum = 0;
  let rozetli = 0;
  let dortK = 0;
  let hd = 0;

  for (const dosya of dosyalar) {
    const slug = dosya.slice(0, -'.json'.length);
    const veri = JSON.parse(fs.readFileSync(path.join(ANIME, dosya), 'utf8'));
    if (veri.slug !== slug) ekle(hatalar.kod, `${dosya}: slug alanı "${veri.slug}"`);
    if (!Array.isArray(veri.bolumler)) {
      ekle(hatalar.sayac, `${slug}: bolumler dizisi yok`);
      continue;
    }
    if (veri.bolumSayisi !== veri.bolumler.length) {
      ekle(hatalar.sayac, `${slug}: bolumSayisi ${veri.bolumSayisi} ≠ ${veri.bolumler.length}`);
    }

    // 4K banner yalnızca TMDB `original` adresi olabilir: küçük bir varyant
    // (w1280 vb.) yazılırsa alan adı yalan söyler ve hero yine bulanık kalır.
    if (veri.banner4k === null || veri.banner4k === undefined) {
      if (veri.banner4k === undefined) ekle(hatalar.banner4k, `${slug}: banner4k alanı yok`);
      // Yarım dolu alan yasak: adres yoksa genişlik de olmamalı, yoksa `srcSet`
      // var olmayan bir kaynağı aday gösterir.
      if (veri.banner4kGenislik !== null && veri.banner4kGenislik !== undefined) {
        ekle(hatalar.banner4k, `${slug}: banner4k yok ama genişlik ${veri.banner4kGenislik}`);
      }
    } else if (typeof veri.banner4k !== 'string' || !veri.banner4k.startsWith(TMDB_ORIJINAL)) {
      ekle(hatalar.banner4k, `${slug}: banner4k TMDB original adresi değil (${String(veri.banner4k).slice(0, 80)})`);
    } else {
      dortK++;
      // Genişlik, tarayıcıya bildirilen `srcSet` adayıdır: yanlış bildirilirse
      // gereksiz büyük dosya seçilir; eşik altındaki bir kaynak 4K sayılamaz.
      if (!(veri.banner4kGenislik >= 3000)) {
        ekle(hatalar.banner4k, `${slug}: banner4k genişliği ${veri.banner4kGenislik} (≥3000 bekleniyor)`);
      }
    }

    // İkinci katman (HD, <3000 px): yalnızca AniList banner'ı yokken (boş bandı
    // doldurur) ya da AniList tavanını (1900 px) geçtiğinde yazılır. 4K varken
    // yazılmaz — bant tek kaynak kullanır, iki alanın çelişmesi istenmez.
    if (veri.bannerTmdb === null || veri.bannerTmdb === undefined) {
      if (veri.bannerTmdb === undefined) ekle(hatalar.banner4k, `${slug}: bannerTmdb alanı yok`);
      if (veri.bannerTmdbGenislik !== null && veri.bannerTmdbGenislik !== undefined) {
        ekle(hatalar.banner4k, `${slug}: bannerTmdb yok ama genişlik ${veri.bannerTmdbGenislik}`);
      }
    } else if (typeof veri.bannerTmdb !== 'string' || !veri.bannerTmdb.startsWith(TMDB_ORIJINAL)) {
      ekle(hatalar.banner4k, `${slug}: bannerTmdb TMDB original adresi değil`);
    } else {
      hd++;
      if (veri.banner4k) ekle(hatalar.banner4k, `${slug}: banner4k varken bannerTmdb de yazılmış`);
      // Eşik banner durumuna bağlıdır (export-data'daki kuralın aynısı):
      //   AniList banner'ı VARSA → HD katmanı yalnızca ondan büyükse anlamlı (≥1900)
      //   AniList banner'ı YOKSA → boş bandı doldurur, tek şart bant için yeterli
      //   olması (≥1280; TMDB'nin en küçük kullandığı genişlik)
      const esik = veri.banner ? 1900 : 1280;
      if (!(veri.bannerTmdbGenislik >= esik)) {
        ekle(
          hatalar.banner4k,
          `${slug}: bannerTmdb genişliği ${veri.bannerTmdbGenislik} (<${esik}${veri.banner ? ', AniList banner\u0131 var' : ', banner yok'})`
        );
      }
    }

    // Provenans alanı: eşleme araçları AniList kimliğini buradan okur.
    if (veri.anilist === undefined) ekle(hatalar.banner4k, `${slug}: anilist alanı yok`);

    let dosyaKaynak = 0;
    veri.bolumler.forEach((b, i) => {
      if (b.n !== i + 1) ekle(hatalar.bolum, `${slug}: ${i + 1}. bölümün sırası ${b.n}`);
      if (!Array.isArray(b.src)) {
        ekle(hatalar.bolum, `${slug} bölüm ${b.n}: src dizisi yok`);
        return;
      }
      if (b.ks !== b.src.length) {
        ekle(hatalar.bolum, `${slug} bölüm ${b.n}: ks ${b.ks} ≠ ${b.src.length}`);
      }
      if (!Array.isArray(b.ekip)) {
        ekle(hatalar.bicim, `${slug} bölüm ${b.n}: ekip dizisi yok`);
      } else {
        for (const e of b.ekip) {
          if (!e || typeof e.g !== 'string' || !e.g) {
            ekle(hatalar.bicim, `${slug} bölüm ${b.n}: ekip girdisi geçersiz`);
          } else if (e.e !== null && typeof e.e !== 'string') {
            ekle(hatalar.bicim, `${slug} bölüm ${b.n}: ekip çevirmen alanı geçersiz`);
          }
        }
      }

      for (const s of b.src) {
        dosyaKaynak++;
        const sorun = kaynakSorunu(s);
        if (sorun) {
          ekle(hatalar.bicim, `${slug} bölüm ${b.n}: ${sorun}`);
          continue;
        }
        const url = s[2];
        if (typeof s[1] === 'string' && s[1].trim()) fansubAdlari.add(s[1].trim());
        tekil.add(url);
        if (s.length === 4) rozetli++;
        if (yasak.has(url)) ekle(hatalar.sizinti, `${slug} bölüm ${b.n}: ${url.slice(0, 80)}`);
      }
    });

    if (veri.kaynakSayisi !== dosyaKaynak) {
      ekle(hatalar.sayac, `${slug}: kaynakSayisi ${veri.kaynakSayisi} ≠ ${dosyaKaynak}`);
    }
    const satir = satirBySlug.get(slug);
    if (!satir) {
      ekle(hatalar.katalog, `${slug}: anime dosyası var ama katalogda yok`);
    } else {
      if (satir[10] !== dosyaKaynak) {
        ekle(hatalar.katalog, `${slug}: katalog kaynakSayisi ${satir[10]} ≠ ${dosyaKaynak}`);
      }
      if (satir[6] !== veri.bolumler.length) {
        ekle(hatalar.katalog, `${slug}: katalog bolumSayisi ${satir[6]} ≠ ${veri.bolumler.length}`);
      }
    }

    kaynak += dosyaKaynak;
    bolum += veri.bolumler.length;
  }

  _tarama = { hatalar, dosyaSayisi: dosyalar.length, kaynak, bolum, rozetli, dortK, hd, tekil, fansubAdlari };
  return _tarama;
}

/* ================================================================ */
/* 1 · katalog.json sözleşmesi                                      */
/* ================================================================ */

test('katalog: kolon adları sözleşmeye uyar, satırlar doğru biçimde', () => {
  const kat = katalog();
  assert.deepEqual(kat.kolonlar, KOLONLAR);
  assert.match(kat.uretim, /^\d{4}-\d{2}-\d{2}T/, 'uretim ISO zaman damgası olmalı');
  assert.ok(kat.anime.length > 1000, `katalog kayıt sayısı ${kat.anime.length}`);

  let ilkHata = null;
  for (let i = 0; i < kat.anime.length && !ilkHata; i++) {
    const s = kat.anime[i];
    const sorun = !Array.isArray(s)
      ? 'satır dizi değil'
      : s.length !== kat.kolonlar.length
        ? `kolon sayısı ${s.length}`
        : typeof s[0] !== 'string' || !s[0]
          ? 'slug boş/eksik'
          : typeof s[2] === 'number' || s[2] === null ? null
            : 'yil sayı ya da null değil';
    if (sorun) {
      ilkHata = `satır ${i} (${s?.[0] ?? '?'}): ${sorun}`;
      break;
    }
    if (typeof s[6] !== 'number' || typeof s[10] !== 'number' || typeof s[11] !== 'number') {
      ilkHata = `satır ${i} (${s[0]}): bolumSayisi/kaynakSayisi/id sayı olmalı`;
      break;
    }
    if (!Array.isArray(s[7])) {
      ilkHata = `satır ${i} (${s[0]}): turler dizi değil`;
    } else if (typeof s[8] !== 'string') {
      ilkHata = `satır ${i} (${s[0]}): ara anahtarı metin değil`;
    }
  }
  assert.equal(ilkHata, null);
});

/* ================================================================ */
/* 2 · katalog ↔ anime dosyaları birebir eşleşme                     */
/* ================================================================ */

test('katalog ↔ anime dosyaları: sayı ve slug kümesi birebir', () => {
  const kat = katalog();
  const dosyaSluglari = fs
    .readdirSync(ANIME)
    .filter((a) => a.endsWith('.json'))
    .map((a) => a.slice(0, -'.json'.length));
  const katSluglari = new Set(kat.anime.map((r) => r[0]));

  assert.equal(katSluglari.size, kat.anime.length, 'katalogda tekrarlanan slug var (dosya sessizce ezilir)');
  assert.equal(dosyaSluglari.length, kat.anime.length, `dosya ${dosyaSluglari.length} ≠ katalog ${kat.anime.length}`);

  const dosyaSeti = new Set(dosyaSluglari);
  assert.deepEqual(dosyaSluglari.filter((s) => !katSluglari.has(s)).slice(0, 5), [], 'katalogda karşılığı olmayan dosya');
  assert.deepEqual([...katSluglari].filter((s) => !dosyaSeti.has(s)).slice(0, 5), [], 'dosyası olmayan katalog kaydı');
  assert.equal(kunye().anime, kat.anime.length, 'kunye.anime ≠ katalog kayıt sayısı');
});

/* ================================================================ */
/* 3 · Anime dosyası sayaçları                                      */
/* ================================================================ */

test('anime dosyaları: bölüm/kaynak sayaçları ve sıraları tutarlı', () => {
  const { hatalar } = tamTarama();
  sifirOlmali(hatalar.kod, 'slug alanı');
  sifirOlmali(hatalar.sayac, 'sayaç tutarsızlığı');
  sifirOlmali(hatalar.bolum, 'bölüm sırası/ks tutarsızlığı');
  sifirOlmali(hatalar.katalog, 'katalog ↔ dosya tutarsızlığı');
});

/* ================================================================ */
/* 4 · Kaynak girdisi biçimi                                        */
/* ================================================================ */

test('kaynak girdileri geçerli: [player, fansub, url(, "ok")]', () => {
  const { hatalar } = tamTarama();
  sifirOlmali(hatalar.bicim, 'kaynak/ekip girdisi biçimi');
});

/* ================================================================ */
/* 5 · Ölü/engelli URL sızıntısı                                    */
/* ================================================================ */

test('ölü/engelli URL sızıntısı yok (sızıntı = bayat veri)', () => {
  const saglik = saglikKaydi();
  assert.ok(saglik.size > 0, 'link sağlık kaydı boş — arşiv ve tools/cache/link-durum.jsonl okunamadı');
  assert.ok(yasakKumesi().size > 0, 'sağlık kaydında hiç ölü/engelli yok — sızıntı denetimi anlamsız olurdu');

  const { hatalar } = tamTarama();
  sifirOlmali(hatalar.sizinti, 'sitede gizlenmesi gereken ölü/engelli URL');
});

/* ================================================================ */
/* 6 · 4K banner alanı (TMDB)                                       */
/* ================================================================ */

test('banner4k: yalnızca TMDB original adresi taşınır, genişliği bildirilir ve kunye sayısı birebir', () => {
  const s = tamTarama();
  sifirOlmali(s.hatalar.banner4k, 'TMDB banner katmanları');
  assert.equal(kunye().banner4k, s.dortK, 'kunye.banner4k ≠ 4K banner taşıyan anime sayısı');
  assert.equal(kunye().bannerTmdb, s.hd, 'kunye.bannerTmdb ≠ HD katmanı taşıyan anime sayısı');
  // İki katman ayrık olmalı: aynı yapım hem 4K hem HD sayılırsa sayaçlar şişer ve
  // bant hangi kaynağı kullanacağını bilemez (kural export-data'da tek yerde).
  assert.ok(s.hd + s.dortK <= s.dosyaSayisi, 'katman toplamı arşivi aşamaz');
});

test('ana sayfa kartları: ban4k ve bw birlikte anlamlı', () => {
  const anaSayfa = jsonOku(path.join(VERI, 'ana-sayfa.json'));
  const kartlar = [...anaSayfa.hero, ...anaSayfa.satirlar.flatMap((s) => s.ogeler)];
  // Kural: ban4k varsa kaynağın gerçek genişliği ≥3000 bildirilir (srcSet adayı),
  // yoksa ikisi birden null olur — yarım dolu alan hero'da yanlış aday üretir.
  const hatali = kartlar.filter((k) =>
    k.ban4k ? !String(k.ban4k).startsWith(TMDB_ORIJINAL) || !(k.bw >= 3000) : k.bw !== null
  );
  assert.deepEqual(hatali.slice(0, 3).map((k) => k.s), [], 'ban4k/bw tutarsız (hero veya satır kartı)');
});

test(
  'banner4k: TMDB önbelleğiyle birebir (önbellek varsa)',
  { skip: fs.existsSync(TMDB_ONBELLEK) ? false : '4K önbelleği yok — TMDB anahtarı gerekir' },
  () => {
    const kayitlar = JSON.parse(fs.readFileSync(TMDB_ONBELLEK, 'utf8')).kayitlar || {};
    const dortK = Object.values(kayitlar).filter((k) => k?.yeterli && k.url && k.genislik > 0).length;
    assert.equal(
      kunye().banner4k,
      dortK,
      'kunye.banner4k ≠ önbellekteki 4K kayıt sayısı — veri bayat, `npm run veri` gerekir'
    );
  }
);

/* ================================================================ */
/* 7 · kunye.json toplamları gerçek veriyle birebir                 */
/* ================================================================ */

test('kunye.json toplamları gerçek dosyalarla birebir', () => {
  const k = kunye();
  const s = tamTarama();
  assert.equal(s.dosyaSayisi, k.anime, 'kunye.anime ≠ dosya sayısı');
  assert.equal(s.bolum, k.bolum, 'kunye.bolum ≠ toplam bölüm');
  assert.equal(s.kaynak, k.kaynak, 'kunye.kaynak ≠ toplam kaynak girdisi');
  assert.equal(s.tekil.size, k.tekilKaynak, 'kunye.tekilKaynak ≠ tekil URL sayısı');
  assert.equal(s.rozetli, k.dogrulanmisKaynak, 'kunye.dogrulanmisKaynak ≠ "ok" rozetli girdi sayısı');
});

/* ================================================================ */
/* 8 · seriler.json — franchise (seri) grupları                     */
/* ================================================================ */

// Arşivdeki en uzun anime slug'ı 144 karakter; üst sınır rahat bırakılır.
const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;

let _seriler;
const seriler = () => (_seriler ??= jsonOku(path.join(VERI, 'seriler.json')));

let _fansublar;
const fansublar = () => (_fansublar ??= jsonOku(path.join(VERI, 'fansublar.json')));

let _taksonomi;
const taksonomi = () => (_taksonomi ??= jsonOku(path.join(VERI, 'taksonomi.json')));

/**
 * Seri grubu üyeliğinin tekilliği ve anime dosyalarıyla simetrisi.
 * `anime.seri` alanı ile grup dosyasındaki üye listesi ayrı üretilirse
 * sessizce ayrışabilir; bu test ikisini karşılaştırır.
 */
test('seriler.json: geçerli slug, ≥2 üye, tek grup üyeliği ve anime dosyalarıyla simetri', () => {
  const dosya = seriler();
  assert.match(dosya.uretim, /^\d{4}-\d{2}-\d{2}T/, 'uretim ISO olmalı');
  assert.ok(dosya.seriler.length > 500, `seri grubu sayısı ${dosya.seriler.length}`);
  assert.equal(kunye().seriGrubu, dosya.seriler.length, 'kunye.seriGrubu ≠ seri dosyasındaki grup sayısı');

  const katSluglari = new Set(katalog().anime.map((r) => r[0]));
  const grupSluglari = new Set();
  const uyeGrup = new Map();
  let uyeSayisi = 0;

  for (const s of dosya.seriler) {
    assert.ok(SLUG.test(s.s), `geçersiz seri slug'ı: ${s.s}`);
    assert.ok(!grupSluglari.has(s.s), `tekrarlanan seri slug'ı: ${s.s}`);
    grupSluglari.add(s.s);
    assert.ok(katSluglari.has(s.s), `seri kökü katalogda yok: ${s.s}`);
    assert.ok(typeof s.ad === 'string' && s.ad.trim(), `seri adı boş: ${s.s}`);
    assert.ok(Array.isArray(s.uyeler) && s.uyeler.length >= 2, `${s.s}: ${s.uyeler?.length} üye (en az 2 olmalı)`);

    const gorulen = new Set();
    for (const u of s.uyeler) {
      uyeSayisi++;
      assert.ok(SLUG.test(u.s), `${s.s}: geçersiz üye slug'ı ${u.s}`);
      assert.ok(!gorulen.has(u.s), `${s.s}: tekrarlanan üye ${u.s}`);
      gorulen.add(u.s);
      assert.ok(katSluglari.has(u.s), `${s.s}: üye katalogda yok: ${u.s}`);
      assert.ok(!uyeGrup.has(u.s), `${u.s} iki ayrı seri grubunda (${uyeGrup.get(u.s)} + ${s.s})`);
      uyeGrup.set(u.s, s.s);
    }
  }

  // Simetri: anime dosyasındaki `seri` alanı grup üyeliğiyle birebir aynı olmalı.
  let isaretli = 0;
  const hatalar = [];
  for (const [slug, grup] of uyeGrup) {
    const veri = JSON.parse(fs.readFileSync(path.join(ANIME, `${slug}.json`), 'utf8'));
    if (veri.seri !== grup) {
      if (hatalar.length < 5) hatalar.push(`${slug}: dosyada ${veri.seri ?? 'null'} ≠ grupta ${grup}`);
    }
  }
  for (const dosyaAdi of fs.readdirSync(ANIME).filter((a) => a.endsWith('.json'))) {
    const veri = JSON.parse(fs.readFileSync(path.join(ANIME, dosyaAdi), 'utf8'));
    if (veri.seri) isaretli++;
  }
  assert.deepEqual(hatalar, [], 'seri üyeliği dosyalarla uyuşmuyor');
  assert.equal(isaretli, uyeSayisi, `seri alanı ${isaretli} dosyada dolu, grup üyeliği ${uyeSayisi}`);
  assert.ok(uyeSayisi > 2000, `seriye bağlı yapım sayısı ${uyeSayisi}`);
});

/* ================================================================ */
/* 9 · fansublar.json — grup slug'ları ve kapsama                   */
/* ================================================================ */

test('fansublar.json: tekil slug/ad, taksonomiyle aynı küme, kaynak adlarını kapsar', () => {
  const dosya = fansublar();
  assert.match(dosya.uretim, /^\d{4}-\d{2}-\d{2}T/, 'uretim ISO olmalı');
  assert.ok(dosya.gruplar.length > 100, `fansub grubu sayısı ${dosya.gruplar.length}`);

  const sluglar = new Set();
  const adlar = new Set();
  for (const g of dosya.gruplar) {
    assert.ok(SLUG.test(g.s), `geçersiz fansub slug'ı: ${g.s}`);
    assert.ok(!sluglar.has(g.s), `tekrarlanan fansub slug'ı: ${g.s}`);
    sluglar.add(g.s);
    assert.ok(!adlar.has(g.ad), `tekrarlanan fansub adı: ${g.ad}`);
    adlar.add(g.ad);
    assert.ok(Number.isInteger(g.bolum) && g.bolum >= 0, `${g.s}: bölüm sayısı geçersiz`);
    assert.ok(Array.isArray(g.anime) && g.anime.length > 0, `${g.s}: anime listesi boş`);
  }

  const takSluglar = new Set(taksonomi().fansublar.map((g) => g.s));
  assert.deepEqual([...sluglar].sort(), [...takSluglar].sort(), 'fansublar.json ↔ taksonomi.fansublar slug kümesi farklı');

  // Kaynaklarda geçen her fansub adı (kırpılmış) bir gruba karşılık gelmeli; yoksa
  // o grubun sayfası oluşur ama anime sayfasındaki çip "bulunamadı" der demektir.
  const eksik = [...tamTarama().fansubAdlari].filter((ad) => !adlar.has(ad)).slice(0, 5);
  assert.deepEqual(eksik, [], 'kaynaklarda geçen fansub adı grup dizininde yok');
});

/* ================================================================ */
/* Ana sayfa kart verisi: hafif sürüm tam sürümle birebir           */
/* ================================================================ */

test('ana-sayfa-kartlar.json: ana-sayfa.json ile birebir (bayat dosya yok)', async () => {
  const { kartlariKirp, kaynakYolu, hedefYolu, KART_ALANLARI } = await import('../ana-sayfa-kartlar.mjs');
  const tam = JSON.parse(fs.readFileSync(kaynakYolu(), 'utf8'));
  const beklenen = kartlariKirp(tam);

  assert.ok(fs.existsSync(hedefYolu()), 'ana-sayfa-kartlar.json yok — `npm run veri` (ya da tools/ana-sayfa-kartlar.mjs) çalıştırılmalı');
  const hafif = JSON.parse(fs.readFileSync(hedefYolu(), 'utf8'));

  assert.equal(hafif.satirlar.length, beklenen.satirlar.length, 'satır sayısı farklı');
  for (let i = 0; i < beklenen.satirlar.length; i++) {
    assert.equal(hafif.satirlar[i].baslik, beklenen.satirlar[i].baslik, `${i}. satır başlığı farklı`);
    assert.equal(hafif.satirlar[i].tur, beklenen.satirlar[i].tur, `${i}. satır türü farklı`);
    assert.deepEqual(
      hafif.satirlar[i].ogeler,
      beklenen.satirlar[i].ogeler,
      `${i}. satırın kartları farklı — hafif dosya bayat (npm run veri)`
    );
  }

  /* Kart bileşeninin okuduğu alanlar dışına taşma olmamalı: `oz`, `ban4k`, `t`
     gibi ağır alanlar kazara geri gelirse istemciye gereksiz bayt iner. */
  for (const oge of hafif.satirlar[0].ogeler) {
    const fazla = Object.keys(oge).filter((a) => !KART_ALANLARI.includes(a));
    assert.deepEqual(fazla, [], 'hafif kart verisinde beklenmeyen alan var');
  }

  /* Performans sözleşmesi: ağır alanlar (`oz`, `ban4k`, `t`) dönmesin.
     Bütçe 04.10'da 128 KB → 192 KB oldu: `p2` (yüksek yoğunluk kapağı) kart
     başına ~110 baytlık **hash'li** URL ekler (sıkıştırılamaz), karşılığında
     2×/3× ekranlarda bulanık MAL büyütmesi yerine gerçek 460 px kapak iner.
     Ölçüm: 100 KB → 129 KB ham, 15 KB → 20 KB gzip. */
  const bayt = fs.statSync(hedefYolu()).size;
  assert.ok(bayt < 192 * 1024, `ana-sayfa-kartlar.json çok büyüdü: ${(bayt / 1024).toFixed(0)} KB`);
});

test('p2: yüksek yoğunluk kapakları AniList 460 px JPEG ve kapsam yeterli', async () => {
  const dizin = 'public/data/anime';
  const dosyalar = fs.readdirSync(dizin).filter((f) => f.endsWith('.json'));
  const kapakDeseni = /^https:\/\/s4\.anilist\.co\/file\/anilistcdn\/media\/anime\/cover\/large\/.+\.jpe?g$/;
  let p2li = 0;
  const bozuk = [];
  for (const ad of dosyalar) {
    const j = JSON.parse(fs.readFileSync(path.join(dizin, ad), 'utf8'));
    if (!j.p2) continue;
    p2li++;
    if (!kapakDeseni.test(j.p2)) bozuk.push(j.slug);
  }
  assert.deepEqual(bozuk.slice(0, 5), [], 'p2 yalnızca AniList `/cover/large/*.jpg` olabilir (PNG 300–490 KB, medium 230 px: kazanç yok)');
  /* AniList eşleşmelerinin ~%54'ünde büyük JPEG var (rastgele 100 örnek:
     54 JPEG · 28 PNG · 18 medium). Alt sınır, alanın sessizce boşaltılmasını
     engeller; üst sınır yok çünkü kapsam veriye bağlı büyüyebilir. */
  assert.ok(p2li >= 2_500, `p2 kapsamı düştü: ${p2li} anime (beklenen ≥ 2500)`);

  const ana = JSON.parse(fs.readFileSync('public/data/ana-sayfa.json', 'utf8'));
  const ogeler = [...(ana.hero || []), ...(ana.satirlar || []).flatMap((s) => s.ogeler || [])];
  const anaP2 = ogeler.filter((o) => o.p2).length;
  assert.ok(anaP2 >= 250, `ana sayfa kartlarında p2 kapsamı düştü: ${anaP2}`);
  for (const o of ogeler) {
    if (o.p2) assert.ok(kapakDeseni.test(o.p2), `ana sayfa kartı p2 bozuk: ${o.s}`);
  }
});
