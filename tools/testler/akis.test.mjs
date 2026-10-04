/**
 * akis.test.mjs — akış köprüsünün **istemci** sözleşmesi
 * ======================================================
 * Sunucu tarafı `akis-api.test.mjs`'te; burada oynatıcının (tarayıcının) karar
 * kuralları durur:
 *   · Çözümleme isteği: uç sözleşmesi, hata sınıflandırması, zaman aşımı
 *   · Konum koruma: kaynak değişiminde `#t=<saniye>` eki (OpenAnime ölçümü)
 *   · Taze çözümleme kararı: video hatası → 2 baytlık yoklama → 403/502 ise
 *     `?t=` ile bir kez; aksi hâlde iframe yolu
 *   · Oynatıcı bileşeninin bu fonksiyonları gerçekten kullandığı (yapısal test)
 *
 * Ağ yok: `fetchImpl` enjekte edilir. `NEXT_PUBLIC_API` testte kurulur; modül
 * bu değeri çağrı anında okuduğu için içe aktarma öncesi kurmak yeterlidir.
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('../..', import.meta.url));
const OKU = (goreli) => readFileSync(path.join(KOK, goreli), 'utf8');
const IZLE = path.join('src', 'components', 'IzleIstemci.tsx');
const ATLA = 'Node bu sürümde .ts modülünü doğrudan çalıştıramıyor (Node ≥ 22.18 gerekir)';

delete process.env.NEXT_PUBLIC_API;
let akis = null;
let bicim = null;
try {
  akis = await import('../../src/lib/akis.ts');
  bicim = await import('../../src/lib/bicim.ts');
} catch {
  akis = null;
}

const FETCH = (govde, durum = 200) => async () => new Response(govde, { status: durum, headers: { 'content-type': 'application/json' } });

/* ------------------------- derleme anahtarı ------------------------- */

test('köprü adresi tanımsızken istek atılmaz (API’siz derleme sessiz kalır)', { skip: akis ? false : ATLA }, async () => {
  assert.equal(akis.akisVarMi(), false);
  let cagri = 0;
  const sonuc = await akis.akisCoz('https://my.mail.ru/video/embed/1', {
    fetchImpl: async () => {
      cagri += 1;
      return new Response('{}');
    },
  });
  assert.deepEqual(sonuc, { ok: false, hata: 'kopru-yok' });
  assert.equal(cagri, 0, 'tanımsız tabanla ağ isteği yapılmamalı');
});

test('köprü adresi tanımlıysa çözümleme adresi ve taze ek üretilir', { skip: akis ? false : ATLA }, () => {
  process.env.NEXT_PUBLIC_API = 'https://ornek-api.workers.dev/'; // sondaki eğik çizgi temizlenmeli
  assert.equal(akis.akisVarMi(), true);
  assert.equal(
    akis.cozAdresi('https://my.mail.ru/video/embed/4898784563322425187'),
    'https://ornek-api.workers.dev/akis/coz?kaynak=https%3A%2F%2Fmy.mail.ru%2Fvideo%2Fembed%2F4898784563322425187'
  );
  assert.match(akis.cozAdresi('https://my.mail.ru/x', true, 1_790_985_600_000), /&t=1790985600000$/);
});

/* --------------------------- kapsam seçimi --------------------------- */

test('akisKapsami: desteklenen host listesi okunur ve 10 dakika önbelleklenir', { skip: akis ? false : ATLA }, async () => {
  process.env.NEXT_PUBLIC_API = 'https://ornek-api.workers.dev';
  const hostlar = ['my.mail.ru', 'mp4upload.com'];
  let cagri = 0;
  const fetchImpl = async () => {
    cagri += 1;
    return new Response(JSON.stringify({ ok: true, surum: 1, hostlar }), { status: 200 });
  };
  const ilk = await akis.akisKapsami({ fetchImpl, zorla: true, simdi: 1_000_000 });
  assert.deepEqual(ilk, { hostlar, surum: 1, kaynak: 'sunucu' });
  const ikinci = await akis.akisKapsami({ fetchImpl, simdi: 1_000_000 + 60_000 });
  assert.deepEqual(ikinci.hostlar, hostlar);
  assert.equal(cagri, 1);
  await akis.akisKapsami({ fetchImpl, simdi: 1_000_000 + akis.AKIS_KAPSAM_OMRU_MS + 1 });
  assert.equal(cagri, 2, 'önbellek süresi bitince kapsam yenilenmeli');
});

