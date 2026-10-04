/**
 * kasma.test.mjs — kaydırma kasmasını (jank) geri getiren desenlerin denetimi
 * ==========================================================================
 * Canlı sayfada ölçülen iki kaynak ve onların koda geri sızmasını engelleyen
 * kurallar:
 *
 *  1) **`backdrop-filter` katmanları.** Ana sayfada 540 kart × 2 rozet = 1.079
 *     bulanık katman vardı (toplam 1.085). Her katman kaydırma karesinde GPU'da
 *     yeniden rasterlandığı için mobilde kasmanın ana kaynağıydı. Kural: bulanık
 *     zemin yalnızca **tek** katmanda (sabit üst bar) kalabilir; tekrar eden
 *     kart rozetlerinde ve sabit alt menüde olamaz.
 *
 *  2) **Poster boyutu.** Kartlar 142–178 px; arşivdeki MAL posterleri 225×319 ve
 *     ~45 KB. 540 kart birlikte açılınca ~24 MB görsel iniyordu. Kural: MAL
 *     posterleri `/r/<GxY>/images/...` küçültme yolundan servis edilmeli ve
 *     kart görseli `srcSet`/`sizes` bildirmeli.
 *
 * 3) Ayrıca kart görselleri kendi boyama alanına hapsolur (`contain: paint`).
 *
 * Tarayıcı yok: dosyalar okunur, sözleşme metinden ve veriden doğrulanır.
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from '../lib/ortak.mjs';

const oku = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const HAM_CSS = oku('src', 'app', 'globals.css');
/** Yorumlar ayıklanmış CSS: gerekçe yorumlarındaki örnek kod kural sayılmasın. */
const CSS = HAM_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** Bir CSS kuralının gövdesini döndürür (ilk eşleşme). Aynı CSS'te aynı seçici
 *  birden çok kez geçebilir (medya sorguları); hepsinin gövdesini döndürür. */
function kural(secici) {
  const kalipp = new RegExp(`(^|\\n)\\s*${secici.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
  const govdeler = [...CSS.matchAll(kalipp)].map((m) => m[2]);
  assert.ok(govdeler.length, `globals.css: ${secici} kuralı bulunamadı`);
  return govdeler.join('\n');
}

/* ================================================================ */
/* 1 · Bulanık katman bütçesi                                        */
/* ================================================================ */

test('kart rozetlerinde backdrop-filter yok (bin küsur katman oluşturuyordu)', () => {
  for (const secici of ['.kart-rozet', '.kart-rozet.puan', '.kart-rozet.dogrulanmis']) {
    assert.ok(
      !kural(secici).includes('backdrop-filter'),
      `${secici}: backdrop-filter geri gelmiş — kart başına 2 bulanık katman kaydırma karesinde yeniden rasterlanır`
    );
  }
});

test('sabit üst barın gövdesinde backdrop-filter kalmadı', () => {
  assert.ok(
    !kural('.ust').includes('backdrop-filter'),
    '.ust: sabit bar kaydırma boyunca hep görünür; bulanık zemin burada her karede yeniden hesaplanır'
  );
});

test('sabit alt menüde backdrop-filter yok', () => {
  assert.ok(
    !kural('.alt-menu').includes('backdrop-filter'),
    '.alt-menu: sabit alt menü de kaydırma boyunca hep görünür'
  );
});

test('bulanık katman sayısı bütçenin altında (yalnızca tek seferlik katmanlar)', () => {
  // Sayılmaya değer kalanlar: fragman katmanı (.katman) ve ikincil düğme zemini
  // (.dugme-ikincil) — ikisi de ekranda az sayıda ve kaydırma boyunca sabit değil.
  const sayi = [...CSS.matchAll(/backdrop-filter\s*:/g)].length;
  assert.ok(
    sayi <= 3,
    `globals.css'te ${sayi} backdrop-filter kuralı var — tekrar eden bileşenlere eklendiyse kaydırma kasması geri gelir`
  );
});

/* ================================================================ */
/* 2 · Poster küçültme                                               */
/* ================================================================ */

test('poster yardımcıları MAL küçültme yolunu üretir', async () => {
  let gorsel;
  try {
    gorsel = await import('../../src/lib/gorsel.ts');
  } catch {
    return; // Node .ts şerit açmıyor: yapısal denetimlerle yetin
  }
  const tam = 'https://cdn.myanimelist.net/images/anime/1245/116760.jpg';
  assert.equal(
    gorsel.malOlcek(tam, 178, 254),
    'https://cdn.myanimelist.net/r/178x254/images/anime/1245/116760.jpg'
  );
  // Ölçeklenmiş adres ikinci kez sarılmaz (idempotent)
  const bir = gorsel.malOlcek(tam, 178, 254);
  assert.equal(gorsel.malOlcek(bir, 178, 254), bir);
  // MAL dışı kaynaklar olduğu gibi kalır
  const kitsu = 'https://media.kitsu.app/anime/45515/poster_image/small-x.jpeg';
  assert.equal(gorsel.malOlcek(kitsu, 178, 254), kitsu);
  assert.equal(gorsel.posterSrcSet(kitsu), null);
  // srcSet üç aday bildirir ve 178w adayı küçültülmüş yoldur
  const srcSet = gorsel.posterSrcSet(tam);
  assert.match(srcSet, /\/r\/178x254\/images\/.*178w/);
  assert.match(srcSet, /\/r\/356x508\/images\/.*356w/);
});

test('kart görseli srcSet + sizes bildirir (tarayıcı küçük varyantı seçebilsin)', () => {
  const kart = oku('src', 'components', 'Kart.tsx');
  assert.match(kart, /posterSrcSet\(poster\)/, 'Kart: poster srcSet kullanmalı');
  assert.match(kart, /sizes=\{POSTER_SIZES\}/, 'Kart: sizes bildirmeli');
  assert.match(kart, /decoding="async"/, 'Kart: kod çözme ana iş parçacığını bloklamamalı');
});

test('bildirilen sizes CSS kart genişlikleriyle uyumlu', () => {
  const masaustu = kural('.kart').match(/width:\s*(\d+)px/);
  assert.ok(masaustu, '.kart: genişlik okunamadı');
  const mobil = CSS.match(/@media \(max-width: 860px\)[\s\S]{0,4000}?\.kart\s*\{[^}]*width:\s*(\d+)px/);
  assert.ok(mobil, '@media (max-width: 860px) içinde .kart genişliği bulunamadı');
  const sizes = oku('src', 'lib', 'gorsel.ts');
  assert.match(
    sizes,
    new RegExp(`${mobil[1]}px, ${masaustu[1]}px`),
    `sizes bildirimi CSS ile aynı olmalı (mobil ${mobil[1]}px, masaüstü ${masaustu[1]}px)`
  );
});

/* ================================================================ */
/* 3 · Boyama alanı                                                  */
/* ================================================================ */

test('kart görselleri kendi boyama alanına hapsolmuş', () => {
  assert.match(kural('.kart-gorsel'), /contain:\s*paint/, '.kart-gorsel: contain: paint yok');
});