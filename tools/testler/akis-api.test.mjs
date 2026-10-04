/**
 * akis-api.test.mjs — akış köprüsünün sunucu (Worker) tarafı
 *
 * Akış köprüsü iki uçtan oluşur (api/src/akis.mjs):
 *   /akis/coz    → embed adresi → doğrudan akış adresi (bugün: Mail.ru)
 *   /akis/aktar  → medya baytlarını Range'i koruyarak aktarır
 *
 * Neyi korur:
 *   · Embed HTML'inden video kimliği ve meta yanıtından akış adresi çıkarımı
 *     (ölçümde gerçek yanıtlardan alınan örneklerle)
 *   · `/akis/aktar` bir **açık proxy değildir**: yalnız izin listesindeki host,
 *     yalnız https, yalnız imzalı adres
 *   · Range/If-Range başlıkları kaynağa iletilir (sarma çalışsın diye)
 *   · HTML hata sayfası video sanılmasın: medya olmayan yanıt geçirilmez
 *
 * Ağ yok: `fetch` enjekte edilir. Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const akis = await import('../../api/src/akis.mjs');
const yardimci = await import('../../api/src/yardimci.mjs');

/* Ölçümden alınan gerçek parçalar (docs/olcum/akis-2026-10-02.json). */
const EMBED_HTML = `<!DOCTYPE html><html><head><title>[TACE] 009-1 01 :: video.mail.ru</title></head>
<body><script>window.__player={"metadataUrl":"//my.mail.ru/+\\/video\\/meta\\/3077395774695276545","dash_enabled":"3"}</script></body></html>`;

const META_JSON = `{"meta":{"videos":[{"url":"//cdn62.my.mail.ru/v/46642779.mp4?slave[]=s%3Ahttp%3A%2F%2F10.146.243.1%3A8002%2Frados2%2F46642779-v&p=f&video_key=5e6131c725ea8d7b265cdff060323c898ac64826&expire_at=1790985600&touch=139"}],"duration":1450}}`;

const EMBED = 'https://videoapi.my.mail.ru/videos/embed/gmail.com/alonealadyofdarkness/_myvideo/1.html';

/* ------------------------------ saf yardımcılar ------------------------------ */

test('metniCoz: JSON kaçışları ve HTML varlıkları geri açılır', () => {
  assert.equal(akis.metniCoz('a\\/b'), 'a/b');
  assert.equal(akis.metniCoz('x\\u0026y'), 'x&y');
  assert.equal(akis.metniCoz('&quot;u&quot;'), '"u"');
  assert.equal(akis.metniCoz('a&amp;b'), 'a&b');
  assert.equal(akis.metniCoz(''), '');
  assert.equal(akis.metniCoz(null), '');
});

test('metaKimligi: embed HTML\'inden video kimliği çıkarılır', () => {
  assert.equal(akis.metaKimligi(EMBED_HTML), '3077395774695276545');
  assert.equal(akis.metaKimligi('<html>player yok</html>'), null);
  assert.equal(akis.metaKimligi(''), null);
  /* Kısa sayı kimlik sayılmaz: yanlış eşleşme üretmesin. */
  assert.equal(akis.metaKimligi('/+/video/meta/12'), null);
});

test('metaAkisi: imzalı mp4 adresi ve imza bitişi okunur', () => {
  const akisSonuc = akis.metaAkisi(META_JSON);
  assert.ok(akisSonuc, 'akış bulunmalı');
  assert.equal(akisSonuc.tur, 'mp4');
  assert.ok(akisSonuc.url.startsWith('https://cdn62.my.mail.ru/v/46642779.mp4?'), akisSonuc.url);
  assert.ok(akisSonuc.url.includes('video_key='), 'imza parametresi korunmalı');
  assert.equal(akisSonuc.imzaBitis, 1790985600 * 1000);
});

test('metaAkisi: protokolsüz adres https\'e tamamlanır, çöp yük null döner', () => {
  assert.ok(akis.metaAkisi('{"url":"//cdn62.my.mail.ru/v/1.mp4?video_key=x"}').url.startsWith('https://'));
  assert.equal(akis.metaAkisi('{"url":"/v/1.mp4"}'), null, 'şemasız adres kabul edilmez');
  assert.equal(akis.metaAkisi('{"url":"https://cdn.ok/1.mp4?a=1"}').imzaBitis, null);
  assert.equal(akis.metaAkisi('<html>404</html>'), null);
  assert.equal(akis.metaAkisi('{}'), null);
  assert.equal(akis.metaAkisi(null), null);
});

