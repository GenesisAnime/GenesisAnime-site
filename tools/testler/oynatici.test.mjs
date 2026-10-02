/**
 * oynatici.test.mjs — "kullanım dışı player" durumunun sözleşmesi
 * ==============================================================
 * Neyi korur:
 *   · Sebep ve tarih zorunlu: "şu anlık erişim yok" ifadesi süresiz bir yasak değil,
 *     gözden geçirme tarihi olan bir karardır (tahmin değil ölçüm kanıtı taşır).
 *   · Etiket tek kaynaktan gelir ve **her iki yüzeyde** görünür: oynatıcı çipleri
 *     (`IzleIstemci.tsx`) ve künye (`kunye/page.tsx`).
 *   · Kullanım dışı kaynak **gizlenmez**: oynatıcıda kaynak listesinden filtrelenip
 *     atılmamalı (tek kaynağı Sibnet olan bölüm boş kalmamalı), yalnızca geri plana
 *     düşmeli ve etiketlenmeli.
 *
 * Not: `oynatici.ts` doğrudan içe aktarılır; bu, Node'un TypeScript şerit açmasını
 * gerektirir (Node ≥ 22.18). Desteklenmiyorsa yalnızca ilgili testler atlanır.
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('../..', import.meta.url));
const ATLA = 'Node bu sürümde .ts modülünü doğrudan çalıştıramıyor (Node ≥ 22.18 gerekir)';

const OKU = (goreli) => readFileSync(path.join(KOK, goreli), 'utf8');
const IZLE = path.join('src', 'components', 'IzleIstemci.tsx');
const KUNYE = path.join('src', 'app', 'kunye', 'page.tsx');

let oynatici = null;
let bicim = null;
try {
  oynatici = await import('../../src/lib/oynatici.ts');
  bicim = await import('../../src/lib/bicim.ts');
} catch {
  oynatici = null;
}

test('kullanım dışı kayıt: sebep, karar, gözden geçirme ve kanıt zorunlu', { skip: oynatici ? false : ATLA }, () => {
  const kayitlar = oynatici.kullanimDisiPlayerlar();
  assert.ok(kayitlar.length > 0, 'hiç kullanım dışı player yok — bu turda Sibnet işaretlenmişti');
  for (const d of kayitlar) {
    assert.equal(d.etiket, oynatici.KULLANIM_DISI_ETIKETI, 'etiket tek sabitten gelmeli');
    assert.ok(d.sebep && d.sebep.length > 20, `${d.player}: sebep açıklayıcı olmalı (tahmin değil)`);
    assert.match(d.karar, /\d{4}/, `${d.player}: karar tarihi yazılmalı`);
    assert.match(d.gozdenGecirme, /\d{4}/, `${d.player}: gözden geçirme tarihi yazılmalı`);
    assert.equal(typeof d.gecici, 'boolean', `${d.player}: geçici/kalıcı ayrımı açık olmalı`);
    assert.ok(d.belge && /\.(json|md)$/.test(d.belge), `${d.player}: ölçüm kanıtı belge yolu taşımalı`);
  }
});

test('Sibnet işaretli: ölçülen 403 sebebi ve kanıtı kayıtta', { skip: oynatici ? false : ATLA }, () => {
  const d = oynatici.oynaticiDurumu('SIBNET');
  assert.ok(d, 'Sibnet kullanım dışı işaretli değil');
  assert.equal(d.gecici, true, 'erişim kesintisi geçici sayılmalı (gözden geçirilecek)');
  assert.match(d.sebep, /403/, 'sebep ölçülen durum kodu içermeli');
  assert.equal(d.belge, 'docs/olcum/akis-2026-10-02.json');
});

test('kullanimDisiMi: yalnız işaretli player için true, bilinmeyen için false', { skip: oynatici ? false : ATLA }, () => {
  assert.equal(oynatici.kullanimDisiMi('SIBNET'), true);
  assert.equal(oynatici.kullanimDisiMi('MAIL'), false);
  assert.equal(oynatici.kullanimDisiMi('ODNOKLASSNIKI'), false);
  assert.equal(oynatici.kullanimDisiMi(''), false);
  assert.equal(oynatici.oynaticiDurumu('MAIL'), null);
});

test('durum kaydı bilinmeyen player için yok sayılır (çökmez)', { skip: oynatici ? false : ATLA }, () => {
  assert.equal(oynatici.oynaticiDurumu('UYDURMA'), null);
  assert.equal(oynatici.oynaticiDurumu(''), null);
});

test('işaretli player adı taksonomide bilinen bir anahtar', { skip: oynatici && bicim ? false : ATLA }, () => {
  for (const d of oynatici.kullanimDisiPlayerlar()) {
    assert.notEqual(
      bicim.playerAd(d.player),
      d.player,
      `${d.player} taksonomide tanınmıyor: playerAd anahtarı olduğu gibi döndürdü (yazım hatası?)`,
    );
  }
});

test('durumOzeti: geçicilik ve iki tarihi tek satırda taşır', { skip: oynatici ? false : ATLA }, () => {
  const d = oynatici.oynaticiDurumu('SIBNET');
  const ozet = oynatici.durumOzeti(d);
  assert.match(ozet, /geçici/);
  assert.match(ozet, new RegExp(d.karar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(ozet, new RegExp(d.gozdenGecirme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('etiket iki yüzeyde birden kullanılıyor: oynatıcı ve künye', () => {
  const izle = OKU(IZLE);
  const kunye = OKU(KUNYE);
  assert.ok(izle.includes("from '@/lib/oynatici'"), 'oynatıcı durum modülünü içe aktarmıyor');
  assert.ok(kunye.includes("from '@/lib/oynatici'"), 'künye durum modülünü içe aktarmıyor');
  assert.ok(izle.includes('oynaticiDurumu('), 'oynatıcı çipleri durumu okumuyor');
  assert.ok(kunye.includes('kullanimDisiPlayerlar('), 'künye kullanım dışı listesini göstermiyor');
});

test('kullanım dışı kaynak listeden atılmaz (gizleme yok, yalnızca etiket)', () => {
  const izle = OKU(IZLE);
  assert.ok(
    !/filter\([^)]*kullanimDisiMi/.test(izle) && !/!kullanimDisiMi\(/.test(izle),
    'kullanım dışı kaynaklar listeden filtrelenmiş: arşivin parçası olan kaynak gizlenmemeli',
  );
  assert.ok(izle.includes('kapali'), 'çiplerde kullanım dışı görsel işareti (kapali sınıfı) yok');
});
