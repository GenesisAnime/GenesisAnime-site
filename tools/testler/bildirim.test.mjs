/**
 * bildirim.test.mjs — bildirim hattının saf mantığı için birim testleri
 * =====================================================================
 * Kapsam: `tools/bildirim-cek.mjs` (kuyruk aktarımı) ve `api/src/yardimci.mjs`
 * (Cloudflare Worker yardımcıları: doğrulama, yönlendirme, parola/jeton özeti,
 * oran sınırı). Ağ yoktur, D1 yoktur: veritabanı çağrıları küçük sentetik sahte
 * ile sınanır. Ayrıca `api/src/index.mjs` girişinin workerd kuralına uyduğu
 * (yalnızca handler dışa aktarma) burada denetlenir — uymazsa Worker hiç açılmaz.
 *
 * Neyi korur?
 *   · Bildirim kaydı doğrulanmadan kuyruğa girmemeli (bozuk/yaşlı/tekrar süzülür)
 *   · URL doğrulaması IP/localhost gibi iç adresleri reddetmeli (SSRF/spam savunması)
 *   · host daima URL'den türetilmeli — istemcinin gönderdiği host'a güvenilmez
 *   · Parola özeti PBKDF2 biçiminde ve sabit süreli karşılaştırmayla doğrulanmalı
 *   · IP adresi ham saklanmamalı; yalnızca tuzlu SHA-256 özeti tutulmalı (KVKK)
 *   · Oran sınırı pencere değişince sıfırlanmalı, sınırı aşınca kilitlenmeli
 *   · CORS yalnızca izinli kaynaklara açılmalı
 *   · Giriş modülü handler dışında değer dışa aktarmamalı (workerd kuralı)
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bildirimKaydi, kayitKimligi, yeniKayitlar } from '../bildirim-cek.mjs';
import {
  BILDIRIM_GUNLUK_SINIR,
  BLOB_GOVDE_SINIRI,
  BLOB_SINIRI,
  PBKDF2_TAVAN,
  PBKDF2_TUR,
  adminMi,
  baytUzunlugu,
  bildirimDogrula,
  bildirimTekrarMi,
  corsBasliklari,
  epostaGecerli,
  hostIzinli,
  ipTuzla,
  kaynakIzinli,
  oranAsildi,
  parolaDogrula,
  parolaGecerli,
  parolaOzetle,
  sabitSureliEsit,
  slugGecerli,
  taramaAyarNormalize,
  taramaKosuNormalize,
  urlGecerli,
  yolCoz,
} from '../../api/src/yardimci.mjs';
import * as apiGiris from '../../api/src/index.mjs';

const ORNEK_URL = 'https://video.sibnet.ru/shell.php?videoid=42';
const SIMDI = Date.parse('2026-10-01T12:00:00.000Z');

/* ================================================================ */
/* 0 · Giriş modülü sözleşmesi (workerd)                             */
/* ================================================================ */

// Gerçek hatayla öğrenildi: workerd, işçinin GİRİŞ modülünden yalnızca
// fonksiyon ya da ExportedHandler (fetch metotlu nesne) dışa aktarımı kabul eder.
// Sabit bir değer dışa aktarmak Worker'ı hiç açtırmaz:
//   Uncaught TypeError: Incorrect type for map entry 'BILDIRIM_GUNLUK_SINIR':
//   the provided value is not of type 'function or ExportedHandler'.
test('giriş modülü yalnızca handler dışa aktarır (workerd kuralı)', () => {
  const handlerMi = (deger) =>
    typeof deger === 'function' || (deger !== null && typeof deger === 'object' && typeof deger.fetch === 'function');
  for (const [ad, deger] of Object.entries(apiGiris)) {
    assert.ok(handlerMi(deger), `giriş modülü '${ad}' değerini dışa aktarmamalı; workerd 'function or ExportedHandler' ister`);
  }
  assert.equal(typeof apiGiris.default.fetch, 'function');
});

/* ================================================================ */
/* 1 · bildirim-cek.mjs — kuyruk aktarımı                            */
/* ================================================================ */

test('bildirimKaydi: geçerli kaydı daraltır, host URL’den türetilir', () => {
  const k = bildirimKaydi({ url: ORNEK_URL, anime: 'naruto', bolum: '12', tur: 'calismiyor', zaman: '2026-10-01T05:00:00.000Z' });
  assert.equal(k.url, ORNEK_URL);
  assert.equal(k.host, 'video.sibnet.ru');
  assert.equal(k.anime, 'naruto');
  assert.equal(k.bolum, 12);
  assert.equal(k.tur, 'calismiyor');
  assert.equal(k.zaman, '2026-10-01T05:00:00.000Z');
});

