/**
 * api-dokumani.test.mjs — API belgesi kodla uyuşuyor mu?
 * ======================================================
 * Belge elle yazılır ama koddan kopamaz. Üç kaynak karşılaştırılır:
 *   1. `src/app/api-dokumani/page.tsx`  → yayınlanan belge (kullanıcının okuduğu)
 *   2. `api/src/index.mjs` başlık yorumu → yönlendiricinin kendi uç listesi
 *   3. `api/src/yardimci.mjs` · `yolCoz` → gerçekte yönlendirilen yollar
 *
 * Neyi korur?
 *   · Belgede olmayan bir uç eklenirse (yorum güncellenir, sayfa güncellenmez) test düşer
 *   · Belgede yazılı ama yönlendiricide OLMAYAN bir uç (hayalet belge) testi düşürür
 *   · Yöntem yanlış yazılırsa (`POST /me/durum` gibi) `yolCoz` “yontem-yok” der ve test düşer
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { yolCoz } from '../../api/src/yardimci.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAYFA = path.join(ROOT, 'src', 'app', 'api-dokumani', 'page.tsx');
const YONLENDIRICI = path.join(ROOT, 'api', 'src', 'index.mjs');

/** Metinden `YÖNTEM /yol` çiftlerini çıkarır (sorgu dizesi ve `:id` normalize edilir). */
function ucCiftleri(metin) {
  const ciftler = new Set();
  const desen = /\b(GET|POST|PUT|DELETE)\s+(\/[^\s`'"]*)/g;
  for (const [, yontem, ham] of metin.matchAll(desen)) {
    const yol =
      ham
        .split('<')[0] // JSX etiketi yapışırsa kes: “/me/veri</code>”
        .split('?')[0] // sorgu dizesini at (yönlendirici sorguyu ayrı çözer)
        .replace(/[`'",.;:)\]]+$/, '')
        .replace(/\/$/, '') || '/';
    ciftler.add(`${yontem} ${yol}`);
  }
  return ciftler;
}

/** Yönlendiricinin başlık yorumundaki uç listesi (kanonik kaynak). */
function yorumUclari(metin) {
  const bas = metin.indexOf('Uçlar:');
  const son = metin.indexOf('*/', bas);
  const blok = bas >= 0 && son > bas ? metin.slice(bas, son) : '';
  assert.ok(blok.length > 0, 'api/src/index.mjs başlık yorumunda “Uçlar:” listesi bulunamadı');
  return ucCiftleri(blok);
}

const sayfaMetni = fs.readFileSync(SAYFA, 'utf8');
const yonlendiriciMetni = fs.readFileSync(YONLENDIRICI, 'utf8');
const belge = ucCiftleri(sayfaMetni);
const yorum = yorumUclari(yonlendiriciMetni);

test('belge: her satır gerçekten yönlendiriliyor', () => {
  const hatali = [];
  for (const cift of belge) {
    const [yontem, yol] = cift.split(' ');
    const somut = yol.replace(/:\w+/g, '1'); // /bildirim/:id → /bildirim/1
    const { islem } = yolCoz(somut, yontem);
    if (islem === 'yok' || islem === 'yontem-yok') hatali.push(`${cift} → ${islem}`);
  }
  assert.deepEqual(hatali, [], 'belgede yönlendiricinin tanımadığı uç(lar) var');
});

test('belge ile yönlendirici listesi birebir aynı', () => {
  const eksik = [...yorum].filter((u) => !belge.has(u)).sort();
  const fazla = [...belge].filter((u) => !yorum.has(u)).sort();
  assert.deepEqual(eksik, [], 'yönlendiricide olup belgede yazılmayan uç(lar) var');
  assert.deepEqual(fazla, [], 'belgede olup yönlendirici listesinde bulunmayan uç(lar) var');
});

test('belge: kritik başlıklar ve sınırlar yazılı', () => {
  for (const metin of [
    'Bearer',
    'ADMIN_TOKEN',
    'CORS',
    '429',
    '409',
    'NEXT_PUBLIC_API',
    'DELETE /me',
    'GET /tarama/durum',
  ]) {
    assert.ok(sayfaMetni.includes(metin), `belgede “${metin}” geçmiyor`);
  }
});
