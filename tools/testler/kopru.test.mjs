/**
 * kopru.test.mjs — gömülü oynatıcı köprüsünün saf mantığı
 *
 * Neyi korur:
 *   · Arşivdeki `href.li/?…` sarmalayıcısı çözülür (VK adresleri böyle yazılı)
 *   · VK adresine `js_api=1` eklenir, mevcut parametreler (oid/id/hash/hd) korunur
 *   · Komutlar **nesne** olarak üretilir — ölçümde `JSON.stringify` biçimi cevapsız
 *     kaldı, bu test o hatanın geri gelmesini engeller
 *   · Yetenek bayrakları ölçümü yansıtır: yalnız VK'da komut+telemetri var
 *   · Host'ların farklı olay şemaları (VK düz nesne, OK `data` içinde,
 *     Mail.ru düz metin "inited") tek biçime indirgenir
 *
 * Not: `kopru.ts` doğrudan içe aktarılır; bu, Node'un TypeScript şerit açmasını
 * gerektirir (Node ≥ 22.18). Desteklenmiyorsa yalnızca bu dosyanın testleri atlanır.
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

let kopru = null;
try {
  kopru = await import('../../src/lib/kopru.ts');
} catch {
  kopru = null;
}
const atla = kopru ? false : ATLA;

/* Üretim verisinden alınan gerçek kayıt (public/data/anime/009-1.json, 1. bölüm).
   Bu satır, ölçümün neden gerekli olduğunun kanıtı: VK adresi sarmalayıcıyla yazılı. */
const GERCEK_VK = 'https://href.li/?https://vk.com/video_ext.php?oid=246903127&id=167933218&hash=fa116c68bb4e0d3b&hd=1';
const GERCEK_SIBNET = 'https://video.sibnet.ru/shell.php?videoid=1425590';
const GERCEK_MAIL = 'https://videoapi.my.mail.ru/videos/embed/gmail.com/alonealadyofdarkness/_myvideo/1.html';

test('sarmalayiciCoz: href.li sarmalayıcısı gerçek adresi açığa çıkarır', { skip: atla }, () => {
  assert.equal(
    kopru.sarmalayiciCoz(GERCEK_VK),
    'https://vk.com/video_ext.php?oid=246903127&id=167933218&hash=fa116c68bb4e0d3b&hd=1'
  );
});

test('sarmalayiciCoz: yüzde kodlanmış sarmalayıcıyı da çözer', { skip: atla }, () => {
  const kodlu = 'https://href.li/?https%3A%2F%2Fvk.com%2Fvideo_ext.php%3Foid%3D1%26id%3D2';
  assert.equal(kopru.sarmalayiciCoz(kodlu), 'https://vk.com/video_ext.php?oid=1&id=2');
});

test('sarmalayiciCoz: sarmalayıcısız ve boş adresi bozmaz', { skip: atla }, () => {
  assert.equal(kopru.sarmalayiciCoz(GERCEK_SIBNET), GERCEK_SIBNET);
  assert.equal(kopru.sarmalayiciCoz(''), '');
  assert.equal(kopru.sarmalayiciCoz('bu bir adres değil'), 'bu bir adres değil');
});

test('kaynakAdresi: VK sarmalayıcıdan çıkar ve js_api=1 ile API açılır', { skip: atla }, () => {
  const cikti = kopru.kaynakAdresi(GERCEK_VK);
  assert.ok(cikti.startsWith('https://vk.com/video_ext.php?'), cikti);
  assert.ok(cikti.includes('js_api=1'), cikti);
  /* Kimlik parametreleri kaybolmamalı — yoksa gömme çalışmaz. */
  for (const p of ['oid=246903127', 'id=167933218', 'hash=fa116c68bb4e0d3b', 'hd=1']) {
    assert.ok(cikti.includes(p), `${p} kayboldu: ${cikti}`);
  }
});

test('kaynakAdresi: js_api zaten varsa adres değişmez (etkisiz tekrar yok)', { skip: atla }, () => {
  const bir = kopru.kaynakAdresi(GERCEK_VK);
  assert.equal(kopru.kaynakAdresi(bir), bir);
});

test('kaynakAdresi: köprüsüz adreslere dokunmaz', { skip: atla }, () => {
  assert.equal(kopru.kaynakAdresi(GERCEK_SIBNET), GERCEK_SIBNET);
  assert.equal(kopru.kaynakAdresi(GERCEK_MAIL), GERCEK_MAIL);
  assert.equal(kopru.kaynakAdresi(''), '');
});

