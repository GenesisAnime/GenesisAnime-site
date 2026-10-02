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

/* --------------------------- aday seçimi --------------------------- */

test('akisAdayi: yalnız Mail.ru damgalı ve my.mail.ru adresli kaynak köprüye alınır', { skip: akis ? false : ATLA }, () => {
  assert.equal(akis.akisAdayi('MAIL', 'https://my.mail.ru/video/embed/1'), true);
  assert.equal(akis.akisAdayi('MAIL', 'https://videoapi.my.mail.ru/videos/embed/a/b/1.html'), true);
  assert.equal(akis.akisAdayi('MAIL', 'https://cdn62.my.mail.ru/v/1.mp4'), true);
  /* Yanlış damga boşa sunucu isteği yapmasın (uç zaten `desteklenmiyor` derdi). */
  assert.equal(akis.akisAdayi('SIBNET', 'https://my.mail.ru/video/embed/1'), false);
  assert.equal(akis.akisAdayi('MAIL', 'https://ok.ru/videoembed/1'), false);
  assert.equal(akis.akisAdayi('MAIL', 'https://my.mail.ru.kotu.example/x'), false);
  assert.equal(akis.akisAdayi('MAIL', 'bu adres değil'), false);
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

test('oynatılabilir biçim yalnız mp4; her durum notunun metni var', { skip: akis ? false : ATLA }, () => {
  assert.equal(akis.akisOynatilirMi('mp4'), true);
  assert.equal(akis.akisOynatilirMi('hls'), false);
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
  assert.match(kaynak, /akisAdayi\(aktifKaynak\[0\]/, 'kapsam dar tutulmalı: yalnız Mail.ru');
  assert.match(kaynak, /'cok-fazla-istek' \? 'akis-yogun'/, 'sunucu sınırı (429) kullanıcıya ayrı anlatılmalı');
  assert.match(kaynak, /konumKaydet\(anime\.slug, bolum\.n, Math\.floor\(videoKonumRef\.current\)\)/, 'gerçek konum cihazda saklanmalı');
});
