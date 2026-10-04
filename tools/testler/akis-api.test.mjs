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

test('kapsam: katalogda tanınan tüm hostlar; site playerı yalnız çözülebilenleri dener', () => {
  const hostlar = akis.desteklenenHostlar();
  const bilinen = akis.bilinenHostlar();
  assert.equal(new Set(hostlar).size, hostlar.length, 'host kapsamı tekil olmalı');
  assert.equal(new Set(bilinen).size, bilinen.length, 'bilinen host listesi tekil olmalı');
  /* 04.10 canlı ölçümünde çözülemeyen sağlayıcılar deneme listesine girmez. */
  assert.equal(hostlar.includes('video.sibnet.ru'), false, 'sibnet veri merkezine kapalı: denenmemeli');
  assert.equal(hostlar.includes('www.mp4upload.com'), false, 'mp4upload medyası 403: denenmemeli');
  assert.ok(hostlar.includes('my.mail.ru') && hostlar.includes('vk.com') && hostlar.includes('odnoklassniki.ru'));
  assert.ok(hostlar.includes('drive.google.com') && hostlar.includes('yadi.sk') && hostlar.includes('uqload.com'));
  const disi = akis.cozulemeyenKaynaklar();
  assert.ok(disi.every((k) => typeof k.neden === 'string' && k.neden.length > 10), 'her çözülemeyen sağlayıcının gerekçesi olmalı');
  assert.ok(disi.some((k) => k.ad === 'sibnet' && k.hostlar.includes('video.sibnet.ru')));
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
        assert.ok(bilinen.some((taban) => akis.hostEslesir(host, taban)), `katalog host'u tanınmalı: ${kaynak[0]} / ${host}`);
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

/* --------------------- yeni sağlayıcılar (04.10 canlı ölçümü) --------------------- */

/** Test için Dean Edwards "packer" biçiminde paket üretir (packCoz'un tersi). */
function paketle(govde, sozluk) {
  /* Gerçek pakette 0 indeksi boş kalır; `if (k[c])` o yüzden 0 jetonuna
dokunmaz. Aynı koruma testte de gerekli: gövdedeki sayılar bozulmasın. */
  const kelimeler = ['', ...sozluk];
  let p = govde;
  kelimeler.forEach((kelime, i) => {
    if (kelime) p = p.split(kelime).join(i.toString(36));
  });
  return (
    `eval(function(p,a,c,k,e,d){e=function(c){return(c<a?'':e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};` +
    `if(!''.replace(/^/,String)){while(c--){d[e(c)]=k[c]||e(c)}k=[function(e){return d[e]}];e=function(){return'\\w+'};c=1};` +
    `while(c--){if(k[c]){p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c])}}return p}` +
    `('${p}',36,${kelimeler.length},'${kelimeler.join('|')}'.split('|'),0,{}))`
  );
}

/* Gerçek uqload yanıtından türetilen imzalı HLS adresi (ölçüm: .akis-probe4). */
const UQLOAD_HLS =
  'https://strm7.uqload.vc/hls2/01/05086/3s1h4rgdgsu8_n/master.m3u8?t=-kGPbrTUKDZFBa667KVWdBgzlAadNr8LNdSyE9FjwPg&s=1791109357&e=14400&v=1879347&i=0.0&sp=0';

const UQLOAD_PAGE = `<html><body><script>${paketle(
  'jwplayer("vplayer").setup({sources:[{file:"' + UQLOAD_HLS + '"}],image:"https://strm7.uqload.vc/i/1.jpg"});',
  ['jwplayer', 'vplayer', 'setup', 'sources', 'file', UQLOAD_HLS]
)}</script></body></html>`;

test('packCoz: paketlenmiş oynatıcı betiği çözülür; uzak kod çalıştırılmaz', () => {
  const paket = paketle('file:"https://a.example/x.mp4"', ['file', 'https://a.example/x.mp4']);
  const cozulmus = akis.packCoz(paket);
  assert.ok(cozulmus, 'paket çözülmeli');
  assert.match(cozulmus, /file:"https:\/\/a\.example\/x\.mp4"/);
  assert.equal(akis.packCoz('<html>paket yok</html>'), null);
  assert.equal(akis.packCoz(''), null);
  assert.equal(akis.packCoz(null), null);
});

test("akisAdaylari: paket içindeki imzalı HLS listesi bulunur ve mp4 adayından öne alınır", () => {
  const adaylar = akis.akisAdaylari(UQLOAD_PAGE, 'https://uqload.com/embed-3s1h4rgdgsu8.html');
  assert.equal(adaylar[0]?.url, UQLOAD_HLS);
  assert.equal(adaylar[0]?.tur, 'hls');

  /* Paket çözülünce mp4 + HLS birlikte görünürse HLS öne geçer. */
  const hlsKisa = 'https://strm7.uqload.vc/hls2/aa/x_n/master.m3u8?t=jeton&s=zaman';
  const karisik = `<script>${paketle(
    `file:"${hlsKisa}";src:"https://a3.mp4upload.com:183/d/${'x'.repeat(41)}/video.mp4"`,
    ['file', 'src', hlsKisa]
  )}</script>`;
  const siral = akis.akisAdaylari(karisik, 'https://example.com/e');
  assert.equal(siral[0]?.tur, 'hls');
  assert.equal(siral[1]?.tur, 'mp4');
});

test('aktarimIzni: sibnet yolu, HLS CDN imzası, Dailymotion ve Yandex kuralları', () => {
  assert.equal(akis.aktarimIzni('https://video.sibnet.ru/v/4d5d0be2d775d1d9e5657bf4e6ce8f9e/4582794.mp4').ok, true);
  assert.equal(akis.aktarimIzni('https://video.sibnet.ru/v/kisa/4582794.mp4').hata, 'imzasiz-adres');
  assert.equal(akis.aktarimIzni('https://video.sibnet.ru/shell.php?videoid=1').hata, 'imzasiz-adres');
  assert.equal(akis.aktarimIzni(UQLOAD_HLS).ok, true);
  assert.equal(akis.aktarimIzni('https://strm7.uqload.vc/hls2/01/1/x.m3u8?s=1').hata, 'imzasiz-adres');
  assert.equal(
    akis.aktarimIzni('https://cdndirector.dailymotion.com/cdn/manifest/video/x82sry8.m3u8?sec=SqmE&dmTs=912749').ok,
    true
  );
  assert.equal(akis.aktarimIzni('https://cdndirector.dailymotion.com/cdn/manifest/video/x82sry8.m3u8').hata, 'imzasiz-adres');
  const yandex =
    'https://downloader.disk.yandex.ru/disk/' + 'a'.repeat(64) + '/' + 'b'.repeat(8) + '/tok?uid=0&hash=xyz%3D%3A&filename=x.mp4';
  assert.equal(akis.aktarimIzni(yandex).ok, true);
  assert.equal(
    akis.aktarimIzni('https://downloader.disk.yandex.ru/disk/' + 'a'.repeat(64) + '/' + 'b'.repeat(8) + '/tok?uid=0').hata,
    'imzasiz-adres'
  );
});

test('hlsListeYaz: düz adresler ve URI öznitelikleri aktarım ucuna çevrilir', () => {
  const vekil = (adres) => `/akis/aktar?u=${encodeURIComponent(adres)}`;
  const list = [
    '#EXTM3U',
    '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
    '#EXT-X-STREAM-INF:BANDWIDTH=459539,RESOLUTION=640x360',
    'index-v1-a1.m3u8?t=jeton&s=1791109357',
    '',
    '#EXTINF:9.009,',
    'seg-1.ts?t=jeton',
  ].join('\n');
  const yazilmis = akis.hlsListeYaz(list, 'https://strm7.uqload.vc/hls2/01/05086/x_n/master.m3u8', vekil);
  assert.match(yazilmis, /URI="\/akis\/aktar\?u=https%3A%2F%2Fstrm7\.uqload\.vc%2Fhls2%2F01%2F05086%2Fx_n%2Fkey\.bin"/);
  assert.match(yazilmis, /\/akis\/aktar\?u=https%3A%2F%2Fstrm7\.uqload\.vc%2Fhls2%2F01%2F05086%2Fx_n%2Findex-v1-a1\.m3u8%3Ft%3Djeton%26s%3D1791109357/);
  assert.match(yazilmis, /#EXT-X-KEY:METHOD=AES-128,URI="/, 'etiket korunmalı');
  assert.equal(yazilmis.split('\n')[0], '#EXTM3U');
});

test('hlsMi: içerik türü ya da uzantı listeyi tanıtır', () => {
  assert.equal(akis.hlsMi('application/vnd.apple.mpegurl', 'https://x/y'), true);
  assert.equal(akis.hlsMi('', 'https://x/y/z.m3u8?t=1'), true);
  assert.equal(akis.hlsMi('video/mp4', 'https://x/y/z.mp4'), false);
  assert.equal(akis.hlsMi('', 'bozuk adres'), false);
});

test('akisCoz: VK, OK, Drive, Dailymotion ve Yandex sözleşmeleri', async () => {
  const vkHtml = `<html><script>{"files":{"mp4_144":"https://vk.com/v.mp4?expires=1","mp4_360":"https://vd196.okcdn.ru/v/1080.mp4?expires=1790985600&sig=abc"}}</script></html>`;
  const vk = await akis.akisCoz('https://vk.com/video_ext.php?oid=1&id=2&hash=abc&hd=1', {
    fetchImpl: sahteFetch([{ govde: vkHtml }]),
  });
  assert.deepEqual(vk, {
    ok: true,
    kaynakAdi: 'vk',
    tur: 'mp4',
    url: 'https://vd196.okcdn.ru/v/1080.mp4?expires=1790985600&sig=abc',
    imzaBitis: 1790985600 * 1000,
  });

  const okHtml = '<html><script>{"videos":[{"name":"lowest","url":"https://vd1.okcdn.ru/low.mp4?expires=1"},{"name":"sd","url":"https://vd1.okcdn.ru/sd.mp4?expires=1790985600&sig=z"}]}</script>'.replace(
    /"/g,
    '&quot;'
  );
  const ok = await akis.akisCoz('https://odnoklassniki.ru/videoembed/1888131025466', {
    fetchImpl: sahteFetch([{ govde: okHtml }]),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.kaynakAdi, 'odnoklassniki');
  assert.equal(ok.url, 'https://vd1.okcdn.ru/sd.mp4?expires=1790985600&sig=z');
  assert.equal(ok.imzaBitis, 1790985600 * 1000);

  const driveFetch = sahteFetch([]);
  const drive = await akis.akisCoz('https://drive.google.com/file/d/1QoJPVKARY8-iKwFbH8Y2LxBYsNbgHHqF/preview', { fetchImpl: driveFetch });
  assert.equal(drive.ok, true);
  assert.equal(
    drive.url,
    'https://drive.usercontent.google.com/download?id=1QoJPVKARY8-iKwFbH8Y2LxBYsNbgHHqF&export=download&confirm=t'
  );
  assert.equal(driveFetch.cagrilar.length, 0, 'Drive embed sayfası boşuna çekilmemeli');

  /* Dailymotion çözümleyicisi duruyor (metadata API doğrulanmış), ama sağlayıcı
     04.10 ölçümünde veri merkezi çıkışına 403 verdiği için kapsam dışı: uç onu
     denemez. Saf çözümleyici yine de doğrulanır. */
  const dmJson = JSON.stringify({
    qualities: {
      auto: [
        {
          type: 'application/x-mpegURL',
          url: 'https://cdndirector.dailymotion.com/cdn/manifest/video/x82sry8.m3u8?sec=SqmE&dmTs=912749',
        },
      ],
    },
  });
  const dmAkis = akis.dailymotionAkisi(dmJson);
  assert.equal(dmAkis.tur, 'hls');
  assert.match(dmAkis.url, /cdn\/manifest\/video\/x82sry8\.m3u8\?sec=/);
  const dm = await akis.akisCoz('https://www.dailymotion.com/embed/video/x82sry8', { fetchImpl: sahteFetch([]) });
  assert.equal(dm.hata, 'desteklenmiyor');

  const yandexJson = JSON.stringify({
    href:
      'https://downloader.disk.yandex.ru/disk/' + 'a'.repeat(64) + '/' + 'b'.repeat(8) + '/tok?uid=0&hash=xyz&filename=v.mp4',
  });
  const ya = await akis.akisCoz('https://yadi.sk/i/4_6NurZyVmAMOQ', {
    fetchImpl: sahteFetch([{ govde: yandexJson, basliklar: { 'content-type': 'application/json' } }]),
  });
  assert.equal(ya.ok, true);
  assert.equal(ya.tur, 'mp4');
  assert.match(ya.url, /downloader\.disk\.yandex\.ru\/disk\//);
});

test('aktar: HLS listesi yeniden yazılır, parçalar imza denetiminden geçer', async () => {
  const liste =
    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=459539,RESOLUTION=640x360\nindex-v1-a1.m3u8?t=jeton&s=1791109357\n';
  const fetchImpl = sahteFetch([{ govde: liste, basliklar: { 'content-type': 'application/vnd.apple.mpegurl' } }]);
  const istek = { headers: new Headers(), method: 'GET', url: 'https://api.test/akis/aktar?u=x' };
  const sonuc = await akis.aktar(istek, UQLOAD_HLS, { fetchImpl, cors: {} });
  assert.equal(sonuc.durum, 200);
  assert.equal(sonuc.basliklar['Content-Type'], 'application/vnd.apple.mpegurl');
  assert.match(sonuc.govde, /\/akis\/aktar\?u=https%3A%2F%2Fstrm7\.uqload\.vc%2Fhls2%2F01%2F05086%2F3s1h4rgdgsu8_n%2Findex-v1-a1\.m3u8%3Ft%3Djeton%26s%3D1791109357/);
  assert.equal(fetchImpl.cagrilar[0].secenekler.headers.Range, undefined, 'listeye Range gönderilmez');
});

test('akisCoz: genel resolver statik MP4 bulur; uzak JavaScript çalıştırılmaz', async () => {
  const url = 'https://a3.mp4upload.com:183/d/' + 'x'.repeat(41) + '/video.mp4';
  const fetchImpl = sahteFetch([{ govde: `<script>player.src: "${url}"</script>` }]);
  /* Genel yol: HTML'i akış taşımayan ama çözülebilen bir sağlayıcı (uqload). */
  const sonuc = await akis.akisCoz('https://uqload.com/embed-test.html', { fetchImpl });
  assert.deepEqual(sonuc, { ok: true, kaynakAdi: 'uqload', tur: 'mp4', url, imzaBitis: null });
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

test('akisCoz: çözülemeyen sağlayıcı hiç denenmez (boşa ağ isteği yok)', async () => {
  const fetchImpl = sahteFetch([]);
  const sibnet = await akis.akisCoz('https://video.sibnet.ru/shell.php?videoid=4582794', { fetchImpl });
  assert.equal(sibnet.hata, 'desteklenmiyor');
  assert.equal(sibnet.neden, 'saglayici-cozulemiyor');
  assert.equal(fetchImpl.cagrilar.length, 0, 'engelli sağlayıcı için yukarı akışa çıkılmamalı');
  const mp4u = await akis.akisCoz('https://www.mp4upload.com/embed-x.html', { fetchImpl });
  assert.equal(mp4u.hata, 'desteklenmiyor');
});

test('akisCoz: desteklenen fakat statik akışı olmayan provider anlaşılır hata verir', async () => {
  const desteklenmeyen = await akis.akisCoz('https://uqload.com/embed-bos.html', {
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

test('captchaDuvarı: robot doğrulama ekranı "akış yok"tan ayrılır, oynatıcılı sayfa yanlış etiketlenmez', async () => {
  /* Ölçüm (04.10): uqload embed sayfası iframe'de açıldığında reCAPTCHA ekranı
     gösteriyor ("ROBOT DEĞİLSENİZ DÜĞMEYE TIKLAYIN"). Duvar çözümleyiciye de
     gelirse kullanıcıya doğru mesaj verilmeli. */
  const duvar = `<!DOCTYPE html><html><head><title>TR -11-3y32-01 By Oto Uploader</title>
    <script src="https://www.google.com/recaptcha/api.js"></script></head>
    <body><div class="g-recaptcha" data-sitekey="6LcOrnek"></div>
    <div>ROBOT DEĞİLSENİZ DÜĞMEYE TIKLAYIN</div><button>Robot değilim</button></body></html>`;
  assert.equal(akis.captchaDuvarı(duvar), true);
  assert.equal(akis.captchaDuvarı('<html><body>hcaptcha challenge</body></html>'), true);
  assert.equal(akis.captchaDuvarı('<html><body>I am not a robot</body></html>'), true);
  /* Akış veren sayfa duvar sayılmaz (yanlış pozitif koruması). */
  assert.equal(akis.captchaDuvarı(UQLOAD_PAGE), false);
  assert.equal(akis.captchaDuvarı('<html>player JavaScript/API ile yükleniyor</html>'), false);
  assert.equal(akis.captchaDuvarı(''), false);
  assert.equal(akis.captchaDuvarı(null), false);

  /* Uçtan uca: duvar gelirse hata kodu `captcha` (genel "akış yok" değil). */
  const sonuc = await akis.akisCoz('https://uqload.com/embed-robot.html', { fetchImpl: sahteFetch([{ govde: duvar }]) });
  assert.equal(sonuc.ok, false);
  assert.equal(sonuc.hata, 'captcha');
  assert.equal(sonuc.neden, 'saglayici-robot-dogrulamasi');
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
  const html = sahteFetch([{ durum: 200, govde: '<html>uyarı sayfası</html>', basliklar: { 'content-type': 'text/html' } }]);
  const sonuc = await akis.aktar(sahteIstek(), IMZALI, { fetchImpl: html });
  assert.equal(sonuc.durum, 502);
  assert.equal(sonuc.hata, 'medya-degil');
  assert.equal(sonuc.tip, 'text/html');
  assert.equal(sonuc.ayrinti, 'upstream-200', 'yukarı akış kodu teşhis için görünür olmalı');
});

test('aktar: yukarı akış reddi (403/404) medya sanılmaz, kodu raporlanır', async () => {
  const red = sahteFetch([{ durum: 403, govde: '<html>403</html>', basliklar: { 'content-type': 'text/html' } }]);
  const sonuc = await akis.aktar(sahteIstek(), IMZALI, { fetchImpl: red });
  assert.equal(sonuc.durum, 502, '502 istemcide taze çözümlemeyi tetikler');
  assert.equal(sonuc.hata, 'kaynak-reddetti');
  assert.equal(sonuc.ayrinti, 'upstream-403');
  assert.equal(sonuc.tip, 'text/html');
});

test('aktar: HLS listesi 403 dönerse boş liste geçirilmez', async () => {
  const red = sahteFetch([{ durum: 403, govde: '', basliklar: { 'content-type': 'text/html' } }]);
  const istek = { headers: new Headers(), method: 'GET', url: 'https://api.test/akis/aktar?u=x' };
  const sonuc = await akis.aktar(istek, UQLOAD_HLS, { fetchImpl: red, cors: {} });
  assert.equal(sonuc.durum, 502);
  assert.equal(sonuc.hata, 'kaynak-reddetti');
  assert.equal(sonuc.govde, undefined, 'boş gövde 200 sanılmasın');
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
    kapsamDisi: akis.cozulemeyenKaynaklar(),
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