test('bildirimKaydi: geçersiz URL/slug reddedilir, bilinmeyen tür güvenli varsayılana düşer', () => {
  assert.equal(bildirimKaydi({ url: 'ftp://video.sibnet.ru/x' }), null);
  assert.equal(bildirimKaydi({ url: 'bu bir url değil' }), null);
  assert.equal(bildirimKaydi(null), null);
  assert.equal(bildirimKaydi({ url: ORNEK_URL, anime: 'Naruto Büyük' }), null);
  const k = bildirimKaydi({ url: ORNEK_URL, tur: 'saçmalık' });
  assert.equal(k.tur, 'calismiyor');
  assert.equal(k.bolum, null);
});

test('yeniKayitlar: geçersiz, yaşlı ve tekrar kayıtları süzer', () => {
  const mevcut = new Set([kayitKimligi({ url: 'https://ok.ru/video/1', anime: 'naruto', bolum: 1 })]);
  const { yeni, gecersiz, eski, tekrar } = yeniKayitlar(
    [
      { url: ORNEK_URL, anime: 'naruto', bolum: 2, zaman: '2026-10-01T05:00:00.000Z' },
      { url: ORNEK_URL, anime: 'naruto', bolum: 2, zaman: '2026-10-01T05:30:00.000Z' }, // aynı parti tekrarı
      { url: 'https://ok.ru/video/1', anime: 'naruto', bolum: 1, zaman: '2026-10-01T05:00:00.000Z' }, // dosyada var
      { url: 'https://example.com/v', zaman: '2020-01-01T00:00:00.000Z' }, // eski
      { url: 'https://example.com/v2' }, // zaman yok → şimdi (yeni sayılır)
    ],
    mevcut,
    SIMDI
  );
  assert.equal(yeni.length, 2, `yeni=${yeni.length}: ${JSON.stringify(yeni)}`);
  assert.equal(tekrar, 2);
  assert.equal(eski, 1);
  assert.equal(gecersiz, 0);
});

/* ================================================================ */
/* 2 · Worker — şema doğrulama                                       */
/* ================================================================ */

test('eposta/parola/slug doğrulaması sınırları korur', () => {
  assert.ok(epostaGecerli('kisi@ornek.com'));
  assert.ok(!epostaGecerli('kisi@ornek'));
  assert.ok(!epostaGecerli('kisi ornek.com'));
  assert.ok(!epostaGecerli('a'.repeat(300) + '@x.com'));
  assert.ok(parolaGecerli('uzun-parola-1'));
  assert.ok(!parolaGecerli('kısa'));
  assert.ok(!parolaGecerli('x'.repeat(201)));
  assert.ok(slugGecerli('naruto'));
  assert.ok(slugGecerli('one-piece-taose-kaizoku-ganzack'));
  assert.ok(!slugGecerli('Naruto'));
  assert.ok(!slugGecerli('-naruto'));
  assert.ok(!slugGecerli('naruto şapka'));
});

test('urlGecerli/hostIzinli: iç adresler ve IP’ler reddedilir', () => {
  assert.ok(urlGecerli(ORNEK_URL));
  assert.ok(!urlGecerli('http://127.0.0.1:8000/data.json'));
  assert.ok(!urlGecerli('http://localhost/x'));
  assert.ok(!urlGecerli('http://sunucu.local/x'));
  assert.ok(!urlGecerli('http://[::1]/x'));
  assert.ok(!urlGecerli('file:///etc/passwd'));
  assert.ok(!urlGecerli('https://kullanici:parola@ornek.com/x'));
  assert.ok(!urlGecerli('x'.repeat(2100)));
  assert.ok(hostIzinli('video.sibnet.ru'));
  assert.ok(!hostIzinli('localhost'));
  assert.ok(!hostIzinli('10.0.0.1'));
  assert.ok(!hostIzinli('teketiket'));
});