test('kaynakTuru: katalogdaki resolver hostları tanınır; benzer host reddedilir', () => {
  assert.equal(akis.kaynakTuru(EMBED), 'mail');
  assert.equal(akis.kaynakTuru('https://my.mail.ru/video/embed/1'), 'mail');
  assert.equal(akis.kaynakTuru('https://video.sibnet.ru/shell.php?videoid=1'), 'sibnet');
  assert.equal(akis.kaynakTuru('https://ok.ru/videoembed/1'), 'odnoklassniki');
  assert.equal(akis.kaynakTuru('https://uqload.com/embed-x.html'), 'uqload');
  assert.equal(akis.kaynakTuru('https://my.mail.ru.kotu.example/x'), null);
  assert.equal(akis.kaynakTuru('bu adres değil'), null);
  assert.equal(akis.kaynakTuru(''), null);
});

test('kapsam hostları resolver tablosundan türetilir ve katalogdaki tüm player URLlerini kapsar', () => {
  const hostlar = akis.desteklenenHostlar();
  assert.equal(new Set(hostlar).size, hostlar.length, 'host kapsamı tekil olmalı');
  assert.equal(akis.hostEslesir('cdn62.my.mail.ru', 'my.mail.ru'), true);
  assert.equal(akis.hostEslesir('my.mail.ru.kotu.example', 'my.mail.ru'), false);

  const klasor = new URL('../../public/data/anime/', import.meta.url);
  const playerlar = new Set();
  for (const dosya of readdirSync(klasor).filter((ad) => ad.endsWith('.json'))) {
    const anime = JSON.parse(readFileSync(new URL(dosya, klasor), 'utf8'));
    for (const bolum of anime.bolumler ?? []) {
      for (const kaynak of bolum.src ?? []) {
        const adres = kaynak[2].startsWith('https://href.li/?') ? kaynak[2].slice('https://href.li/?'.length) : kaynak[2];
        let host;
        try {
          host = new URL(adres).hostname;
        } catch {
          assert.fail(`${kaynak[0]} URL'si ayrıştırılamıyor: ${kaynak[2]}`);
        }
        playerlar.add(kaynak[0]);
        assert.ok(hostlar.some((taban) => akis.hostEslesir(host, taban)), `katalog host'u kapsamda olmalı: ${kaynak[0]} / ${host}`);
        assert.ok(akis.kaynakTuru(adres), `katalog player URL'si resolver tarafından tanınmalı: ${kaynak[0]} / ${host}`);
      }
    }
  }
  assert.equal(playerlar.size, 21, 'katalogdaki tüm player tipleri denetlenmeli');
});

test('aktarimIzni: açık proxy engeli (host + https + imza)', () => {
  assert.deepEqual(akis.aktarimIzni('https://cdn62.my.mail.ru/v/1.mp4?video_key=abc'), {
    ok: true,
    host: 'cdn62.my.mail.ru',
  });
  assert.equal(akis.aktarimIzni('https://kotu.example/x.mp4?video_key=abc').hata, 'host-izinli-degil');
  assert.equal(akis.aktarimIzni('https://cdn62.my.mail.ru/v/1.mp4').hata, 'imzasiz-adres');
  assert.equal(akis.aktarimIzni('http://cdn62.my.mail.ru/v/1.mp4?video_key=abc').hata, 'yalniz-https');
  assert.equal(akis.aktarimIzni('file:///etc/passwd?video_key=x').hata, 'yalniz-https');
  assert.equal(akis.aktarimIzni('').hata, 'adres-gecersiz');
  /* Alt alan adı kapsanır, ama "benzer" host kandırmaz. */
  assert.equal(akis.aktarimIzni('https://a.b.my.mail.ru.evil.com/v.mp4?sig=1').ok, false);
  assert.equal(akis.aktarimIzni('https://vd196.okcdn.ru/video.m3u8?expires=1&sig=x').ok, true);
  assert.equal(akis.aktarimIzni('https://a3.mp4upload.com/d/abc/video.mp4').hata, 'imzasiz-adres');
  assert.equal(akis.aktarimIzni('https://a3.mp4upload.com:183/d/xsxs2p5az3b4quuoz2rrk2yxc7hxjhiwholihg446sbf4verowabzkzn7nxu5emrwa3tsord/video.mp4').ok, true);
  assert.equal(akis.aktarimIzni('https://s18.hdvid.tv/short/v.mp4').hata, 'imzasiz-adres');
});

