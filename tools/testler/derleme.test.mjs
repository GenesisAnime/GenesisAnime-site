/**
 * derleme.test.mjs — derlemenin kilit/tekrar mantığı
 * ==================================================
 * Kapsam: `tools/lib/derleme.mjs` → "out/ kilitliyse ne yapmalıyız?". Ağsız,
 * gerçek dosyasız (sahte `fs`), gecikmesiz (sahte `bekle`).
 *
 * Neyi korur?
 *   · Kilit hatası tanınır (EBUSY/EPERM/EACCES/ENOTEMPTY + Windows'un İngilizce
 *     metinleri), gerçek derleme hatası (tip hatası, eksik modül) kilit SANILMAZ
 *   · Kilitliyken artan beklemeyle tekrar denenir; kilit sürerse sonsuza kadar değil,
 *     sınırlı sayıda denenir
 *   · Kilit dışı hata tekrar EDİLMEZ: gerçek hata gizlenmez, boşuna beklanmaz
 *   · `out/` sökümü kilit geçene kadar bekler, kilit dışı hatada hemen döner
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DERLEME_BEKLEMELERI_MS,
  DERLEME_TEKRAR_SINIRI,
  SOKUM_BEKLEME_MS,
  SOKUM_DENEME_SINIRI,
  derlemeTekrarKarari,
  kilitHatasiMi,
  kilitOnerisi,
  kilitliDene,
  outSok,
  sokumKarari,
} from '../lib/derleme.mjs';

const KILIT = "EBUSY: resource busy or locked, rmdir 'C:\\proje\\out'";
const TIP_HATASI = "Type error: Property 'ad' does not exist on type 'Anime'.";

/** Gecikmesiz sahte bekle: çağrılan süreleri kaydeder. */
function sahteBekle(kayit = []) {
  return (ms) => {
    kayit.push(ms);
    return Promise.resolve();
  };
}

/* ------------------------------ kilit algılama ------------------------------ */

test('kilitHatasiMi: klasörü tutan süreç hatalarını tanır', () => {
  const kilitler = [
    KILIT,
    'EPERM: operation not permitted, rename ...',
    'EACCES: permission denied, scandir out',
    'ENOTEMPTY: directory not empty, rmdir out',
    'The process cannot access the file because it is being used by another process',
  ];
  for (const metin of kilitler) assert.equal(kilitHatasiMi(metin), true, metin);
});

test('kilitHatasiMi: gerçek derleme hatalarını kilit sanmaz', () => {
  const gercekler = [
    TIP_HATASI,
    'Failed to compile.',
    "Module not found: Can't resolve '@/yok'",
    'ENOSPC: no space left on device, write',
    'Exited with code 1',
    '',
    null,
  ];
  for (const metin of gercekler) assert.equal(kilitHatasiMi(metin), false, String(metin));
});

/* ------------------------------- tekrar kararı ------------------------------ */

test('derlemeTekrarKarari: yalnızca kilit hatasında tekrar ister', () => {
  assert.equal(derlemeTekrarKarari({ deneme: 1, cikti: TIP_HATASI }).tekrar, false);
  assert.equal(derlemeTekrarKarari({ deneme: 1, cikti: TIP_HATASI }).neden, 'kilit-degil');

  const ilk = derlemeTekrarKarari({ deneme: 1, cikti: KILIT });
  assert.equal(ilk.tekrar, true);
  assert.equal(ilk.beklemeMs, DERLEME_BEKLEMELERI_MS[0]);
});

test('derlemeTekrarKarari: beklemeler artar ve sınırda durur', () => {
  for (let i = 1; i < DERLEME_BEKLEMELERI_MS.length; i++) {
    assert.ok(DERLEME_BEKLEMELERI_MS[i] > DERLEME_BEKLEMELERI_MS[i - 1], 'beklemeler artmalı');
  }
  const ikinci = derlemeTekrarKarari({ deneme: 2, cikti: KILIT });
  assert.equal(ikinci.tekrar, true);
  assert.equal(ikinci.beklemeMs, DERLEME_BEKLEMELERI_MS[1]);
  // Üçüncü denemede tekrar yok: kilit sürüyor, artık gerçek bir hata olarak raporlanır.
  const son = derlemeTekrarKarari({ deneme: DERLEME_TEKRAR_SINIRI, cikti: KILIT });
  assert.equal(son.tekrar, false);
  assert.match(son.neden, /kilit sürüyor/);
});

test('sokumKarari: kilit dışı hatada hemen vazgeçer, kilitte bekleyip tekrar dener', () => {
  assert.equal(sokumKarari({ deneme: 1, cikti: 'ENOSPC: no space left on device' }).tekrar, false);
  const k = sokumKarari({ deneme: 1, cikti: KILIT });
  assert.equal(k.tekrar, true);
  assert.equal(k.beklemeMs, SOKUM_BEKLEME_MS);
  assert.equal(sokumKarari({ deneme: SOKUM_DENEME_SINIRI, cikti: KILIT }).tekrar, false);
});

/* ------------------------------ tekrar sürücüsü ----------------------------- */

test('kilitliDene: başarılı işlem tekrar edilmez, hiç beklenmez', async () => {
  const beklemeler = [];
  let cagri = 0;
  const { son, denemeler } = await kilitliDene({
    calistir: () => {
      cagri += 1;
      return { kod: 0, ms: 5, cikti: 'derleme tamam' };
    },
    karar: derlemeTekrarKarari,
    bekle: sahteBekle(beklemeler),
  });
  assert.equal(son.kod, 0);
  assert.equal(cagri, 1);
  assert.equal(denemeler.length, 1);
  assert.deepEqual(beklemeler, []);
});