test('bildirimDogrula: host istemciden değil URL’den türetilir', () => {
  const iyi = bildirimDogrula({ url: ORNEK_URL, anime: 'naruto', bolum: 3, tur: 'donuk', host: 'sahte.example.com' });
  assert.equal(iyi.ok, true);
  assert.equal(iyi.veri.host, 'video.sibnet.ru');
  assert.equal(iyi.veri.bolum, 3);
  assert.equal(iyi.veri.tur, 'donuk');

  assert.deepEqual(bildirimDogrula({ url: 'http://10.0.0.1/x' }), { ok: false, hata: 'url-gecersiz' });
  assert.deepEqual(bildirimDogrula({ url: ORNEK_URL, bolum: 0 }), { ok: false, hata: 'bolum-gecersiz' });
  assert.deepEqual(bildirimDogrula({ url: ORNEK_URL, bolum: 2.5 }), { ok: false, hata: 'bolum-gecersiz' });
  assert.deepEqual(bildirimDogrula({ url: ORNEK_URL, anime: 'Naruto!' }), { ok: false, hata: 'anime-gecersiz' });
  assert.deepEqual(bildirimDogrula({ url: ORNEK_URL, tur: 'hack' }), { ok: false, hata: 'tur-gecersiz' });
  assert.deepEqual(bildirimDogrula(null), { ok: false, hata: 'govde-yok' });

  const varsayilan = bildirimDogrula({ url: ORNEK_URL });
  assert.equal(varsayilan.veri.tur, 'calismiyor');
  assert.equal(varsayilan.veri.anime, null);
});

/* ================================================================ */
/* 3 · Worker — yönlendirme                                          */
/* ================================================================ */

test('yolCoz: uçlar ve yöntem denetimi', () => {
  assert.equal(yolCoz('/', 'GET').islem, 'kok');
  assert.equal(yolCoz('/saglik', 'GET').islem, 'saglik');
  assert.equal(yolCoz('/bildirim', 'POST').islem, 'bildirim-ekle');
  assert.equal(yolCoz('/bildirim', 'GET').islem, 'bildirim-liste');
  assert.deepEqual(yolCoz('/bildirim/17/', 'POST'), { islem: 'bildirim-durum', id: 17 });
  assert.equal(yolCoz('/auth/kayit', 'POST').islem, 'auth-kayit');
  assert.equal(yolCoz('/auth/yenile', 'POST').islem, 'auth-yenile');
  assert.equal(yolCoz('/me/durum', 'GET').islem, 'me-okuma');
  assert.equal(yolCoz('/me/durum', 'PUT').islem, 'me-yazma');
  assert.equal(yolCoz('/me/veri', 'GET').islem, 'me-veri');
  assert.equal(yolCoz('/me', 'DELETE').islem, 'me-sil');

  assert.equal(yolCoz('/tarama/ayar', 'GET').islem, 'tarama-ayar');
  assert.equal(yolCoz('/tarama/ayar', 'PUT').islem, 'tarama-ayar-yaz');
  assert.equal(yolCoz('/tarama/durum', 'GET').islem, 'tarama-durum');
  assert.equal(yolCoz('/tarama/kosu', 'POST').islem, 'tarama-kosu');
  assert.equal(yolCoz('/tarama/kalp', 'POST').islem, 'tarama-kalp');

  assert.equal(yolCoz('/bildirim', 'DELETE').islem, 'yontem-yok');
  assert.equal(yolCoz('/me/durum', 'POST').islem, 'yontem-yok');
  assert.equal(yolCoz('/tarama/ayar', 'POST').islem, 'yontem-yok');
  assert.equal(yolCoz('/tarama/kosu', 'GET').islem, 'yontem-yok');
  assert.equal(yolCoz('/yok', 'GET').islem, 'yok');
});

/* ================================================================ */
/* 3b · Panel ayarları — güvenli aralığa indirme                     */
/* ================================================================ */

// Panelden gelen bozuk/aşırı uç değerler döngüyü düşürmemeli: varsayılana dönmeli
// ya da sınıra kırpılmalı. Aksi hâlde "yanlış sayı girdim, gece 300 bin URL tarandı"
// gibi pahalı ya da tam tersi işe yaramaz bir koşu doğar.
test('taramaAyarNormalize: eksik alan varsayılana döner', () => {
  assert.deepEqual(taramaAyarNormalize(undefined), {
    aktif: 1,
    dilim: 1500,
    saat: 4,
    yayinla: 0,
    push: 0,
    hemen: 0,
  });
  assert.deepEqual(taramaAyarNormalize({}), taramaAyarNormalize(null));
});