test('akisAdaylari: allowlistli imzalı MP4/WebM bulunur; keyfi, HTTP ve imzasız URL elenir', () => {
  const imzali = 'https://a3.mp4upload.com:183/d/xsxs2p5az3b4quuoz2rrk2yxc7hxjhiwholihg446sbf4verowabzkzn7nxu5emrwa3tsord/video.mp4';
  const html = `<video><source src="${imzali}"></video><script>file: "https://evil.example/video.mp4?token=x"</script><script>file: "http://a3.mp4upload.com/plain.mp4?token=x"</script>`;
  assert.deepEqual(akis.akisAdaylari(html, 'https://www.mp4upload.com/embed-x.html'), [{ url: imzali, tur: 'mp4' }]);
});

test('akisCoz: genel resolver statik MP4 bulur; uzak JavaScript çalıştırılmaz', async () => {
  const url = 'https://s18.hdvid.tv/uirole5wwm4swchrln2xpfkapps42vqpm3flauq5uu46zxddfxttol6gqieq/v.mp4';
  const fetchImpl = sahteFetch([{ govde: `<script>file: "${url}"</script>` }]);
  const sonuc = await akis.akisCoz('https://hdvid.tv/embed-test.html', { fetchImpl });
  assert.deepEqual(sonuc, { ok: true, kaynakAdi: 'hdvid', tur: 'mp4', url, imzaBitis: null });
  assert.equal(fetchImpl.cagrilar.length, 1);
});

/* ------------------------------ çözümleme akışı ------------------------------ */

function sahteFetch(yanitlar) {
  const cagrilar = [];
  const fn = async (adres, secenekler) => {
    cagrilar.push({ adres, secenekler });
    const yanit = yanitlar.shift();
    if (!yanit) throw new Error('beklenmeyen istek: ' + adres);
    if (yanit.agHatasi) throw new Error('ag hatasi');
    return new Response(yanit.govde ?? '', {
      status: yanit.durum ?? 200,
      headers: yanit.basliklar ?? {},
    });
  };
  fn.cagrilar = cagrilar;
  return fn;
}

test('akisCoz: embed → meta → imzalı akış (iki adım)', async () => {
  const fetchImpl = sahteFetch([
    { govde: EMBED_HTML, basliklar: { 'content-type': 'text/html' } },
    { govde: META_JSON, basliklar: { 'content-type': 'application/json' } },
  ]);
  const sonuc = await akis.akisCoz(EMBED, { fetchImpl });
  assert.equal(sonuc.ok, true);
  assert.equal(sonuc.kaynakAdi, 'mail');
  assert.equal(sonuc.kimlik, '3077395774695276545');
  assert.ok(sonuc.url.includes('video_key='));
  assert.equal(fetchImpl.cagrilar.length, 2);
  assert.ok(fetchImpl.cagrilar[1].adres.includes('/+/video/meta/3077395774695276545'), fetchImpl.cagrilar[1].adres);
});

test('akisCoz: desteklenen fakat statik akışı olmayan provider anlaşılır hata verir', async () => {
  const desteklenmeyen = await akis.akisCoz('https://video.sibnet.ru/shell.php?videoid=1', {
    fetchImpl: sahteFetch([{ govde: '<html>player JavaScript/API ile yükleniyor</html>' }]),
  });
  assert.equal(desteklenmeyen.hata, 'akis-bulunamadi');

  const embedYok = await akis.akisCoz(EMBED, { fetchImpl: sahteFetch([{ durum: 403 }]) });
  assert.equal(embedYok.hata, 'embed-alinamadi');
  assert.equal(embedYok.durum, 403);

  const kimlikYok = await akis.akisCoz(EMBED, { fetchImpl: sahteFetch([{ govde: '<html>bos</html>' }]) });
  assert.equal(kimlikYok.hata, 'kimlik-bulunamadi');

  const akisYok = await akis.akisCoz(EMBED, {
    fetchImpl: sahteFetch([{ govde: EMBED_HTML }, { govde: '{"meta":{}}' }]),
  });
  assert.equal(akisYok.hata, 'akis-bulunamadi');

  const agHatasi = await akis.akisCoz(EMBED, { fetchImpl: sahteFetch([{ agHatasi: true }]) });
  assert.equal(agHatasi.hata, 'embed-alinamadi');
  assert.equal(agHatasi.durum, 0);
});