test('kilitliDene: kilit geçici ise bekleyip tekrar dener ve başarıyı döndürür', async () => {
  const beklemeler = [];
  const bildirimler = [];
  let cagri = 0;
  const { son, denemeler } = await kilitliDene({
    calistir: () => {
      cagri += 1;
      return cagri < 3 ? { kod: 1, ms: 3, cikti: KILIT } : { kod: 0, ms: 9, cikti: 'ok' };
    },
    karar: derlemeTekrarKarari,
    bekle: sahteBekle(beklemeler),
    bildir: (m) => bildirimler.push(m),
  });
  assert.equal(son.kod, 0);
  assert.equal(cagri, 3);
  assert.deepEqual(denemeler.map((d) => d.kod), [1, 1, 0]);
  assert.deepEqual(beklemeler, DERLEME_BEKLEMELERI_MS);
  assert.equal(bildirimler.length, 2);
  assert.match(bildirimler[0], /out\/ kilitli \(deneme 1\/3\)/);
  assert.match(bildirimler[0], /15 sn/);
});

test('kilitliDene: kilit hiç geçmezse sınırlı sayıda dener ve hatalı döner', async () => {
  const beklemeler = [];
  const { son, denemeler } = await kilitliDene({
    calistir: () => ({ kod: 1, ms: 1, cikti: 'EPERM: operation not permitted' }),
    karar: derlemeTekrarKarari,
    bekle: sahteBekle(beklemeler),
  });
  assert.equal(son.kod, 1);
  assert.equal(denemeler.length, DERLEME_TEKRAR_SINIRI);
  assert.equal(beklemeler.length, DERLEME_TEKRAR_SINIRI - 1);
});

test('kilitliDene: kilit dışı hata tekrar edilmez (gerçek hata gizlenmez)', async () => {
  let cagri = 0;
  const bildirimler = [];
  const { son, denemeler } = await kilitliDene({
    calistir: () => {
      cagri += 1;
      return { kod: 1, ms: 4, cikti: TIP_HATASI };
    },
    karar: derlemeTekrarKarari,
    bekle: () => {
      throw new Error('kilit dışı hatada beklenmemeli');
    },
    bildir: (m) => bildirimler.push(m),
  });
  assert.equal(cagri, 1);
  assert.equal(son.kod, 1);
  assert.equal(denemeler.length, 1);
  assert.deepEqual(bildirimler, []);
});

test('kilitliDene: karar sonsuz "tekrar" dese bile sert bir üst sınır var', async () => {
  const { denemeler } = await kilitliDene({
    calistir: () => ({ kod: 1, ms: 0, cikti: KILIT }),
    karar: () => ({ tekrar: true, neden: 'hep', beklemeMs: 0 }),
    bekle: () => Promise.resolve(),
    enCok: 5,
  });
  assert.equal(denemeler.length, 5);
});

/* --------------------------------- out sökümü -------------------------------- */

test('outSok: klasörü özyineli ve zorla siler', async () => {
  const cagrilar = [];
  const sahteFs = {
    rmSync: (yol, secenek) => cagrilar.push({ yol, secenek }),
  };
  const sonuc = await outSok({ yol: 'C:/proje/out', fsModul: sahteFs, bekle: sahteBekle() });
  assert.equal(sonuc.ok, true);
  assert.equal(sonuc.denemeler, 1);
  assert.equal(sonuc.kilit, false);
  assert.equal(cagrilar.length, 1);
  assert.equal(cagrilar[0].yol, 'C:/proje/out');
  assert.equal(cagrilar[0].secenek.recursive, true);
  assert.equal(cagrilar[0].secenek.force, true);
  assert.ok(cagrilar[0].secenek.maxRetries >= 1, 'Node kendi EBUSY denemelerini de yapmalı');
});

test('outSok: kilit geçince başarı döner (derleme hiç düşmez)', async () => {
  const beklemeler = [];
  let cagri = 0;
  const sahteFs = {
    rmSync: () => {
      cagri += 1;
      if (cagri < 3) throw new Error(KILIT);
    },
  };
  const sonuc = await outSok({ yol: 'out', fsModul: sahteFs, bekle: sahteBekle(beklemeler) });
  assert.equal(sonuc.ok, true);
  assert.equal(sonuc.denemeler, 3);
  assert.deepEqual(beklemeler, [SOKUM_BEKLEME_MS, SOKUM_BEKLEME_MS]);
});

test('outSok: kilit hiç geçmezse kilit=true döner ve öneri metni vardır', async () => {
  const sonuc = await outSok({
    yol: 'out',
    fsModul: { rmSync: () => { throw new Error('EPERM: operation not permitted, rmdir out'); } },
    bekle: () => Promise.resolve(),
    bildir: () => {},
  });
  assert.equal(sonuc.ok, false);
  assert.equal(sonuc.kilit, true);
  assert.equal(sonuc.denemeler, SOKUM_DENEME_SINIRI);
  assert.match(sonuc.hata, /EPERM/);
  // Öneri, elle çözüm yolunu da söylemeli.
  assert.match(kilitOnerisi(), /out\//);
  assert.match(kilitOnerisi(), /npm run dongu:gunluk -- --zorla/);
});

test('outSok: kilit dışı hata hemen döner (beklemesiz)', async () => {
  const beklemeler = [];
  const sonuc = await outSok({
    yol: 'out',
    fsModul: { rmSync: () => { throw new Error('ENOSPC: no space left on device, rmdir out'); } },
    bekle: sahteBekle(beklemeler),
  });
  assert.equal(sonuc.ok, false);
  assert.equal(sonuc.kilit, false);
  assert.equal(sonuc.denemeler, 1);
  assert.deepEqual(beklemeler, []);
});