test('taramaAyarNormalize: sınır dışı değerler kırpılır, bayraklar 0/1 olur', () => {
  const ayar = taramaAyarNormalize({ aktif: '0', dilim: 999999, saat: 42, yayinla: true, push: 1, hemen: 'evet' });
  assert.equal(ayar.aktif, 0, '"0" pasif olmalı');
  assert.equal(ayar.dilim, 20000, 'dilim üst sınıra kırpılmalı');
  assert.equal(ayar.saat, 23, 'saat 0-23 aralığına girmeli');
  assert.equal(ayar.yayinla, 1);
  assert.equal(ayar.push, 1);
  assert.equal(ayar.hemen, 0, 'tanınmayan bayrak değeri 0 sayılmalı');
  assert.equal(taramaAyarNormalize({ dilim: 3 }).dilim, 25, 'dilim alt sınıra çekilmeli');
  assert.equal(taramaAyarNormalize({ dilim: 1500.7 }).dilim, 1501, 'ondalık yuvarlanmalı');
});

test('taramaKosuNormalize: metin alanları budanır, sonuç yalnızca ok/hata', () => {
  const kayit = taramaKosuNormalize({
    makine: '  masaustu-naton  ',
    dilim: 200,
    sure_sn: 61.4,
    sonuc: 'basarisiz',
    kapsam: 'dağılım ok 173027 · ölü 301',
    not_metni: 'x'.repeat(9000),
  });
  assert.equal(kayit.makine, 'masaustu-naton');
  assert.equal(kayit.dilim, 200);
  assert.equal(kayit.sure_sn, 61);
  // Yalnızca tam "hata" başarısızlık sayılır: döngü zaten bu iki değerden birini gönderir,
  // tanınmayan bir değer yüzünden "başarısız" görünüp gereksiz alarm üretmesin.
  assert.equal(kayit.sonuc, 'ok', 'tanınmayan sonuç ok sayılır');
  assert.equal(taramaKosuNormalize({ sonuc: 'hata' }).sonuc, 'hata');
  assert.equal(kayit.not_metni.length, 4000, 'log kuyruğu sınırlanmalı');
  assert.equal(taramaKosuNormalize({}).makine, 'bilinmiyor');
  assert.equal(taramaKosuNormalize({ sonuc: 'ok' }).sonuc, 'ok');
});

/* ================================================================ */
/* 4 · Worker — kriptografi                                          */
/* ================================================================ */

test('parolaOzetle/parolaDogrula: PBKDF2 gidiş-dönüş, hatalı parola reddi', async () => {
  const ozet = await parolaOzetle('çok-gizli-parola', null, 1000); // testte iterasyon düşük
  assert.match(ozet, /^1000:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.ok(await parolaDogrula('çok-gizli-parola', ozet));
  assert.ok(!(await parolaDogrula('yanlış-parola', ozet)));
  assert.ok(!(await parolaDogrula('çok-gizli-parola', 'bozuk')));
  assert.ok(!(await parolaDogrula('çok-gizli-parola', null)));

  // Tuz hash içinde taşınır: aynı parola iki kez özetlenirse farklı çıktı olur.
  const ikinci = await parolaOzetle('çok-gizli-parola', null, 1000);
  assert.notEqual(ozet, ikinci);
});

// Gerçek hatayla öğrenildi (H-20): workerd üretimde PBKDF2'de 100.000'in üzerini
// reddeder ("iteration counts above 100000 are not supported"), ama yerel
// `wrangler dev` bu sınırı uygulamaz. 210.000 ile bütün yerel testler geçerken
// üretimde kayıt/giriş 500 dönüyordu; bu test sınırı yerelde yakalar.
test('PBKDF2_TUR platform tavanını aşmaz', () => {
  assert.equal(PBKDF2_TAVAN, 100_000);
  assert.ok(PBKDF2_TUR <= PBKDF2_TAVAN, `PBKDF2_TUR=${PBKDF2_TUR} tavanı aşıyor`);
  assert.ok(PBKDF2_TUR >= 100_000, 'iterasyon sayısı platform tavanında olmalı (tavanın altına inmenin gerekçesi yok)');
});

test('parolaDogrula: tavandan yüksek iterasyonlu kayıtta hata fırlatmaz, reddeder', async () => {
  const yuksek = '210000:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  assert.equal(await parolaDogrula('herhangi-parola', yuksek), false);
});

test('sabitSureliEsit: uzunluk ve içerik farkını doğru bildirir', () => {
  assert.ok(sabitSureliEsit('abc123', 'abc123'));
  assert.ok(!sabitSureliEsit('abc123', 'abc124'));
  assert.ok(!sabitSureliEsit('abc123', 'abc1234'));
  assert.ok(!sabitSureliEsit(null, 'abc'));
});

test('ipTuzla: ham IP saklanmaz, tuz değişince özet değişir', async () => {
  const a = await ipTuzla('203.0.113.7', 'tuz-1');
  const b = await ipTuzla('203.0.113.7', 'tuz-1');
  const c = await ipTuzla('203.0.113.7', 'tuz-2');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes('203.0.113'));
});