/* ------------------------------- aktarım ucu ------------------------------- */

const IMZALI = 'https://cdn62.my.mail.ru/v/46642779.mp4?video_key=abc&expire_at=1790985600';

function sahteIstek(basliklar = {}, yontem = 'GET') {
  return { headers: new Headers(basliklar), method: yontem };
}

test('aktar: Range ve If-Range kaynağa iletilir, medya başlıkları korunur', async () => {
  const fetchImpl = sahteFetch([
    {
      durum: 206,
      govde: 'x'.repeat(10),
      basliklar: {
        'content-type': 'video/mp4',
        'content-length': '10',
        'content-range': 'bytes 0-9/169600484',
        'accept-ranges': 'bytes',
        etag: '"abc"',
      },
    },
  ]);
  const sonuc = await akis.aktar(sahteIstek({ Range: 'bytes=0-9', 'If-Range': '"abc"' }), IMZALI, { fetchImpl });
  assert.equal(sonuc.durum, 206);
  assert.equal(sonuc.basliklar['Content-Type'], 'video/mp4');
  assert.equal(sonuc.basliklar['Content-Range'], 'bytes 0-9/169600484');
  assert.equal(sonuc.basliklar['Accept-Ranges'], 'bytes');
  assert.equal(
    sonuc.basliklar['Access-Control-Expose-Headers'],
    'Content-Range, Content-Length, Accept-Ranges',
    'oynatıcı aralık bilgisini JS’ten okuyabilsin'
  );
  const gonderilen = fetchImpl.cagrilar[0].secenekler.headers;
  assert.equal(gonderilen.Range, 'bytes=0-9');
  assert.equal(gonderilen['If-Range'], '"abc"');
});

test('aktar: izin verilmeyen hedef ve imzasız adres hiç istenmez', async () => {
  const fetchImpl = sahteFetch([]);
  const kotu = await akis.aktar(sahteIstek(), 'https://kotu.example/v.mp4?video_key=1', { fetchImpl });
  assert.equal(kotu.durum, 400);
  assert.equal(kotu.hata, 'host-izinli-degil');

  const imzasiz = await akis.aktar(sahteIstek(), 'https://cdn62.my.mail.ru/v/1.mp4', { fetchImpl });
  assert.equal(imzasiz.hata, 'imzasiz-adres');

  const bos = await akis.aktar(sahteIstek(), '', { fetchImpl });
  assert.equal(bos.hata, 'adres-gecersiz');

  assert.equal(fetchImpl.cagrilar.length, 0, 'izin verilmeyen adres için ağ isteği yapılmamalı');
});

test('aktar: medya olmayan yanıt geçirilmez (HTML hata sayfası video sanılmasın)', async () => {
  const html = sahteFetch([{ durum: 403, govde: '<html>403</html>', basliklar: { 'content-type': 'text/html' } }]);
  const sonuc = await akis.aktar(sahteIstek(), IMZALI, { fetchImpl: html });
  assert.equal(sonuc.durum, 502);
  assert.equal(sonuc.hata, 'medya-degil');
  assert.equal(sonuc.tip, 'text/html');
});

test('aktar: kaynak ağ hatası 502 olarak raporlanır', async () => {
  const sonuc = await akis.aktar(sahteIstek(), IMZALI, { fetchImpl: sahteFetch([{ agHatasi: true }]) });
  assert.equal(sonuc.durum, 502);
  assert.equal(sonuc.hata, 'kaynak-erisilemedi');
});

test('taze çözümleme: istemci `?t=` gönderirse önbellek atlanır', () => {
  assert.equal(akis.onbellekAtlaMi(new URLSearchParams('kaynak=https%3A%2F%2Fx&t=1790985600000')), true);
  assert.equal(akis.onbellekAtlaMi(new URLSearchParams('kaynak=x')), false);
  assert.equal(akis.onbellekAtlaMi(new URLSearchParams('kaynak=x&t=')), true, 'boş değer de atlama sayılır (varlık yeter)');
  assert.equal(akis.onbellekAtlaMi(null), false);
  assert.equal(akis.onbellekAtlaMi({}), false, 'eksik arayüz çökertmez');
});

