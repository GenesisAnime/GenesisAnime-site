/**
 * dongu.test.mjs — günlük tarama döngüsünün karar mantığı
 * =======================================================
 * Kapsam: `tools/lib/dongu.mjs` → "şimdi koşmalı mıyız?" kararı. Ağsız, dosyasız,
 * bağımlılıksız; zaman her testte sabit verilir.
 *
 * Neyi korur?
 *   · Panel "kapalı" dediyse hiçbir koşul koşuyu zorlayamaz (zorla hariç)
 *   · Günde bir koşu: aynı gün ikinci kez taranmaz (hedef siteleri boşuna yormayız)
 *   · Bilgisayar gece kapalıysa gün içinde açıldığında koşu kaçmaz (saat karşılaştırması)
 *   · Başarısız koşudan hemen sonra tekrar denenmez, birkaç saat sonra denenir
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { donguKarari, kararMetni, yerelGun } from '../lib/dongu.mjs';

const AYAR = { aktif: 1, dilim: 1500, saat: 4, yayinla: 0, push: 0, hemen: 0 };
const GUN = new Date(2026, 9, 2); // 2 Ekim 2026, yerel saat

/** Belirtilen yerel saatte bir tarih üretir. */
function saat(s, dk = 0) {
  return new Date(GUN.getFullYear(), GUN.getMonth(), GUN.getDate(), s, dk);
}

function kosu(sonuc, yerelSaat, gun = GUN) {
  const d = new Date(gun.getFullYear(), gun.getMonth(), gun.getDate(), yerelSaat);
  return { zaman: d.toISOString(), sonuc };
}

test('yerelGun: gün anahtarı yerel saate göre üretilir', () => {
  assert.equal(yerelGun(saat(23, 59)), '2026-10-02');
  assert.equal(yerelGun(saat(0, 0)), '2026-10-02');
  // UTC'ye çevrildiğinde gün değişse bile yerel gün aynı kalmalı.
  assert.equal(yerelGun('2026-10-01T22:30:00.000Z'), '2026-10-02');
});

test('donguKarari: panel kapalıysa koşmaz', () => {
  const k = donguKarari({ ayar: { ...AYAR, aktif: 0 }, kosular: [], simdi: saat(12) });
  assert.equal(k.kos, false);
  assert.equal(k.neden, 'kapali');
});

test('donguKarari: saat gelmeden koşmaz, geldiğinde koşar', () => {
  assert.equal(donguKarari({ ayar: AYAR, kosular: [], simdi: saat(3, 59) }).neden, 'saat-gelmedi');
  assert.equal(donguKarari({ ayar: AYAR, kosular: [], simdi: saat(4, 0) }).kos, true);
  // Bilgisayar gece kapalıysa: öğleden sonra açıldığında koşu kaçmaz.
  const geç = donguKarari({ ayar: AYAR, kosular: [], simdi: saat(15, 20) });
  assert.equal(geç.kos, true);
  assert.equal(geç.neden, 'gunluk');
});

test('donguKarari: günde bir koşu (aynı gün tekrar taranmaz)', () => {
  const k = donguKarari({ ayar: AYAR, kosular: [kosu('ok', 4)], simdi: saat(23) });
  assert.equal(k.kos, false);
  assert.equal(k.neden, 'bugun-kostu');
  // Dün koşmuşsa bugün yine koşar.
  const dün = new Date(GUN.getFullYear(), GUN.getMonth(), GUN.getDate() - 1, 4);
  assert.equal(donguKarari({ ayar: AYAR, kosular: [kosu('ok', 4, dün)], simdi: saat(5) }).kos, true);
});

test('donguKarari: hatalı koşudan sonra kısa süre beklenir, sonra tekrar denenir', () => {
  const kosular = [kosu('hata', 4)];
  assert.equal(donguKarari({ ayar: AYAR, kosular, simdi: saat(5) }).neden, 'hata-sonrasi-bekleme');
  assert.equal(donguKarari({ ayar: AYAR, kosular, simdi: saat(20) }).kos, true);
});

test('donguKarari: panelden "hemen çalıştır" ve "zorla" saat/gün kuralını aşar', () => {
  const hemen = donguKarari({ ayar: { ...AYAR, hemen: 1, saat: 23 }, kosular: [kosu('ok', 4)], simdi: saat(9) });
  assert.equal(hemen.kos, true);
  assert.equal(hemen.neden, 'hemen');
  const zorla = donguKarari({ ayar: { ...AYAR, aktif: 0 }, kosular: [kosu('ok', 4)], simdi: saat(9), zorla: true });
  assert.equal(zorla.kos, true);
  assert.equal(zorla.neden, 'zorla');
});

test('donguKarari: panel ayarı okunamazsa iş yapmaz', () => {
  const k = donguKarari({ ayar: null, kosular: [], simdi: saat(12) });
  assert.equal(k.kos, false);
  assert.equal(k.neden, 'ayar-yok');
});

test('kararMetni: her neden için okunur metin döner', () => {
  for (const neden of ['zorla', 'kapali', 'hemen', 'bugun-kostu', 'hata-sonrasi-bekleme', 'saat-gelmedi', 'gunluk', 'ayar-yok']) {
    const metin = kararMetni({ kos: false, neden });
    assert.ok(metin && metin !== neden, `${neden} için okunur metin yok`);
  }
  assert.equal(kararMetni({ kos: false, neden: 'bilinmeyen-neden' }), 'bilinmeyen-neden');
});
