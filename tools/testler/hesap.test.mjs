/**
 * hesap.test.mjs — yerel/sunucu kullanıcı durumu birleştirmesinin testleri
 * ========================================================================
 * `src/lib/depo/durum-birlestir.mjs` hesap senkronunun kalbidir: yanlış bir
 * birleştirme izleme listesini veya ilerlemeyi sessizce siler. Bu yüzden mantık
 * düz JS olarak yazıldı ve burada ağsız Node testleriyle doğrulanıyor.
 *
 * Kural: yerel kayıt her zaman kaynak; çakışmada "en yeni kazanır"; tercihler
 * cihaz davranışı olduğu için yerel kazanır; çalışmayan kaynaklar birleşimdir.
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bosDurum, durumBirlestir, durumNormalize } from '../../src/lib/depo/durum-birlestir.mjs';

const ilerleme = (slug, zaman, bolum = 1) => ({
  slug,
  ad: slug,
  poster: null,
  bolum,
  bolumAdi: `${bolum}. Bölüm`,
  zaman,
  saniye: 60,
});

/* ================================================================ */
/* 1 · Normalizasyon                                                 */
/* ================================================================ */

test('durumNormalize: bozuk girdiyi güvenli biçime indirger', () => {
  assert.deepEqual(durumNormalize(null), bosDurum());
  assert.deepEqual(durumNormalize('metin'), bosDurum());
  assert.deepEqual(durumNormalize([1, 2]), bosDurum());
  const d = durumNormalize({
    ilerleme: { naruto: ilerleme('naruto', 5) },
    izlenen: { 'naruto|1': 5 },
    listem: [{ slug: 'naruto', ad: 'Naruto' }, { bozuk: true }, null],
    tercih: { gorunum: 'liste' },
    calismayan: ['https://x.example/y', 42],
  });
  assert.equal(Object.keys(d.ilerleme).length, 1);
  assert.equal(d.listem.length, 1);
  assert.equal(d.listem[0].ad, 'Naruto');
  assert.deepEqual(d.calismayan, ['https://x.example/y']);
});

/* ================================================================ */
/* 2 · İlerleme / izlenen: en yeni kazanır                           */
/* ================================================================ */

test('durumBirlestir: ilerlemede daha yeni kayıt kazanır, eski kayıt korunur', () => {
  const yerel = { ilerleme: { naruto: ilerleme('naruto', 100), bleach: ilerleme('bleach', 500) } };
  const uzak = { ilerleme: { naruto: ilerleme('naruto', 900, 12), one: ilerleme('one', 300) } };
  const { veri, degisti } = durumBirlestir(yerel, uzak);
  assert.equal(veri.ilerleme.naruto.zaman, 900, 'sunucudaki daha yeni kayıt kazanmalı');
  assert.equal(veri.ilerleme.naruto.bolum, 12);
  assert.equal(veri.ilerleme.bleach.zaman, 500, 'yalnızca yerelde olan kayıt korunmalı');
  assert.equal(veri.ilerleme.one.zaman, 300, 'yalnızca sunucuda olan kayıt korunmalı');
  assert.equal(degisti, true);
});

test('durumBirlestir: eşit zamanda yerel kazanır; gereksiz yazma tetiklenmez', () => {
  const yerel = { ilerleme: { naruto: ilerleme('naruto', 100, 7) } };
  const esitAmaFarkli = { ilerleme: { naruto: ilerleme('naruto', 100, 3) } };
  const { veri, degisti } = durumBirlestir(yerel, esitAmaFarkli);
  assert.equal(veri.ilerleme.naruto.bolum, 7, 'eşit zaman damgasında yerel kazanır');
  assert.equal(degisti, false, 'yerel zaten kazandıysa yazma gerekmez');

  // Sunucu daha yeniyse yerel güncellenir ve yazma tetiklenir.
  const yenisi = { ilerleme: { naruto: ilerleme('naruto', 200, 9) } };
  const b = durumBirlestir(yerel, yenisi);
  assert.equal(b.veri.ilerleme.naruto.bolum, 9);
  assert.equal(b.degisti, true);

  const c = durumBirlestir(yerel, yerel);
  assert.equal(c.degisti, false, 'iki taraf aynıysa yazma tetiklenmemeli');
});

test('durumBirlestir: izlenen haritasında anahtar bazında en yeni zaman kazanır', () => {
  const { veri } = durumBirlestir(
    { izlenen: { 'naruto|1': 100, 'naruto|2': 700 } },
    { izlenen: { 'naruto|1': 300, 'bleach|1': 50 } }
  );
  assert.deepEqual(veri.izlenen, { 'naruto|1': 300, 'naruto|2': 700, 'bleach|1': 50 });
});

/* ================================================================ */
/* 3 · Liste / tercihler / çalışmayanlar                             */
/* ================================================================ */

test('durumBirlestir: liste slug bazında birleşir, yeniden eskiye sıralanır', () => {
  const { veri } = durumBirlestir(
    { listem: [{ slug: 'naruto', ad: 'Naruto', poster: null, yil: 2002, zaman: 500 }] },
    {
      listem: [
        { slug: 'naruto', ad: 'Naruto', poster: null, yil: 2002, zaman: 100 },
        { slug: 'bleach', ad: 'Bleach', poster: null, yil: 2004, zaman: 900 },
      ],
    }
  );
  assert.deepEqual(veri.listem.map((k) => k.slug), ['bleach', 'naruto']);
  assert.equal(veri.listem.find((k) => k.slug === 'naruto').zaman, 500, 'daha yeni liste kaydı kazanmalı');
});

test('durumBirlestir: tercihlerde yerel kazanır, çalışmayanlar birleşir ve 500 ile sınırlanır', () => {
  const yerelCalismayan = Array.from({ length: 480 }, (_, i) => `https://yerel.example/${i}`);
  const uzakCalismayan = Array.from({ length: 60 }, (_, i) => `https://uzak.example/${i}`);
  const { veri } = durumBirlestir(
    { tercih: { gorunum: 'liste' }, calismayan: yerelCalismayan },
    { tercih: { gorunum: 'izgara', otomatikSonraki: false }, calismayan: [...yerelCalismayan.slice(0, 10), ...uzakCalismayan] }
  );
  assert.equal(veri.tercih.gorunum, 'liste', 'yerel tercih kazanmalı');
  assert.equal(veri.tercih.otomatikSonraki, false, 'yerelde olmayan tercih alanı sunucudan gelmeli');
  assert.equal(veri.calismayan.length, 500, 'birleşim 500 sınırını aşmamalı');
  assert.equal(veri.calismayan[0], 'https://yerel.example/0', 'yerel kayıtlar önde olmalı');
  assert.equal(veri.calismayan[500 - 1].startsWith('https://uzak.example/'), true, 'sunucu kayıtları sonda yer almalı');
});

test('durumBirlestir: boş sunucu kopyası yerel veriyi silmez', () => {
  const yerel = {
    ilerleme: { naruto: ilerleme('naruto', 100) },
    izlenen: { 'naruto|1': 100 },
    listem: [{ slug: 'naruto', ad: 'Naruto', poster: null, yil: 2002, zaman: 100 }],
    tercih: { gorunum: 'liste' },
    calismayan: ['https://x.example/y'],
  };
  const { veri, degisti } = durumBirlestir(yerel, {});
  assert.equal(Object.keys(veri.ilerleme).length, 1);
  assert.equal(veri.listem.length, 1);
  assert.equal(veri.calismayan.length, 1);
  assert.equal(degisti, false, 'boş sunucu kopyası yerelde değişiklik sayılmaz');
});
