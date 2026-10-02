/**
 * belge.test.mjs — belge ağının kendisi test edilir
 * ================================================
 * Neyi korur:
 *   · Belge içi göreli bağlantılar gerçekten var olan dosyaya çıkmalı. Bir belgeyi
 *     taşıyıp bağlantıyı güncellememek, depoyu GitHub'da "404 veren belgeler"
 *     yığınına çevirir; bu test ilk kırık bağlantıda kırmızıya döner.
 *     (İlk koşuda gerçek bir hata yakaladı: `docs/04` içindeki `../../…` yolları
 *     iki seviye yukarıyı işaret ediyordu — 9 bağlantı 404 veriyordu.)
 *   · Her `docs/NN-*.md` dosyası README'nin "Belgeler" listesinde görünmeli:
 *     belge yazıp listede unutmak, belgeyi kimsenin bulamayacağı yere koymaktır.
 *   · Rakip analizi (`docs/13`) oynatıcı belgesinden ve yol haritasından bağlı
 *     kalmalı — tek yerde duran bir analiz zamanla koddan kopar.
 *
 * Not: `docs/wiki/*.md` **kapsam dışı**: o dosyalar GitHub Wiki deposuna taşınmak
 * için yazıldı, bağlantıları wiki sayfa adlarıdır (`API`, `Kurulum`…) ve dosya
 * sisteminde karşılıkları yoktur. Bu ayrım bilinçli.
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('../..', import.meta.url));

function dosyaOku(goreli) {
  return readFileSync(path.join(KOK, goreli), 'utf8');
}

/** Bağlantı denetimine giren dosyalar (wiki hariç — yukarıdaki nota bak). */
function belgeler() {
  const liste = ['README.md', 'AGENTS.md'];
  for (const dizin of ['docs', 'docs/kararlar', 'docs/gunluk']) {
    for (const ad of readdirSync(path.join(KOK, dizin))) {
      if (ad.endsWith('.md')) liste.push(`${dizin}/${ad}`);
    }
  }
  return liste;
}

/** `[metin](hedef)` bağlantılarını süzer; dış/demet bağlantıları atlar. */
function goreliBaglantilar(icerik) {
  const hedefler = [];
  for (const m of icerik.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const h = m[1];
    if (/^(https?:|mailto:|tel:|#)/.test(h)) continue;
    hedefler.push(h);
  }
  return hedefler;
}

test('belgelerdeki göreli bağlantılar var olan dosyaya çıkar', () => {
  const kirik = [];
  for (const belge of belgeler()) {
    for (const hedef of goreliBaglantilar(dosyaOku(belge))) {
      const temiz = decodeURIComponent(hedef.split('#')[0]);
      if (!existsSync(path.resolve(KOK, path.dirname(belge), temiz))) {
        kirik.push(`${belge} → ${hedef}`);
      }
    }
  }
  assert.deepEqual(kirik, [], `kırık belge bağlantısı: GitHub'da 404 verir\n  ${kirik.join('\n  ')}`);
});

test('her docs/NN-*.md README belge listesinde', () => {
  const readme = dosyaOku('README.md');
  const eksik = readdirSync(path.join(KOK, 'docs'))
    .filter((ad) => /^\d\d-.*\.md$/.test(ad))
    .filter((ad) => !readme.includes(`docs/${ad}`));
  assert.deepEqual(eksik, [], `README "Belgeler" listesinde olmayan dosya: ${eksik.join(', ')}`);
});

test('rakip oynatıcı analizi (docs/13) iki belgeden bağlı', () => {
  const onDort = dosyaOku('docs/04-oynatici-ve-kaynaklar.md');
  const yolHaritasi = dosyaOku('docs/10-yol-haritasi.md');
  assert.ok(
    onDort.includes('13-openani-oynatici-analizi.md'),
    'oynatıcı belgesi (docs/04) analize bağlantı vermiyor',
  );
  assert.ok(
    yolHaritasi.includes('13-openani-oynatici-analizi.md'),
    'yol haritası (docs/10) analize bağlantı vermiyor',
  );
});