test('akisKapsami: bozuk/eski API ve ağ hatası açıkça varsayılana düşer', { skip: akis ? false : ATLA }, async () => {
  process.env.NEXT_PUBLIC_API = 'https://ornek-api.workers.dev';
  const fetchImpl = async () => new Response(JSON.stringify({ ok: true, hostlar: [123] }), { status: 200 });
  assert.equal((await akis.akisKapsami({ fetchImpl, zorla: true })).hata, 'govde-gecersiz');
  assert.equal((await akis.akisKapsami({ fetchImpl: async () => { throw new Error('offline'); }, zorla: true })).hata, 'ag-hatasi');
  assert.equal(akis.kapsamdaMi(null, 'https://my.mail.ru/video/embed/1'), true, 'eski Workerda Mail.ru geriye uyumlu');
  assert.equal(akis.kapsamdaMi([], 'https://my.mail.ru/video/embed/1'), false, 'boş kapsam sunucunun kararına uyulur');
  assert.equal(akis.kapsamdaMi(['ok.ru'], 'https://ok.ru/videoembed/1'), true);
  assert.equal(akis.kapsamdaMi(['my.mail.ru'], 'https://my.mail.ru.kotu.example/x'), false);
});

test('site playerı kaynak sınıflarını API ve gerçek çözümleme durumuna göre ayırır', { skip: akis ? false : ATLA }, () => {
  const temel = { embed: true, apiVar: true, kapsam: ['my.mail.ru'] };
  assert.equal(akis.akisKaynakSinifla('https://my.mail.ru/video/embed/1', temel), 'denenmedi');
  assert.equal(akis.akisKaynakSinifla('https://my.mail.ru/video/embed/1', { ...temel, sonuc: { durum: 'bekliyor' } }), 'cozuluyor');
  assert.equal(akis.akisKaynakSinifla('https://my.mail.ru/video/embed/1', { ...temel, sonuc: { durum: 'calisiyor' } }), 'calisiyor');
  assert.equal(akis.akisKaynakSinifla('https://my.mail.ru/video/embed/1', { ...temel, sonuc: { durum: 'basarisiz' } }), 'calismiyor');
  assert.equal(akis.akisKaynakSinifla('https://ok.ru/embed', { ...temel, kapsam: ['my.mail.ru'] }), 'kapsam-disi');
  assert.equal(akis.akisKaynakSinifla('https://drive.google.com/file/1', { ...temel, embed: false }), 'gumulmez');
  assert.equal(akis.akisKaynakSinifla('https://my.mail.ru/embed', { ...temel, apiVar: false }), 'api-yok');
  assert.equal(akis.akisKaynakSinifla('https://my.mail.ru/embed', { ...temel, apiVar: false, sonuc: { durum: 'basarisiz' } }), 'calismiyor', 'önceki gerçek deneme API kapalı olsa da başarısız kalmalı');
  assert.equal(akis.akisKaynakSinifla('https://my.mail.ru/embed', { ...temel, apiVar: false, sonuc: { durum: 'calisiyor' } }), 'calisiyor');
  assert.match(akis.akisSorunAciklamasi('durum-503'), /HTTP 503/, 'HTTP durumları sayısal regex ile açıklanmalı');
  assert.match(akis.akisSorunAciklamasi('tur-desteklenmiyor:hls'), /MP4\/WebM/);
});


/* ------------------------ çözümleme akışı ------------------------ */

const EMBED = 'https://my.mail.ru/video/embed/4898784563322425187';
const COZUM = JSON.stringify({
  ok: true,
  kaynakAdi: 'mail',
  tur: 'mp4',
  url: 'https://cdn62.my.mail.ru/v/46642779.mp4?video_key=abc&expire_at=1790985600',
  imzaBitis: 1_790_985_600_000,
  aktarim: 'https://ornek-api.workers.dev/akis/aktar?u=cdn62.my.mail.ru%2Fv%2F46642779.mp4',
});

