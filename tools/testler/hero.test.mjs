/**
 * hero.test.mjs — ana sayfa hero'sunun mobil sözleşmesi
 * =====================================================
 * Ölçüm (04.10, 320×568 mobil): hero 751 px yükseklikteydi ve birincil düğme
 * ("Hemen İzle") 558 px'te — yani ekranın dışında, 68 px'lik sabit alt menünün
 * (üst kenarı 500 px) **altında** kalıyordu. Ziyaretçi ana sayfaya girip
 * oynatma düğmesini göremiyordu. Beş düğme alt alta 225 px yer kaplıyor, başlık
 * dört satıra çıkıyor, hero `64vh` tabanı yüzünden dar ekranda da uzuyordu.
 *
 * Düzeltmeden sonra aynı ekranda: hero 426 px, birincil düğme 397–444 px
 * (menünün üstünde), ikinciller tek satırda yatay kaydırılıyor. Bu dosya o
 * davranışı CSS sözleşmesi olarak kilitler — biri "eski hâline" dönerse test
 * kırmızıya döner ve nedeni mesajda yazar.
 *
 * Tarayıcı yok: `globals.css` metni kurallara göre denetlenir. Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from '../lib/ortak.mjs';

const HAM_CSS = fs.readFileSync(path.join(ROOT, 'src', 'app', 'globals.css'), 'utf8');
/** Yorumlar ayıklanır: gerekçe yorumlarındaki örnek CSS kural sayılmasın. */
const CSS = HAM_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** Bir seçicinin tüm gövdelerini (masaüstü + medya sorguları) birleştirir. */
function kural(secici) {
  const kalipp = new RegExp(`(^|\\n)\\s*${secici.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
  const govdeler = [...CSS.matchAll(kalipp)].map((m) => m[2]);
  assert.ok(govdeler.length, `globals.css: ${secici} kuralı bulunamadı`);
  return govdeler.join('\n');
}

test('hero mobilde içeriğe göre kısalır (64vh tabanı kalktı)', () => {
  const govde = kural('.hero');
  assert.ok(
    /min-height:\s*0\b/.test(govde),
    '.hero: mobilde min-height tabanı yok — dar ekranda hero ekranı doldurup "Hemen İzle" düğmesini sabit alt menünün altına itiyordu'
  );
  assert.ok(
    !/min-height:\s*64vh/.test(govde),
    '.hero: 64vh tabanı geri gelmiş (ölçüm: 320×568 ekranda hero 751 px oluyordu)'
  );
});

test('hero başlığı mobilde iki satıra kırpılır', () => {
  const govde = kural('.hero-ad');
  assert.ok(
    /-webkit-line-clamp:\s*2/.test(govde),
    '.hero-ad: uzun adlar (ör. "Kusuriya no Hitorigoto 2nd Season") dört satıra çıkıp düğmeleri ekran dışına itiyordu'
  );
  assert.ok(/overflow:\s*hidden/.test(govde), '.hero-ad: satır kırpma için overflow: hidden gerekir');
});

test('birincil düğme tam satır, ikinciller kırpılmadan sarılır', () => {
  const dugmeler = kural('.hero-dugmeler');
  assert.ok(
    /grid-template-columns:\s*1fr\b/.test(dugmeler),
    '.hero-dugmeler: mobilde tek sütunlu ızgara olmalı (birincil düğme tam satır)'
  );
  assert.ok(
    /width:\s*100%/.test(kural('.hero-dugmeler .dugme-birincil')),
    '.hero-dugmeler .dugme-birincil: mobilde tam satır genişliğinde olmalı'
  );
  /* Yatay kaydırma denendi ve geri alındı: sağ kenarda "Detaylar" yarım
     görünüyordu (kullanıcı geri bildirimi: "detaylar düğmesi kesilmiş").
     İkinciller artık iki sütunda sarılır — hiçbir düğme kırpılmaz. */
  assert.ok(
    /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(kural('.hero-ikinciller')),
    '.hero-ikinciller: iki sütunlu ızgara bekleniyor (kırpılan düğme geri gelmesin)'
  );
  assert.ok(
    !/overflow-x:\s*auto/.test(kural('.hero-ikinciller')),
    '.hero-ikinciller: yatay kaydırma kaldırıldı — düğmeler kırpılıyordu'
  );
});

test('hero mobilde dikey kapak kullanır (16:9 afiş kırpılmaz)', () => {
  const hero = fs.readFileSync(path.join(ROOT, 'src', 'components', 'Hero.tsx'), 'utf8');
  assert.match(hero, /<picture/, 'Hero: mobil için <picture> art-direction yok');
  assert.match(
    hero,
    /media="\(max-width: 860px\)"/,
    'Hero: mobil kaynak medya sorgusu eksik — 16:9 afiş ortasından kesilip büyütülür'
  );
  assert.match(hero, /posterKapakSrcSet\(/, 'Hero: dikey kapak srcSet\u2019i (MAL 225 + AniList 460) kullanılmıyor');
  assert.ok(
    /hero-resim/.test(fs.readFileSync(path.join(ROOT, 'src', 'app', 'globals.css'), 'utf8')),
    '.hero-resim: <picture> sarmalayıcısı düzende görünmez olmalı (display: contents)'
  );
});

test('ikincil sarmalayıcı masaüstünde görünmez kalır', () => {
  assert.ok(
    /display:\s*contents/.test(kural('.hero-ikinciller')),
    '.hero-ikinciller: masaüstünde display: contents olmalı — sarmalayıcı düzeni değiştirirse beş düğme aynı satıra dizilemez'
  );
});

test('hero perdesi mobilde dikey katman taşır', () => {
  const perde = kural('.hero-perde');
  assert.ok(
    /linear-gradient\(\s*180deg/.test(perde),
    '.hero-perde: yatay (90deg) perde dik ekranda metnin altını kapatmıyordu; dikey katman gerekir'
  );
});

test('hero görseli mobilde yüz bandına kırpılır', () => {
  const govde = kural('.hero-gorsel');
  assert.ok(
    /object-position:\s*center\s+\d+%/.test(govde) && /object-position:\s*center\s+22%/.test(govde),
    '.hero-gorsel: mobilde (dik kutu) 16:9 afişin kırpılması sertleşiyor; object-position center 22% bekleniyor'
  );
});