test('kopruBul: köprülü host\'lar tanınır, diğerleri null', { skip: atla }, () => {
  assert.equal(kopru.kopruBul(GERCEK_VK)?.ad, 'vk');
  assert.equal(kopru.kopruBul('https://vk.video/video_ext.php?oid=1')?.ad, 'vk');
  assert.equal(kopru.kopruBul('https://ok.ru/videoembed/1')?.ad, 'ok');
  assert.equal(kopru.kopruBul('https://odnoklassniki.ru/videoembed/1')?.ad, 'ok');
  assert.equal(kopru.kopruBul(GERCEK_MAIL)?.ad, 'mail');
  assert.equal(kopru.kopruBul('https://my.mail.ru/video/embed/1')?.ad, 'mail');
  assert.equal(kopru.kopruBul('https://uqload.com/embed-abc.html'), null);
  assert.equal(kopru.kopruBul('https://drive.google.com/file/d/1/preview'), null);
  assert.equal(kopru.kopruBul('bilinmeyen'), null);
  assert.equal(kopru.kopruBul(''), null);
});

test('yetenek bayrakları: yalnız VK komut kanalı kanıtlanmış', { skip: atla }, () => {
  /* Ölçüm (tools/kopru-komut-test.html, 6 denemeli koşu): VK nesne biçiminde
     komutu 1. denemede kabul etti; OK ve Mail.ru 6 denemede sessiz kaldı.
     Bir bayrağı true yapmak yeni ölçüm gerektirir — bu test o kararı zorlar. */
  assert.deepEqual(
    ['vk', 'ok', 'mail'].map((ad) => {
      const k = kopru.kopruBul(ad === 'vk' ? 'https://vk.com/video_ext.php' : ad === 'ok' ? 'https://ok.ru/videoembed/1' : 'https://my.mail.ru/video/embed/1');
      return { ad: k.ad, komut: k.komut, telemetri: k.telemetri, hazir: k.hazirSinyali };
    }),
    [
      { ad: 'vk', komut: true, telemetri: true, hazir: true },
      { ad: 'ok', komut: false, telemetri: false, hazir: true },
      { ad: 'mail', komut: false, telemetri: false, hazir: true },
    ]
  );
});

test('kopruOrigin: her köprü kendi origin\'ini bildirir', { skip: atla }, () => {
  assert.equal(kopru.kopruOrigin('vk'), 'https://vk.com');
  assert.equal(kopru.kopruOrigin('ok'), 'https://ok.ru');
  assert.equal(kopru.kopruOrigin('mail'), 'https://my.mail.ru');
});

test('komutlar: yükler nesne olarak üretilir (metin biçimi ölçümde çalışmadı)', { skip: atla }, () => {
  for (const eylem of ['oynat', 'duraklat', 'sar']) {
    for (const yuk of kopru.komutlar('vk', eylem, 120)) {
      assert.equal(typeof yuk, 'object', `${eylem} yükü nesne olmalı`);
      assert.notEqual(typeof yuk, 'string');
    }
  }
});

test('komutlar: VK seek alanı `time` (hedefi gerçekten değiştiren biçim)', { skip: atla }, () => {
  const yukler = kopru.komutlar('vk', 'sar', 100);
  assert.deepEqual(yukler, [{ method: 'seek', time: 100 }]);
  assert.deepEqual(kopru.komutlar('vk', 'oynat'), [{ method: 'play' }]);
  assert.deepEqual(kopru.komutlar('vk', 'duraklat'), [{ method: 'pause' }]);
});

test('olayCoz: VK `inited` süreyi verir', { skip: atla }, () => {
  const gercek = '{"videoId":"246903127_167933218","state":"unstarted","volume":1,"muted":false,"time":0,"duration":1450,"quality":0,"event":"inited"}';
  const cikti = kopru.olayCoz(gercek);
  assert.equal(cikti.tur, 'hazir');
  assert.equal(cikti.sure, 1450);
  assert.equal(cikti.saniye, 0);
});

test('olayCoz: VK zaman güncellemesi konum üretir', { skip: atla }, () => {
  const cikti = kopru.olayCoz('{"state":"playing","time":100,"duration":1450.78,"event":"timeupdate"}');
  assert.equal(cikti.tur, 'konum');
  assert.equal(cikti.saniye, 100);
  assert.equal(cikti.sure, 1450.78);
  assert.equal(cikti.oynuyor, true);
});

test('olayCoz: started/paused oynatma durumunu çevirir', { skip: atla }, () => {
  assert.equal(kopru.olayCoz('{"event":"started"}').oynuyor, true);
  assert.equal(kopru.olayCoz({ event: 'started' }).oynuyor, true, 'nesne yük de kabul edilmeli');
  assert.equal(kopru.olayCoz('{"event":"paused"}').oynuyor, false);
  assert.equal(kopru.olayCoz('{"state":"paused","time":42}').oynuyor, false);
});

