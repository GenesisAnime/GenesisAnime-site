/**
 * akis-kayit.test.mjs — site playerının kaynak kaydı
 * ==================================================
 * İki sözleşme sınanır:
 *   · Cihaz hafızası: host başarı/başarısızlık sayacı, kanıtlı host seçimi,
 *     30 günü geçen kaydın düşmesi
 *   · Hata kuyruğu: tekilleştirme (aynı kaynak + kod bir saat), ağ hatasında
 *     kaydı koruma, 400'de düşürme, API kapalıyken tamamen no-op
 *
 * localStorage gerçek değil: küçük bir bellek deposu kurulur; ağ da sahte
 * `fetch` ile kesilir — bu test hiçbir gerçek istek atmaz.
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('../..', import.meta.url));
const IZLE = path.join('src', 'components', 'IzleIstemci.tsx');

/** Bellek deposu + pencere taklidi; depoyu döndürür (içeriği denetlemek için). */
function depoKur() {
  const depo = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (depo.has(k) ? depo.get(k) : null),
      setItem: (k, v) => depo.set(k, String(v)),
      removeItem: (k) => depo.delete(k),
    },
    addEventListener: () => {},
  };
  return depo;
}

/** Zamanlayıcı/kuyruk mikro görevlerinin bitmesini bekle. */
const bosalt = () => new Promise((cozum) => setTimeout(cozum, 0));

test('hafıza: başarı/başarısızlık sayılır, kanıtlı host seçilir', async () => {
  delete process.env.NEXT_PUBLIC_API;
  depoKur();
  const kayit = await import('../../src/lib/akis-kayit.ts');

  kayit.hostBasarisiKaydet('https://vk.com/video_ext.php?oid=1', true);
  kayit.hostBasarisiKaydet('https://vk.com/video_ext.php?oid=2', true);
  kayit.hostBasarisiKaydet('https://vk.com/video_ext.php?oid=3', false);
  kayit.hostBasarisiKaydet('https://voe.sx/e/9', false);
  kayit.hostBasarisiKaydet('bozuk-adres', true); // host çıkmaz → yazılmaz

  const hafiza = kayit.hostBasarilari();
  assert.deepEqual(Object.keys(hafiza).sort(), ['vk.com', 'voe.sx']);
  assert.equal(hafiza['vk.com'].ok, 2);
  assert.equal(hafiza['vk.com'].hata, 1);
  assert.equal(hafiza['voe.sx'].ok, 0);

  assert.equal(kayit.hostKanitli(hafiza['vk.com']), true);
  assert.equal(kayit.hostKanitli(hafiza['voe.sx']), false, 'hiç başarısı olmayan host kanıtlı değil');
  assert.equal(kayit.hostKanitli(undefined), false);

  const adresler = ['https://voe.sx/e/9', 'https://vk.com/video_ext.php?oid=5', 'https://mp4upload.com/x'];
  assert.equal(kayit.kanitliSira(adresler), 1, 'kanıtlı host öne alınır');
  assert.equal(kayit.kanitliSira(['https://mp4upload.com/x']), null, 'kanıt yoksa varsayılan seçim değişmez');

  /* 30 günü geçen kayıt düşer ve kararda sayılmaz. */
  const anahtar = 'genesisanime:v1:akis-hostlar';
  const ham = JSON.parse(globalThis.window.localStorage.getItem(anahtar));
  ham['eski.tv'] = { ok: 5, hata: 0, son: Date.now() - 40 * 24 * 60 * 60 * 1000 };
  globalThis.window.localStorage.setItem(anahtar, JSON.stringify(ham));
  assert.equal('eski.tv' in kayit.hostBasarilari(), false);
  assert.equal(kayit.kanitliSira(['https://eski.tv/a', 'https://vk.com/b']), 1);
});

