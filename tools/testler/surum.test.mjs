/**
 * surum.test.mjs — servis çalışanı sürüm çubuğu
 * =============================================
 * Sözleşme: yeni bir servis çalışanı sayfayı devraldığında kullanıcı eski
 * chunk'ta bırakılmaz; alt çubuk çıkar, tek tıkla sayfa yenilenir.
 *
 *   · Metin ve karar tek kaynakta (`src/lib/surum.ts`) — bileşen kendi metnini
 *     yazmaz, testler aynı sözleşmeyi okur.
 *   · Bileşen `controllerchange` + `updatefound` izler, kaydı düzenli yoklar.
 *   · Çubuk stili `globals.css` içinde tanımlı; çalışan hâlâ sürüm damgalı.
 *
 * Tarayıcı yok: dosyalar okunur, sözleşme metinden doğrulanır. Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('../..', import.meta.url));
const oku = (...parcalar) => readFileSync(path.join(KOK, ...parcalar), 'utf8');

test('sürüm sözleşmesi: metin ve karar tek kaynakta', () => {
  const lib = oku('src', 'lib', 'surum.ts');
  assert.match(lib, /SURUM_CUBUGU_METNI\s*=\s*'Yeni sürüm hazır — yenile'/, 'çubuk metni kullanıcının istediği metin olmalı');
  assert.match(lib, /export function cubukGerekli\(/, 'karar saf fonksiyonda durmalı');
  assert.match(lib, /kontrollu/, 'ilk kurulumda çubuk çıkmaz: sayfa önceden kontrollü olmalı');
});

test('yapısal: bileşen yeni sürümü yakalar ve çubuğu gösterir', () => {
  const bilesen = oku('src', 'components', 'ServisCalisani.tsx');
  assert.match(bilesen, /controllerchange/, 'yeni çalışan devralınca haber alınmalı');
  assert.match(bilesen, /updatefound/, 'yeni sürümün kurulumu yakalanmalı');
  assert.match(bilesen, /\.update\(\)/, 'kayıt düzenli yoklanmalı (açık sekme bayat kalmasın)');
  assert.match(bilesen, /cubukGerekli\(/, 'karar paylaşılan fonksiyondan gelmeli');
  assert.match(bilesen, /SURUM_CUBUGU_METNI/, 'metin tek kaynaktan gelmeli');
  assert.match(bilesen, /location\.reload\(\)/, 'yenile düğmesi sayfayı yenilemeli');
  assert.match(bilesen, /className="surum-cubugu"/, 'çubuk sınıfı kullanılmalı');
  assert.match(bilesen, /process\.env\.NODE_ENV !== 'production'/, 'yerel/geliştirme çalışmasında çubuk kurulmamalı');
});

test('yapısal: çubuk stili ve servis çalışanı sürüm damgası', () => {
  const css = oku('src', 'app', 'globals.css');
  assert.match(css, /\.surum-cubugu\s*\{[^}]*position:\s*fixed/, 'çubuk sayfanın altında sabit olmalı');
  assert.match(css, /\.surum-cubugu-dugme\s*\{/, 'çubuk düğmesi stillenmeli');
  const sw = oku('public', 'sw.js');
  assert.match(sw, /skipWaiting\(\)/, 'yeni çalışan bekletilmez (çubuk devralmayı anlatır)');
});

/* Mobilde alt menü sabit ve 68 px yüksekliğinde: çubuk onun üstüne çıkmalı,
   yoksa "Yeni sürüm hazır" metni menünün altında kalır (canlı ölçüm: 8 px
   çakışma). Ölçü CSS'e bağlanır — alt menü büyürse test kırmızıya döner. */
test('mobil: sürüm çubuğu alt menünün üstünde kalır (çakışma yok)', () => {
  const css = oku('src', 'app', 'globals.css');
  const medya = css.match(/@media \(max-width: 860px\) \{\s*\.surum-cubugu \{[^}]*\}/);
  assert.ok(medya, '860px altında çubuk konumu tanımlanmalı (alt menü yalnız orada görünür)');
  const alt = Number(medya[0].match(/bottom:\s*calc\((\d+)px/)?.[1]);
  assert.ok(Number.isFinite(alt), 'çubuk `bottom: calc(<sayı>px + env(safe-area-inset-bottom))` biçiminde olmalı');

  const menu = css.match(/\.alt-menu \{([^}]*)\}/);
  assert.ok(menu, '.alt-menu kuralı bulunamadı');
  assert.ok(css.includes('env(safe-area-inset-bottom)'), 'güvenli alan (çentik) hesaba katılmalı');

  // Canlı ölçüm (390×844 görünüm): sabit alt menü 68 px yüksekliğinde.
  const menuYuksekligi = 68;
  assert.ok(
    alt > menuYuksekligi + 8,
    `çubuk tabanı ${alt}px, alt menü ${menuYuksekligi}px — arada nefes yok, metin menüye değer/altında kalır`
  );
});