/* ================================================================ */
/* 5 · Worker — CORS ve yetki                                        */
/* ================================================================ */

test('kaynakIzinli/corsBasliklari: yalnızca site kaynağına açılır', () => {
  const env = { SITE_ORIGIN: 'https://genesisanime.github.io', CORS_EXTRA: 'http://127.0.0.1:8000' };
  assert.ok(kaynakIzinli('https://genesisanime.github.io', env));
  assert.ok(kaynakIzinli('http://127.0.0.1:8000', env));
  assert.ok(kaynakIzinli('https://genesisanime.github.io/', env));
  assert.ok(!kaynakIzinli('https://kotu-site.example', env));
  assert.ok(!kaynakIzinli(null, env));

  const izinli = corsBasliklari('https://genesisanime.github.io', env);
  assert.equal(izinli['Access-Control-Allow-Origin'], 'https://genesisanime.github.io');
  const yabanci = corsBasliklari('https://kotu-site.example', env);
  assert.equal(yabanci['Access-Control-Allow-Origin'], undefined);
  assert.equal(yabanci.Vary, 'Origin');
});

test('adminMi: jeton eşleşmesi ADMIN_TOKEN olmadan asla doğru dönmez', () => {
  const istek = (jeton) =>
    new Request('https://api.example/bildirim', { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} });
  assert.ok(adminMi(istek('gizli-jeton'), { ADMIN_TOKEN: 'gizli-jeton' }));
  assert.ok(!adminMi(istek('yanlis'), { ADMIN_TOKEN: 'gizli-jeton' }));
  assert.ok(!adminMi(istek('gizli-jeton'), {}), 'ADMIN_TOKEN tanımsızken admin kapalı olmalı');
  assert.ok(!adminMi(istek(null), { ADMIN_TOKEN: 'gizli-jeton' }));
});

/* ================================================================ */
/* 6 · Worker — D1 mantığı (sentetik sahte ile)                      */
/* ================================================================ */

/** `oranAsildi` sorgularını karşılayan minimal sahte D1. */
function sahteOranDb() {
  const satirlar = new Map();
  return {
    satirlar,
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...p) {
          return {
            async first() {
              if (s.startsWith('SELECT pencere, sayi FROM oran WHERE anahtar = ?')) return satirlar.get(p[0]) ?? null;
              throw new Error(`beklenmeyen sorgu: ${s}`);
            },
            async run() {
              if (s.startsWith('INSERT INTO oran')) {
                const mevcut = satirlar.get(p[0]);
                const sayi = mevcut && mevcut.pencere === p[1] ? mevcut.sayi : 0;
                satirlar.set(p[0], { pencere: p[1], sayi });
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('UPDATE oran SET sayi = sayi + 1')) {
                const satir = satirlar.get(p[0]);
                if (!satir || satir.pencere !== p[1] || satir.sayi >= p[2]) return { meta: { changes: 0 } };
                satir.sayi++;
                return { meta: { changes: 1 } };
              }
              throw new Error(`beklenmeyen sorgu: ${s}`);
            },
          };
        },
      };
    },
  };
}

test('oranAsildi: sınır aşılınca kilitlenir, pencere değişince sıfırlanır', async () => {
  const db = sahteOranDb();
  const sinir = 3;
  assert.equal(await oranAsildi(db, 'bildirim:ip1', '2026-10-01', sinir), false);
  assert.equal(await oranAsildi(db, 'bildirim:ip1', '2026-10-01', sinir), false);
  assert.equal(await oranAsildi(db, 'bildirim:ip1', '2026-10-01', sinir), false);
  assert.equal(await oranAsildi(db, 'bildirim:ip1', '2026-10-01', sinir), true, '4. istekte sınır aşılmalı');
  assert.equal(await oranAsildi(db, 'bildirim:ip1', '2026-10-02', sinir), false, 'yeni pencerede sayaç sıfırlanmalı');
  assert.equal(await oranAsildi(db, 'bildirim:ip2', '2026-10-02', sinir), false, 'başka anahtar bağımsız olmalı');
});