test('akisCoz: başarılı yanıt aktarım adresine çevrilir', { skip: akis ? false : ATLA }, async () => {
  const cagrilar = [];
  const sonuc = await akis.akisCoz(EMBED, {
    fetchImpl: async (adres, secenekler) => {
      cagrilar.push({ adres, secenekler });
      return new Response(COZUM, { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(sonuc.ok, true);
  assert.equal(sonuc.akis.tur, 'mp4');
  assert.equal(sonuc.akis.kaynakAdi, 'mail');
  assert.equal(sonuc.akis.imzaBitis, 1_790_985_600_000);
  assert.match(sonuc.akis.aktarim, /\/akis\/aktar\?u=/);
  assert.match(cagrilar[0].adres, /^https:\/\/ornek-api\.workers\.dev\/akis\/coz\?kaynak=/);
  assert.ok(cagrilar[0].secenekler.signal instanceof AbortSignal, 'zaman aşımı için iptal sinyali verilmeli');
});

test('akisCoz: her başarısızlık sınıflandırılır, fırlatmaz', { skip: akis ? false : ATLA }, async () => {
  const desteklenmiyor = await akis.akisCoz('https://ok.ru/videoembed/1', {
    fetchImpl: FETCH(JSON.stringify({ ok: false, hata: 'desteklenmiyor' }), 400),
  });
  assert.deepEqual(desteklenmiyor, { ok: false, hata: 'desteklenmiyor' });

  const bozuk = await akis.akisCoz(EMBED, { fetchImpl: FETCH('<html>hata</html>', 502) });
  assert.equal(bozuk.ok, false);
  assert.equal(bozuk.hata, 'yanit-bozuk');

  const ag = await akis.akisCoz(EMBED, {
    fetchImpl: async () => {
      throw new Error('ag koptu');
    },
  });
  assert.equal(ag.hata, 'ag-hatasi');

  /* Aktarım adresi olmayan "başarılı" yanıt oynatıcıya verilmez. */
  const eksik = await akis.akisCoz(EMBED, {
    fetchImpl: FETCH(JSON.stringify({ ok: true, tur: 'mp4' })),
  });
  assert.equal(eksik.hata, 'aktarim-yok');

  const durumlu = await akis.akisCoz(EMBED, { fetchImpl: FETCH('{}', 503) });
  assert.equal(durumlu.hata, 'durum-503');
});

test('akisCoz: zaman aşımı isteği iptal eder, sonuç sınıflandırılır', { skip: akis ? false : ATLA }, async () => {
  let iptal = false;
  const sonuc = await akis.akisCoz(EMBED, {
    zamanAsimiMs: 10,
    fetchImpl: (adres, secenekler) =>
      new Promise((_, reddet) => {
        secenekler.signal.addEventListener('abort', () => {
          iptal = true;
          const hata = new Error('aborted');
          hata.name = 'AbortError';
          reddet(hata);
        });
      }),
  });
  assert.equal(iptal, true, 'süre dolunca istek iptal edilmeli');
  assert.deepEqual(sonuc, { ok: false, hata: 'zaman-asimi' });
});

/* --------------------------- konum koruma --------------------------- */

test('konumEki: tam saniye, 1 sn altı ve geçersiz değerlerde ek yok', { skip: akis ? false : ATLA }, () => {
  assert.equal(akis.konumEki(5.9), '#t=5');
  assert.equal(akis.konumEki(1451), '#t=1451');
  assert.equal(akis.konumEki(0.4), '');
  assert.equal(akis.konumEki(0), '');
  assert.equal(akis.konumEki(-3), '');
  assert.equal(akis.konumEki(Number.NaN), '');
});

test('aktarimAdresi: kaynak değişiminde konum eklenir, eski ek atılır', { skip: akis ? false : ATLA }, () => {
  const cozum = { kaynakAdi: 'mail', tur: 'mp4', imzaBitis: null, aktarim: 'https://api.test/akis/aktar?u=x' };
  assert.equal(akis.aktarimAdresi(cozum), 'https://api.test/akis/aktar?u=x');
  assert.equal(akis.aktarimAdresi(cozum, 603.8), 'https://api.test/akis/aktar?u=x#t=603');
  const eskili = { ...cozum, aktarim: 'https://api.test/akis/aktar?u=x#t=99' };
  assert.equal(akis.aktarimAdresi(eskili, 12), 'https://api.test/akis/aktar?u=x#t=12');
});

/* ------------------- video hatası → taze çözümleme ------------------- */

test('aktarimDurumu: 2 baytlık yoklama Range gönderir ve önbelleği atlar', { skip: akis ? false : ATLA }, async () => {
  const cagrilar = [];
  const durum = await akis.aktarimDurumu('https://api.test/akis/aktar?u=x', async (adres, secenekler) => {
    cagrilar.push({ adres, secenekler });
    return new Response('', { status: 502 });
  });
  assert.equal(durum, 502);
  assert.equal(cagrilar[0].secenekler.headers.Range, 'bytes=0-1');
  assert.equal(cagrilar[0].secenekler.cache, 'no-store', 'baytlar tarayıcı önbelleğinden gelmemeli');

  const ag = await akis.aktarimDurumu('https://api.test/akis/aktar?u=x', async () => {
    throw new Error('yok');
  });
  assert.equal(ag, 0, 'ağ hatasında durum bilinmiyor');
});

test('taze çözümleme yalnız 403/502’de denenir; medya hatası ayrıca sınıflanır', { skip: akis ? false : ATLA }, () => {
  assert.equal(akis.akisYenilenmeliMi(403), true, 'imza düştü');
  assert.equal(akis.akisYenilenmeliMi(502), true, 'aktarım ucu medya olmayan yanıt gördü');
  assert.equal(akis.akisYenilenmeliMi(206), false, 'sağlıklı akış tazelenmez');
  assert.equal(akis.akisYenilenmeliMi(0), false);
  assert.equal(akis.akisYenilenmeliMi(400), false);

  assert.equal(akis.medyaHatasiTazeGerektirir(2), true, 'MEDIA_ERR_NETWORK');
  assert.equal(akis.medyaHatasiTazeGerektirir(4), true, 'MEDIA_ERR_SRC_NOT_SUPPORTED');
  assert.equal(akis.medyaHatasiTazeGerektirir(1), false, 'kullanıcı iptal etti');
  assert.equal(akis.medyaHatasiTazeGerektirir(3), false, 'decode hatası yeni adresle düzelmez');
  assert.equal(akis.medyaHatasiTazeGerektirir(undefined), false);
});

test('oynatılabilir biçimler MP4/WebM/HLS (DASH hariç); her durum notunun metni var', { skip: akis ? false : ATLA }, () => {
  assert.equal(akis.akisOynatilirMi('mp4'), true);
  assert.equal(akis.akisOynatilirMi('webm'), true);
  /* HLS: Safari yerel oynatır, diğer tarayıcılarda hls.js köprüsü takılır. */
  assert.equal(akis.akisOynatilirMi('hls'), true);
  assert.equal(akis.akisOynatilirMi('dash'), false);
  for (const not of [
    'cozulemedi',
    'akis-yogun',
    'tur-desteklenmiyor',
    'akis-durdu',
    'akis-erisilemedi',
    'medya-desteklemiyor',
    'akis-tazelendi',
  ]) {
    assert.ok(akis.akisNotuMetni(not).length > 20, `${not}: kullanıcıya açıklayıcı metin verilmeli`);
  }
});

/* ----------------------- bileşen sözleşmesi ----------------------- */

test('oynatıcı: kendi <video> ve iframe yedeği yan yana durur', { skip: bicim ? false : ATLA }, () => {
  const kaynak = OKU(IZLE);
  assert.match(kaynak, /<video/, 'kendi oynatıcı elemanı olmalı');
  assert.match(kaynak, /oynatmaAdresi/, 'video adresi konum ekli üretilmeli (#t=)');
  assert.match(kaynak, /controls\s*\n?\s*autoPlay/, 'video tarayıcı kontrolleriyle ve otomatik başlar');
  assert.match(kaynak, /taze: true/, '403/502 yolunda bir kez taze çözümleme denenmeli');
  assert.match(kaynak, /aktarimDurumu\(/, 'video hatasında gerçek neden yoklanmalı');
  assert.match(kaynak, /<iframe/, 'çözülemeyen kaynak bugünkü iframe yolunda kalmak zorunda');
  assert.match(kaynak, /kapsamdaMi\(akisKapsam,/, 'resolver kapsamı sunucudan okunmalı');
  assert.match(kaynak, /playerModu === 'site'/, 'site player modu ayrı seçilebilmeli');
  assert.match(kaynak, /onCanPlay=\{\(\) => \{[\s\S]*durum: 'calisiyor'/, 'kaynak yalnız video oynatılabilir olunca çalışan sayılmalı');
  assert.match(kaynak, /kendiPlayeriApiBekleyenler/, 'API yokken durum başarısız değil beklemede olmalı');
  assert.match(kaynak, /if \(!akisVarMi\(\)\)[\s\S]*setAkisSorun\('kopru-yok'\)/, 'zorla deneme API yokluğunu başarı/deneme gibi göstermemeli');
  assert.match(kaynak, /akisKaynakSinifla\(/, 'çalışan/başarısız/bilinmeyen kaynaklar ayrılmalı');
  assert.match(kaynak, /Sitenin playerında çalışmayan/, 'başarısız kaynaklar ayrı panelde listelenmeli');
  assert.match(kaynak, /Kaynağın playerına geç/, 'site akışı başarısızsa iframe moduna dönülebilmeli');
  assert.match(kaynak, /akisKapsami\(\)/, 'kapsam servisten alınmalı');
  assert.doesNotMatch(kaynak, /akisAdayi\(/, 'clientte yalnız Mail.ru kısıtı kalmamalı');
  assert.match(kaynak, /'cok-fazla-istek' \? 'akis-yogun'/, 'sunucu sınırı (429) kullanıcıya ayrı anlatılmalı');
  assert.match(kaynak, /konumKaydet\(anime\.slug, bolum\.n, Math\.floor\(videoKonumRef\.current\)\)/, 'gerçek konum cihazda saklanmalı');
});