test('CORS: Range başlığı izinli (oynatıcı 2 baytlık yoklama yapabilsin)', () => {
  const basliklar = yardimci.corsBasliklari('https://genesisanime.github.io', { SITE_ORIGIN: 'https://genesisanime.github.io' });
  assert.match(basliklar['Access-Control-Allow-Headers'], /Range/);
});

/* ================================================================= */
/* Uç — /akis/coz önbellek davranışı (Cache API ve fetch taklit edilir) */
/* ================================================================= */

test('uç: /akis/coz önbelleği kullanır, `?t=` ile atlar ve sonucu tazeler', async () => {
  const varsayilan = await import('../../api/src/index.mjs');
  const kapi = varsayilan.default;

  const eskiFetch = globalThis.fetch;
  const eskiCaches = globalThis.caches;
  let upstream = 0;
  const depo = new Map();
  try {
    globalThis.fetch = async (adres) => {
      upstream += 1;
      return String(adres).includes('/+/video/meta/')
        ? new Response(META_JSON, { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(EMBED_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    };
    globalThis.caches = {
      default: {
        async match(anahtar) {
          const yanit = depo.get(anahtar.url);
          return yanit ? yanit.clone() : undefined;
        },
        async put(anahtar, yanit) {
          depo.set(anahtar.url, yanit.clone());
        },
      },
    };

    const env = { SITE_ORIGIN: 'https://genesisanime.github.io' };
    const adres = (taze) =>
      `https://api.test/akis/coz?kaynak=${encodeURIComponent(EMBED)}${taze ? '&t=' + Date.now() : ''}`;

    const ilk = await kapi.fetch(new Request(adres(false)), env, {});
    assert.equal(ilk.status, 200);
    const ilkGovde = await ilk.json();
    assert.equal(ilkGovde.ok, true);
    assert.match(ilkGovde.aktarim, /\/akis\/aktar\?u=/, 'aktarım adresi üretilmeli');
    assert.equal(ilk.headers.get('X-Akis-Onbellek'), null, 'ilk çözümleme önbellekten gelmez');
    const ilkUpstream = upstream;
    assert.equal(ilkUpstream, 2, 'iki adım: embed + meta');

    const ikinci = await kapi.fetch(new Request(adres(false)), env, {});
    assert.equal(ikinci.headers.get('X-Akis-Onbellek'), 'vuruldu');
    assert.equal(upstream, ilkUpstream, 'önbellek vurunca kaynağa istek gitmemeli');

    const taze = await kapi.fetch(new Request(adres(true)), env, {});
    assert.equal(taze.headers.get('X-Akis-Onbellek'), 'atlandi');
    assert.equal(upstream, ilkUpstream + 2, '`?t=` önbelleği atlayıp kaynağı yeniden çözmeli');
  } finally {
    globalThis.fetch = eskiFetch;
    if (eskiCaches === undefined) delete globalThis.caches;
    else globalThis.caches = eskiCaches;
  }
});

test('uç: /akis/coz günlük IP sınırını uygular, önbellek vuruşu sayılmaz', async () => {
  const varsayilan = await import('../../api/src/index.mjs');
  const kapi = varsayilan.default;

  const eskiFetch = globalThis.fetch;
  const eskiCaches = globalThis.caches;
  let upstream = 0;
  try {
    globalThis.fetch = async (adres) => {
      upstream += 1;
      return String(adres).includes('/+/video/meta/')
        ? new Response(META_JSON, { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(EMBED_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    };
    globalThis.caches = { default: { async match() { return undefined; }, async put() {} } };

    /* `oranAsildi`nin iki sorgusunu karşılayan minimal sahte D1 (bildirim testiyle aynı desen). */
    const sayilar = new Map();
    const db = {
      prepare(sql) {
        const s = sql.replace(/\s+/g, ' ').trim();
        return {
          bind(...p) {
            return {
              async run() {
                if (s.startsWith('INSERT INTO oran')) {
                  const mevcut = sayilar.get(p[0]);
                  sayilar.set(p[0], { pencere: p[1], sayi: mevcut && mevcut.pencere === p[1] ? mevcut.sayi : 0 });
                  return { meta: { changes: 1 } };
                }
                if (s.startsWith('UPDATE oran SET sayi = sayi + 1')) {
                  const satir = sayilar.get(p[0]);
                  if (!satir || satir.pencere !== p[1] || satir.sayi >= p[2]) return { meta: { changes: 0 } };
                  satir.sayi += 1;
                  return { meta: { changes: 1 } };
                }
                throw new Error('beklenmeyen sorgu: ' + s);
              },
            };
          },
        };
      },
    };

    const env = { SITE_ORIGIN: 'https://genesisanime.github.io', DB: db, IP_TUZ: 'tuz' };
    const istek = () =>
      new Request(`https://api.test/akis/coz?kaynak=${encodeURIComponent(EMBED)}&t=${Math.random()}`, {
        headers: { 'CF-Connecting-IP': '203.0.113.7' },
      });

    const ilk = await kapi.fetch(istek(), env, {});
    assert.equal(ilk.status, 200, 'sınırın altında çözümleme yapılmalı');
    const ikinci = await kapi.fetch(istek(), env, {});
    assert.equal(ikinci.status, 200);
    assert.equal(upstream, 4, 'iki çözümleme = dört yukarı akış isteği (embed + meta, 2 kez)');

    /* Sınırı yapay olarak doldur: sonraki istek 429 almalı ve kaynağa HİÇ gitmemeli. */
    const anahtar = [...sayilar.keys()].find((k) => String(k).startsWith('akis:'));
    assert.ok(anahtar, 'sayaç akis: önekli olmalı');
    sayilar.get(anahtar).sayi = 1_000_000;
    const asildi = await kapi.fetch(istek(), env, {});
    assert.equal(asildi.status, 429);
    assert.equal((await asildi.json()).hata, 'cok-fazla-istek');
    assert.equal(upstream, 4, 'sınır aşılınca kaynağa istek gitmemeli');
  } finally {
    globalThis.fetch = eskiFetch;
    if (eskiCaches === undefined) delete globalThis.caches;
    else globalThis.caches = eskiCaches;
  }
});

test('yolCoz: köprü uçları yönlendiricide tanımlı', () => {
  assert.deepEqual(yardimci.yolCoz('/akis/coz', 'GET'), { islem: 'akis-coz' });
  assert.deepEqual(yardimci.yolCoz('/akis/kapsam', 'GET'), { islem: 'akis-kapsam' });
  assert.deepEqual(yardimci.yolCoz('/akis/kapsam/', 'GET'), { islem: 'akis-kapsam' });
  assert.deepEqual(yardimci.yolCoz('/akis/kapsam', 'POST'), { islem: 'yontem-yok' });
  assert.deepEqual(yardimci.yolCoz('/akis/hata', 'POST'), { islem: 'akis-hata-ekle' });
  assert.deepEqual(yardimci.yolCoz('/akis/hata', 'GET'), { islem: 'akis-hata-liste' });
  assert.deepEqual(yardimci.yolCoz('/akis/hata/', 'GET'), { islem: 'akis-hata-liste' });
  assert.deepEqual(yardimci.yolCoz('/akis/hata', 'DELETE'), { islem: 'yontem-yok' });
  assert.deepEqual(yardimci.yolCoz('/akis/aktar', 'GET'), { islem: 'akis-aktar' });
  assert.deepEqual(yardimci.yolCoz('/akis/aktar/', 'HEAD'), { islem: 'akis-aktar' });
  assert.deepEqual(yardimci.yolCoz('/akis/aktar', 'POST'), { islem: 'yontem-yok' });
  assert.deepEqual(yardimci.yolCoz('/akis/yok', 'GET'), { islem: 'yok' });
});

test('uç: /akis/kapsam resolver hostlarını şema sürümüyle döndürür', async () => {
  const varsayilan = await import('../../api/src/index.mjs');
  const yanit = await varsayilan.default.fetch(
    new Request('https://api.test/akis/kapsam', { headers: { Origin: 'https://genesisanime.github.io' } }),
    { SITE_ORIGIN: 'https://genesisanime.github.io' },
    {}
  );
  assert.equal(yanit.status, 200);
  assert.equal(yanit.headers.get('Access-Control-Allow-Origin'), 'https://genesisanime.github.io');
  assert.match(yanit.headers.get('Cache-Control') ?? '', /max-age=600/);
  assert.deepEqual(await yanit.json(), {
    ok: true,
    surum: yardimci.AKIS_KAPSAM_SURUMU,
    hostlar: akis.desteklenenHostlar(),
  });
});

test('akisHataDogrula: host URL’den türetilir, kodlar sınırlıdır', () => {
  assert.deepEqual(yardimci.akisHataDogrula(null), { ok: false, hata: 'govde-yok' });
  assert.equal(yardimci.akisHataDogrula({ url: 'ftp://ornek.com/a' }).ok, false);
  assert.equal(yardimci.akisHataDogrula({ url: 'https://vk.com/a', bolum: 0 }).ok, false);
  assert.equal(yardimci.akisHataDogrula({ url: 'https://vk.com/a', anime: 'boş luk' }).ok, false);

  assert.deepEqual(yardimci.akisHataDogrula({ url: 'https://VK.com/a', anime: 'naruto', bolum: 3, hata: 'akis-durdu' }).veri, {
    url: 'https://VK.com/a',
    host: 'vk.com',
    anime: 'naruto',
    bolum: 3,
    hata: 'akis-durdu',
  });
  /* Bilinmeyen kod telemetriyi reddetmez; cozulemedi’ye düşer. */
  assert.equal(yardimci.akisHataDogrula({ url: 'https://vk.com/a', hata: 'uydurma-kod' }).veri.hata, 'cozulemedi');
  assert.equal(yardimci.akisHataDogrula({ url: 'https://vk.com/a' }).veri.hata, 'cozulemedi');
});

/** `oranAsildi` + `akis_hata` sorgularını karşılayan küçük sahte D1. */
function hataDb() {
  const kayitlar = [];
  const sayilar = new Map();
  const db = {
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...p) {
          return {
            async run() {
              if (s.startsWith('INSERT INTO oran')) {
                const mevcut = sayilar.get(p[0]);
                sayilar.set(p[0], { pencere: p[1], sayi: mevcut && mevcut.pencere === p[1] ? mevcut.sayi : 0 });
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('UPDATE oran SET sayi = sayi + 1')) {
                const satir = sayilar.get(p[0]);
                if (!satir || satir.pencere !== p[1] || satir.sayi >= p[2]) return { meta: { changes: 0 } };
                satir.sayi += 1;
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('INSERT INTO akis_hata')) {
                kayitlar.push({ url: p[0], host: p[1], anime: p[2], bolum: p[3], hata: p[4], ip_hash: p[5], zaman: p[6] });
                return { meta: { changes: 1 } };
              }
              throw new Error('beklenmeyen sorgu: ' + s);
            },
            async first() {
              if (s.startsWith('SELECT id FROM akis_hata')) {
                return kayitlar.find((k) => k.url === p[0] && k.hata === p[1] && k.ip_hash === p[2] && k.zaman > p[3]) ?? null;
              }
              throw new Error('beklenmeyen sorgu: ' + s);
            },
          };
        },
      };
    },
  };
  return { db, kayitlar, sayilar };
}

test('uç: /akis/hata kaydı yazar, aynı kaynağı bir saat içinde tekrar yazmaz', async () => {
  const varsayilan = await import('../../api/src/index.mjs');
  const kapi = varsayilan.default;
  const { db, kayitlar, sayilar } = hataDb();
  const env = { SITE_ORIGIN: 'https://genesisanime.github.io', DB: db, IP_TUZ: 'tuz' };
  const gonder = (govde, ip = '203.0.113.7') =>
    kapi.fetch(
      new Request('https://api.test/akis/hata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify(govde),
      }),
      env,
      {}
    );

  const kotu = await gonder({ url: 'ftp://ornek.com/a' });
  assert.equal(kotu.status, 400);
  assert.equal((await kotu.json()).hata, 'url-gecersiz');
  assert.equal(kayitlar.length, 0, 'geçersiz kayıt yazılmaz');

  const ilk = await gonder({ url: 'https://vk.com/video_ext.php?oid=1', hata: 'cozulemedi', anime: 'naruto', bolum: 1 });
  assert.equal(ilk.status, 201);
  assert.equal(kayitlar.length, 1);
  assert.equal(kayitlar[0].host, 'vk.com');
  assert.equal(kayitlar[0].anime, 'naruto');
  assert.ok(!('ip' in kayitlar[0]), 'ham IP saklanmaz — yalnız ip_hash');

  const tekrar = await gonder({ url: 'https://vk.com/video_ext.php?oid=1', hata: 'cozulemedi', anime: 'naruto', bolum: 1 });
  assert.equal(tekrar.status, 200);
  assert.equal((await tekrar.json()).tekrar, true);
  assert.equal(kayitlar.length, 1, 'aynı kaynak+kod bir saat içinde tekrar yazılmaz');

  const farkli = await gonder({ url: 'https://vk.com/video_ext.php?oid=1', hata: 'akis-durdu', anime: 'naruto', bolum: 1 });
  assert.equal(farkli.status, 201, 'farklı hata kodu ayrı kayıttır');
  assert.equal(kayitlar.length, 2);

  /* Günlük sınır: sayaç doldurulunca 429 döner ve kayıt yazılmaz. */
  const anahtar = [...sayilar.keys()].find((k) => String(k).startsWith('akis-hata:'));
  assert.ok(anahtar, 'sayaç akis-hata: önekli olmalı');
  sayilar.get(anahtar).sayi = 1_000_000;
  const asildi = await gonder({ url: 'https://voe.sx/e/2', hata: 'cozulemedi' });
  assert.equal(asildi.status, 429);
  assert.equal(kayitlar.length, 2, 'sınır aşılınca yazılmaz');
});

test('uç: /akis/hata listesi ADMIN_TOKEN ister, host bazında toplar', async () => {
  const varsayilan = await import('../../api/src/index.mjs');
  const kapi = varsayilan.default;
  const zaman = new Date().toISOString();
  const satirlar = [
    { url: 'https://vk.com/a', host: 'vk.com', anime: 'naruto', bolum: 1, hata: 'cozulemedi', zaman },
    { url: 'https://vk.com/b', host: 'vk.com', anime: 'naruto', bolum: 2, hata: 'akis-durdu', zaman },
    { url: 'https://voe.sx/c', host: 'voe.sx', anime: 'naruto', bolum: 3, hata: 'cozulemedi', zaman },
  ];
  const db = {
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...p) {
          return {
            async all() {
              if (s.includes('GROUP BY host')) {
                const sayim = new Map();
                for (const r of satirlar) sayim.set(r.host, (sayim.get(r.host) ?? 0) + 1);
                return { results: [...sayim.entries()].map(([host, adet]) => ({ host, adet, son: zaman })) };
              }
              if (s.startsWith('SELECT url, host, anime, bolum, hata, zaman')) {
                return { results: satirlar.slice(0, p[1]) };
              }
              throw new Error('beklenmeyen sorgu: ' + s);
            },
          };
        },
      };
    },
  };
  const env = { SITE_ORIGIN: 'https://genesisanime.github.io', DB: db, ADMIN_TOKEN: 'gizli-jeton', IP_TUZ: 'tuz' };

  const yetkisiz = await kapi.fetch(new Request('https://api.test/akis/hata?gun=7'), env, {});
  assert.equal(yetkisiz.status, 401, 'jetonsuz liste okunamaz');

  const yanit = await kapi.fetch(
    new Request('https://api.test/akis/hata?gun=7&limit=10', { headers: { Authorization: 'Bearer gizli-jeton' } }),
    env,
    {}
  );
  assert.equal(yanit.status, 200);
  const veri = await yanit.json();
  assert.equal(veri.ok, true);
  assert.equal(veri.gun, 7);
  assert.deepEqual(
    veri.hostlar.map((h) => h.host).sort(),
    ['vk.com', 'voe.sx']
  );
  assert.equal(veri.hostlar.find((h) => h.host === 'vk.com').adet, 2, 'host bazında toplanır');
  assert.equal(veri.son.length, 3);

  /* Bozuk parametre NaN → Invalid Date hatasına dönüşmemeli. */
  const bozuk = await kapi.fetch(
    new Request('https://api.test/akis/hata?gun=abc&limit=-5', { headers: { Authorization: 'Bearer gizli-jeton' } }),
    env,
    {}
  );
  assert.equal(bozuk.status, 200);
  assert.equal((await bozuk.json()).gun, 7);
});