// Eski sürüm SELECT + UPDATE ayrı adımlardı: eşzamanlı istekler sınırı aşabiliyordu.
// Bu test, kararın ve artırmanın tek atomik ifadede olduğunu çiviler.
test('oranAsildi: eşzamanlı istekler sınırı aşamaz (atomik koşullu artırma)', async () => {
  const db = sahteOranDb();
  const sinir = 3;
  const sonuclar = await Promise.all(Array.from({ length: 10 }, () => oranAsildi(db, 'bildirim:es', '2026-10-01', sinir)));
  const engellenen = sonuclar.filter(Boolean).length;
  assert.equal(engellenen, 10 - sinir, `10 eşzamanlı istekte tam ${sinir} tanesi geçmeli; engellenen=${engellenen}`);
  assert.equal(db.satirlar.get('bildirim:es').sayi, sinir, 'sayaç sınırın üzerine çıkmamalı');
});

test('bildirimTekrarMi: aynı IP son 24 saatte aynı URL’i bildirdiyse tekrar', async () => {
  const ucSaatOnce = new Date(Date.now() - 3 * 3600_000).toISOString();
  const ikiGunOnce = new Date(Date.now() - 48 * 3600_000).toISOString();
  const kayitlar = [
    { url: ORNEK_URL, ip: 'ip1', zaman: ucSaatOnce },
    { url: 'https://ok.ru/video/9', ip: 'ip2', zaman: ucSaatOnce },
    { url: 'https://ok.ru/video/8', ip: 'ip1', zaman: ikiGunOnce },
  ];
  const db = {
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (!s.startsWith('SELECT id FROM bildirim WHERE url = ? AND ip_hash = ? AND zaman > ?')) {
        throw new Error(`beklenmeyen sorgu: ${s}`);
      }
      return {
        bind(url, ip, esik) {
          return {
            async first() {
              return kayitlar.find((k) => k.url === url && k.ip === ip && k.zaman > esik) ?? null;
            },
          };
        },
      };
    },
  };
  assert.equal(await bildirimTekrarMi(db, ORNEK_URL, 'ip1'), true);
  assert.equal(await bildirimTekrarMi(db, ORNEK_URL, 'ip2'), false, 'başka IP tekrar sayılmamalı');
  assert.equal(await bildirimTekrarMi(db, 'https://ok.ru/video/9', 'ip1'), false);
  assert.equal(
    await bildirimTekrarMi(db, 'https://ok.ru/video/8', 'ip1'),
    false,
    '24 saatten eski kayıt tekrar sayılmamalı'
  );
});

test('BILDIRIM_GUNLUK_SINIR makul aralıkta (spam ile kullanılabilirlik dengesi)', () => {
  assert.ok(BILDIRIM_GUNLUK_SINIR >= 5 && BILDIRIM_GUNLUK_SINIR <= 100);
});

// Gerçek hatayla öğrenildi: gövde sınırı (64 KB) blob sınırından (512 KB) küçük
// olunca `413 veri-buyuk` yolu HİÇ ulaşılamıyordu; büyük senkron paketleri de
// sessizce `govde-buyuk` ile reddediliyordu. Bu test iki sınırın ilişkisini korur.
test('blob sınırları: taşıma sınırı blob sınırını gölgelemez', () => {
  assert.ok(BLOB_GOVDE_SINIRI > BLOB_SINIRI, 'taşıma sınırı blob sınırından büyük olmalı');
  // İç içe JSON dizesi tırnak kaçışıyla ~2 katına şişebilir; pay bırakılmalı.
  assert.ok(BLOB_GOVDE_SINIRI >= 2 * BLOB_SINIRI, 'JSON kaçış payı bırakılmalı');
  // D1 satır/string sınırı 2 MB; blob onun rahat altında kalmalı.
  assert.ok(BLOB_SINIRI <= 1024 * 1024, 'blob D1 satır sınırına yaklaşmamalı');
});

test('baytUzunlugu: UTF-8 baytını sayar (dize uzunluğundan farklı)', () => {
  assert.equal(baytUzunlugu('naruto'), 6);
  assert.equal(baytUzunlugu('ğüşiöç'), 11, 'Türkçe harfler 2 bayt, i 1 bayt');
  assert.equal(baytUzunlugu('😀'), 4, 'astral karakter 4 bayt');
  assert.equal(baytUzunlugu(''), 0);
});
