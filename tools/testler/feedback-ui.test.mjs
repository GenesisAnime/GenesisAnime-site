import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const css = read('src/app/globals.css');
const player = read('src/components/IzleIstemci.tsx');
const flow = read('src/lib/akis.ts');

test('mobile search has a full-width row on narrow screens', () => {
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.ust-arama\s*\{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.ust-arama form,[\s\S]*?\.ust-arama input\s*\{[\s\S]*?width:\s*100%/);
});

test('mobile search suggestions stay within the input and viewport width', () => {
  assert.match(css, /\.ust-arama-sonuc\s*\{[^}]*box-sizing:\s*border-box/);
  assert.match(css, /\.ust-arama-sonuc\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.ust-arama-sonuc\s*\{[^}]*max-width:\s*100%/);
  assert.match(css, /\.ust-arama-sonuc\s*\{[^}]*overflow-x:\s*hidden/);
  assert.match(css, /\.arama-oge\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.arama-oge-bilgi\s*\{[^}]*flex:\s*1 1 0[^}]*min-width:\s*0/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.ust-arama-sonuc\s*\{[^}]*max-height:\s*min\(62vh, calc\(100dvh - 150px\)\)/);
});

test('source picker separates fansub selection from hosting-player selection', () => {
  const fansub = player.indexOf('className="fansub-suzgec"');
  const provider = player.indexOf('className="oynatici-secici"');
  assert.ok(fansub >= 0 && provider > fansub, 'player selector follows the fansub selector');
  assert.match(player, /const oynaticiSecenekleri = useMemo/);
  assert.match(player, /oynaticiSuzgeci/);
  assert.match(player, /playerAd\(k\[0\]\)/, 'source chips identify the hosting player');
});

test('offscreen catalog rows defer rendering and progress timer avoids one-second rerenders', () => {
  assert.match(css, /\.satir\s*\{[^}]*content-visibility:\s*auto/);
  assert.match(player, /setInterval\(\(\)\s*=>\s*\{\s*saniyeRef\.current\s*\+=\s*1;/);
  assert.doesNotMatch(player, /setSaniye/);
});

test('player modes separate external embed from site playback and source outcomes', () => {
  assert.match(player, /Kaynağın playerı/);
  assert.match(player, /Sitenin playerı/);
  assert.match(player, /Sitenin playerında çalışan/);
  assert.match(player, /Sitenin playerında çalışmayan/);
  assert.match(player, /Henüz denenmeyen/);
  assert.match(player, /API bekleniyor/);
  assert.doesNotMatch(flow, /kaynak kendi oynatıcısıyla açıldı/);
  assert.match(flow, /kaynağın playerını kullanabilir/);
  assert.match(player, /embed playerı kullanılıyor; GenesisAnime oynatma konumunu okuyamıyor/);
});