test('kuyruk: API kapalıyken no-op, açıkken gönderir ve tekilleştirir', async () => {
  delete process.env.NEXT_PUBLIC_API;
  const depo = depoKur();
  const kayit = await import('../../src/lib/akis-kayit.ts');

  const istekler = [];
  globalThis.fetch = async (adres, secenekler) => {
    istekler.push({ adres: String(adres), govde: JSON.parse(secenekler.body) });
    return new Response('{"ok":true}', { status: 201 });
  };

  kayit.akisHatasiBildir({ url: 'https://vk.com/a', hata: 'cozulemedi', anime: 'naruto', bolum: 1 });
  await bosalt();
  assert.equal(istekler.length, 0, 'API yokken hiç istek atılmaz');
  assert.equal([...depo.keys()].filter((k) => k.includes('kuyruk')).length, 0, 'kuyruk da yazılmaz');

  process.env.NEXT_PUBLIC_API = 'https://api.test/';
  kayit.akisHatasiBildir({ url: 'https://vk.com/a', hata: 'cozulemedi', anime: 'naruto', bolum: 1 });
  await bosalt();
  assert.equal(istekler.length, 1);
  assert.equal(istekler[0].adres, 'https://api.test/akis/hata', 'sondaki eğik çizgi temizlenir');
  assert.deepEqual(istekler[0].govde, { url: 'https://vk.com/a', hata: 'cozulemedi', anime: 'naruto', bolum: 1 });

  kayit.akisHatasiBildir({ url: 'https://vk.com/a', hata: 'cozulemedi', anime: 'naruto', bolum: 1 });
  await bosalt();
  assert.equal(istekler.length, 1, 'aynı kaynak + kod bir saat içinde tekrar gönderilmez');

  kayit.akisHatasiBildir({ url: 'https://vk.com/a', hata: 'akis-durdu', anime: 'naruto', bolum: 1 });
  await bosalt();
  assert.equal(istekler.length, 2, 'farklı hata kodu ayrı kayıttır');
});

test('kuyruk: ağ hatasında kayıt korunur, 400 kalıcıdır', async () => {
  process.env.NEXT_PUBLIC_API = 'https://api.test';
  const depo = depoKur();
  const kayit = await import('../../src/lib/akis-kayit.ts');
  const KUYRUK = 'genesisanime:v1:akis-hata-kuyruk';

  globalThis.fetch = async () => {
    throw new Error('ağ yok');
  };
  kayit.akisHatasiBildir({ url: 'https://voe.sx/e/1', hata: 'cozulemedi' });
  await bosalt();
  const kuyruk = JSON.parse(depo.get(KUYRUK));
  assert.equal(kuyruk.length, 1, 'ağ hatasında kayıt kuyrukta kalır');
  assert.equal(kuyruk[0].url, 'https://voe.sx/e/1');

  globalThis.fetch = async () => new Response('{"ok":true}', { status: 201 });
  await kayit.hataKuyruguGonder();
  assert.equal(JSON.parse(depo.get(KUYRUK)).length, 0, 'ağ düzelince kuyruk boşalır');

  globalThis.fetch = async () => new Response('{"ok":false,"hata":"url-gecersiz"}', { status: 400 });
  kayit.akisHatasiBildir({ url: 'https://voe.sx/e/2', hata: 'cozulemedi' });
  await bosalt();
  await kayit.hataKuyruguGonder();
  assert.equal(JSON.parse(depo.get(KUYRUK)).length, 0, '400 kalıcı: kuyrukta tutulmaz');
});

test('yapısal: oynatıcı cihaz hafızasını ve telemetriyi gerçekten kullanıyor', () => {
  const izle = readFileSync(path.join(KOK, IZLE), 'utf8');
  assert.match(izle, /hostBasarisiKaydet\(sarmalayiciCoz\(kaynak\[2\]\), true\)/, 'başarı cihaz hafızasına yazılır');
  assert.match(izle, /hostBasarisiKaydet\(adres, false\)/, 'başarısızlık cihaz hafızasına yazılır');
  assert.match(izle, /akisHatasiBildir\(\{ url: adres/, 'başarısızlık Worker’a bildirilir');
  assert.match(izle, /hostKanitli\(cihaz\[kaynakHostu/, 'zincir cihaz kanıtını kullanır');
  assert.match(izle, /kanitliSira\(gosterilenKaynaklar\.map/, 'yeni bölümde kanıtlı host öne alınır');
  assert.match(izle, /tercihiKapat\(\)/, 'elle seçim otomatik tercihi kapatır');
});