test('olayCoz: OK `initToParent` ve Mail.ru düz metin "inited" hazır sayılır', { skip: atla }, () => {
  const ok = '{"data":{"type":"initToParent","counterId":87663567,"hid":"978654290"},"__yminfo":"x"}';
  assert.equal(kopru.olayCoz(ok).tur, 'hazir');
  assert.equal(kopru.olayCoz('"inited"').tur, 'hazir');
  assert.equal(kopru.olayCoz('inited').tur, 'hazir');
  assert.equal(kopru.olayCoz({ event: 'inited', time: 0 }).tur, 'hazir');
});

test('olayCoz: tanınmayan yük sessizce yok döner (asla throw etmez)', { skip: atla }, () => {
  for (const yuk of [null, undefined, 42, '', 'merhaba', '{"a":1}', [], {}]) {
    assert.equal(kopru.olayCoz(yuk).tur, 'yok', JSON.stringify(yuk));
  }
});

test('komutOnaylandi: her komut kendi kanıtını ister', { skip: atla }, () => {
  const oynuyor = { tur: 'durum', oynuyor: true };
  const duraklatildi = { tur: 'durum', oynuyor: false };
  const konum = (saniye) => ({ tur: 'konum', saniye, sure: 1450 });

  assert.equal(kopru.komutOnaylandi('oynat', 0, oynuyor), true);
  assert.equal(kopru.komutOnaylandi('oynat', 0, duraklatildi), false, 'duraklatma, oynatmayı onaylamaz');
  assert.equal(kopru.komutOnaylandi('duraklat', 0, duraklatildi), true);
  assert.equal(kopru.komutOnaylandi('duraklat', 0, oynuyor), false);
  assert.equal(kopru.komutOnaylandi('sar', 100, konum(100)), true);
  assert.equal(kopru.komutOnaylandi('sar', 100, konum(104)), true, 'tolerans içi sapma kabul');
  assert.equal(kopru.komutOnaylandi('sar', 100, konum(7)), false, 'hedeften uzak konum onay değil');
  assert.equal(kopru.komutOnaylandi('sar', 100, { tur: 'hazir' }), false);
  assert.equal(kopru.komutOnaylandi('oynat', 0, { tur: 'yok' }), false);
});

test('medyaSaati: ölçülen VK süresi oynatıcı saatine çevrilir', { skip: atla }, () => {
  assert.equal(kopru.medyaSaati(1450), '24:10');
  assert.equal(kopru.medyaSaati(0), '0:00');
  assert.equal(kopru.medyaSaati(59), '0:59');
  assert.equal(kopru.medyaSaati(3725), '1:02:05');
  assert.equal(kopru.medyaSaati(100.7), '1:40');
  assert.equal(kopru.medyaSaati(-5), '0:00');
  assert.equal(kopru.medyaSaati(Number.NaN), '0:00');
});

test('komutZamanlamasi: denemeler sabit aralıkla planlanır', { skip: atla }, () => {
  assert.equal(kopru.komutZamanlamasi(0), 0);
  assert.equal(kopru.komutZamanlamasi(1), kopru.KOMUT_DENEME_ARASI_MS);
  assert.equal(kopru.komutZamanlamasi(3, 1000), 3000);
  assert.equal(kopru.komutZamanlamasi(-5), 0);
});

test('üretim verisi: VK kaynakları gerçekten sarmalayıcıyla yazılı (normalizasyon yüklü)', { skip: atla }, () => {
  const dosya = path.join(KOK, 'public/data/anime/009-1.json');
  const json = JSON.parse(readFileSync(dosya, 'utf8'));
  const vkler = [];
  for (const bolum of json.bolumler ?? []) {
    for (const kaynak of bolum.src ?? []) {
      if (typeof kaynak[2] === 'string' && /vk\.com\/video_ext/.test(kaynak[2])) vkler.push(kaynak[2]);
    }
  }
  if (!vkler.length) return; /* örnek dosyada VK kaynağı kalmadıysa kapsam dışı */
  assert.ok(
    vkler.some((u) => u.startsWith('https://href.li/?')),
    'örnekte sarmalayıcı kalmadı; bu testin varlık sebebi gözden geçirilmeli'
  );
  for (const u of vkler) {
    const hedef = kopru.kaynakAdresi(u);
    assert.ok(hedef.startsWith('https://vk.com/video_ext.php?'), hedef);
    assert.ok(hedef.includes('js_api=1'), hedef);
  }
});
