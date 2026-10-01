/**
 * tarama.test.mjs — link tarayıcısının saf mantığı için birim testleri
 * ===================================================================
 * Bağımlılık yoktur: yalnızca Node'un yerleşik `node:test` koşucusu ve `node:assert`.
 * Ağa, SQLite'a ve arşiv verisine dokunulmaz — tüm HTTP yanıtları sentetik kurulur.
 * (Testler `link-tara.mjs`'i modül olarak içe alır; o modül içe alındığında CLI
 * akışını çalıştırmaz ve durum dosyasına yazma tanıtıcısı açmaz.)
 *
 * Neyi korur?
 *   H-8  · arşivdeki "çalışıyor"/"ok" adları doğru duruma eşlenmeli
 *   H-10 · karar, yönlendirme sarmalından sonraki *nihai* host'a da bakmalı
 *   H-11 · VK'da "dosya listesi yok" ASLA ölü demek değildir (belirsiz)
 *   H-12 · MEGA gömme sayfası HTTP ile kanıtlanamaz, "ok" sayılamaz
 *   H-14 · `zamanOku` yerel (GG.AA.YYYY) biçimini ay/gün karıştırmadan okumalı;
 *          yoksa tazelik denetimi kendi kayıtlarımızı "eski" sayıp boşa tarama yapar
 *   Sicil denetimi · aynı oturumda 20 ardışık "ölü" = oran sınırı artefaktı
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DURUM, hostAl, saglikOku } from '../lib/ortak.mjs';
import {
  KURALLAR,
  genelKural,
  hedefBelirle,
  sicilArtefaktlari,
  siniflandir,
  zamanMetni,
  zamanOku,
} from '../link-tara.mjs';

/** Sentetik HTTP yanıtı (`istekYap` ile aynı alanlar; ağ yok). */
const yanit = (kod, govde = '', ek = {}) => ({ kod, govde, json: false, hata: null, sunucu: '', ...ek });

/** Sınıflandırıcıyı arşiv host'u + hedef host ile çalıştırır. */
const karar = (host, y, hedefHost = host) => siniflandir({ ...y, host, hedefHost });

/** Sabit zaman tabanı (sicil denetimi senaryoları için). */
const TABAN = new Date(2026, 8, 23, 20, 50, 0).getTime();
const dakika = (dk) => zamanMetni(new Date(TABAN + dk * 60_000));

/* ================================================================ */
/* 1 · zamanMetni / zamanOku                                        */
/* ================================================================ */

test('zamanOku: yerel biçimi (GG.AA.YYYY SS:DD:SS) doğru okur', () => {
  assert.equal(zamanOku('01.10.2026 14:23:45'), new Date(2026, 9, 1, 14, 23, 45).getTime());
  assert.equal(zamanOku('30.09.2026 10:21:56'), new Date(2026, 8, 30, 10, 21, 56).getTime());
  assert.equal(zamanOku('12.05.2024 00:00:00'), new Date(2024, 4, 12, 0, 0, 0).getTime());
});

test('zamanOku: H-14 — yıl/ay/gün bileşenleri kaymamalı', () => {
  // V8'in Date.parse'ı "01.10.2026 14:23:45" metnini "10 Ocak 2026" diye okuyordu;
  // bu yüzden metin önce kendi regex'imizle çözülür.
  const d = new Date(zamanOku('01.10.2026 14:23:45'));
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 9, 1]);
  assert.deepEqual([d.getHours(), d.getMinutes(), d.getSeconds()], [14, 23, 45]);
});

test('zamanOku: bugün yazılan kayıt taze sayılmalı (boşa tarama olmasın)', () => {
  const yas = Date.now() - zamanOku(zamanMetni());
  assert.ok(yas >= 0 && yas < 2000, `kaydın yaşı ${yas} ms çıktı`);
});

test('zamanMetni: gidiş-dönüş kayıpsız', () => {
  const d = new Date(2026, 0, 5, 9, 7, 3);
  assert.equal(zamanMetni(d), '05.01.2026 09:07:03');
  assert.equal(zamanOku(zamanMetni(d)), d.getTime());
  assert.equal(zamanMetni(new Date(zamanOku(zamanMetni(d)))), zamanMetni(d));
});

test('zamanOku: girdisiz/bozuk değerde null, ISO metinde yedek yol çalışır', () => {
  assert.equal(zamanOku(null), null);
  assert.equal(zamanOku(''), null);
  assert.equal(zamanOku('bilinmeyen'), null);
  assert.equal(zamanOku('2026-10-01T00:00:00Z'), Date.parse('2026-10-01T00:00:00Z'));
});

/* ================================================================ */
/* 2 · hostAl: host çıkarımı                                        */
/* ================================================================ */

test('hostAl: küçük harfe indirir, www. önekini atar, alt alanı korur', () => {
  assert.equal(hostAl('https://www.Uqload.com/embed-abc.html'), 'uqload.com');
  assert.equal(hostAl('https://videoapi.my.mail.ru/videos/embed/gmail.com/x/_myvideo/1.html'), 'videoapi.my.mail.ru');
  assert.equal(hostAl('http://127.0.0.1:8000/kunye/'), '127.0.0.1');
});

test('hostAl: sarmalayıcı host kendi adıyla kalır, bozuk adreste boş döner', () => {
  // href.li bir yönlendirme sarmalı: hedef host'u `hedefBelirle` çözer (H-10).
  assert.equal(hostAl('https://HREF.LI/?https://vk.com/video_ext.php?oid=1&id=2'), 'href.li');
  assert.equal(hostAl('bozuk-adres'), '');
  assert.equal(hostAl(''), '');
});

/* ================================================================ */
/* 3 · hedefBelirle: host → kanıt ucu                               */
/* ================================================================ */

test('hedefBelirle: href.li sarmalını açar, "?" yoksa dokunmaz', () => {
  const acilan = hedefBelirle('https://href.li/?https://vk.com/video_ext.php?oid=1&id=2&hash=abc', 'href.li');
  assert.equal(acilan.hedef, 'https://vk.com/video_ext.php?oid=1&id=2&hash=abc');
  assert.match(acilan.not, /sarmal/);
  const dokunulmayan = hedefBelirle('https://href.li/https://vk.com/x', 'href.li');
  assert.equal(dokunulmayan.hedef, 'https://href.li/https://vk.com/x');
});

test('hedefBelirle: mail.ru iki URL biçimini de JSON ucuna çevirir', () => {
  const kimlik = hedefBelirle('https://my.mail.ru/video/embed/4898784563322425160', 'my.mail.ru');
  assert.equal(kimlik.hedef, 'https://my.mail.ru/+/video/meta/4898784563322425160');
  assert.equal(kimlik.json, true);

  const yol = hedefBelirle('https://my.mail.ru/mail/bcykn/video/embed/_myvideo/118', 'my.mail.ru');
  assert.equal(yol.hedef, 'https://videoapi.my.mail.ru/videos/mail/bcykn/_myvideo/118.json');
  assert.equal(yol.json, true);

  const embed = hedefBelirle('https://videoapi.my.mail.ru/videos/embed/mail/uploadpuzz7/_myvideo/39.html', 'videoapi.my.mail.ru');
  assert.equal(embed.hedef, 'https://videoapi.my.mail.ru/videos/mail/uploadpuzz7/_myvideo/39.json');
  assert.equal(embed.json, true);
});

test('hedefBelirle: Yandex Disk, pixeldrain köprüsü ve Dailymotion uçları', () => {
  const url = 'https://yadi.sk/i/4_6NurZyVmAMOQ';
  const yandex = hedefBelirle(url, 'yadi.sk');
  assert.ok(yandex.hedef.startsWith('https://cloud-api.yandex.net/v1/disk/public/resources?public_key='));
  assert.ok(yandex.hedef.includes(encodeURIComponent(url)));
  assert.equal(yandex.json, true);

  const pixeldrain = hedefBelirle('https://turkanime.tv/pixeldrain.php?id=abc-123', 'turkanime.tv');
  assert.equal(pixeldrain.hedef, 'https://pixeldrain.com/api/file/abc-123/info');
  assert.equal(pixeldrain.json, true);

  const dm = hedefBelirle('https://www.dailymotion.com/embed/video/x82sry8', 'dailymotion.com');
  assert.ok(dm.hedef.startsWith('https://www.dailymotion.com/services/oembed?url='));
  assert.ok(dm.hedef.includes(encodeURIComponent('https://www.dailymotion.com/video/x82sry8')));
  assert.equal(dm.json, true);
});

test('hedefBelirle: bilinmeyen hostta URL aynen kalır (kimlik dönüşümü)', () => {
  const sade = hedefBelirle('https://example.com/video/1', 'example.com');
  assert.deepEqual(sade, { hedef: 'https://example.com/video/1', not: '' });
});

/* ================================================================ */
/* 4 · Genel kanıt politikası                                       */
/* ================================================================ */

test('genelKural: 404/410 ölü, 451 engelli', () => {
  assert.equal(genelKural(yanit(404)).durum, DURUM.OLU);
  assert.equal(genelKural(yanit(410)).durum, DURUM.OLU);
  assert.equal(genelKural(yanit(451)).durum, DURUM.ENGELLI);
});

test('genelKural: 403 yalnızca bot imzası varsa soğuma sebebi sayılır', () => {
  const bot = genelKural(yanit(403, 'Request forbidden by administrative rules'));
  assert.equal(bot.durum, DURUM.BELIRSIZ);
  assert.equal(bot.botDuvarı, true);

  const sade = genelKural(yanit(403, '<h1>Yasak</h1>'));
  assert.equal(sade.durum, DURUM.BELIRSIZ);
  assert.ok(!sade.botDuvarı);
});

test('genelKural: 429 ve 5xx asla ölü sayılmaz', () => {
  const oran = genelKural(yanit(429));
  assert.equal(oran.durum, DURUM.BELIRSIZ);
  assert.equal(oran.botDuvarı, true);
  assert.equal(genelKural(yanit(500)).durum, DURUM.BELIRSIZ);
  assert.equal(genelKural(yanit(503)).durum, DURUM.BELIRSIZ);
});

test('genelKural: yalnızca alan adı çözümlenememesi ölü, diğer ağ hatası belirsiz', () => {
  assert.equal(genelKural(yanit(0, '', { hata: 'ENOTFOUND' })).durum, DURUM.OLU);
  assert.equal(genelKural(yanit(0, '', { hata: 'EAI_AGAIN' })).durum, DURUM.OLU);
  assert.equal(genelKural(yanit(0, '', { hata: 'ECONNRESET' })).durum, DURUM.BELIRSIZ);
  assert.equal(genelKural(yanit(0, '', { hata: 'TimeoutError' })).durum, DURUM.BELIRSIZ);
});

test('genelKural: oynatıcı işareti "ok", kanıtsız yanıt "belirsiz"', () => {
  assert.equal(genelKural(yanit(200, '<video src="a.mp4"></video>')).durum, DURUM.OK);
  assert.equal(genelKural(yanit(200, 'var p = { sources : [ {file:"x"}] }')).durum, DURUM.OK);
  assert.equal(genelKural(yanit(200, 'Bu video is no longer available')).durum, DURUM.OLU);
  assert.equal(genelKural(yanit(200, 'kısa')).durum, DURUM.BELIRSIZ);
  assert.equal(genelKural(yanit(200, 'x'.repeat(30000))).durum, DURUM.BELIRSIZ);
  assert.equal(genelKural(yanit(418)).durum, DURUM.BELIRSIZ);
});

/* ================================================================ */
/* 5 · Host'a özgü kurallar (ölçülmüş imzalar)                      */
/* ================================================================ */

test('sibnet: file: işareti "ok", 403 oran sınırı "belirsiz + botDuvarı"', () => {
  assert.equal(karar('video.sibnet.ru', yanit(200, 'var p = { file : "https://x/y.mp4" };')).durum, DURUM.OK);
  const sinir = karar('video.sibnet.ru', yanit(403, 'Request forbidden by administrative rules'));
  assert.equal(sinir.durum, DURUM.BELIRSIZ);
  assert.equal(sinir.botDuvarı, true);
  // Kural karar vermezse genel kurala düşer (asla sessizce "ok" olmaz)
  assert.equal(karar('video.sibnet.ru', yanit(418)).durum, DURUM.BELIRSIZ);
});

test('mail.ru: meta JSON "ok", video_not_found "ölü"', () => {
  assert.equal(karar('my.mail.ru', yanit(200, '{"meta":{"title":"x"}}', { json: true })).durum, DURUM.OK);
  assert.equal(karar('my.mail.ru', yanit(200, '{"provider":"mail"}', { json: true })).durum, DURUM.OK);
  assert.equal(karar('my.mail.ru', yanit(200, '{"error":"video_not_found"}', { json: true })).durum, DURUM.OLU);
  assert.equal(karar('my.mail.ru', yanit(404)).durum, DURUM.OLU);
  assert.equal(karar('videoapi.my.mail.ru', yanit(200, '{"provider":"mail"}', { json: true })).durum, DURUM.OK);
  assert.equal(karar('my.mail.ru', yanit(200, '{"beklenmeyen":1}', { json: true })).durum, DURUM.BELIRSIZ);
});

test('ok.ru: silinmiş video ölü, kısıtlı video engelli, oynatıcı "ok"', () => {
  const silinmis = karar('odnoklassniki.ru', yanit(200, '<div class="vp_video_stub_txt">Видео не найдено</div>'));
  assert.equal(silinmis.durum, DURUM.OLU);

  const kisitli = karar('ok.ru', yanit(200, '<div class="vp_video_stub_txt">Bu videoya erişim kısıtlanmıştır</div>'));
  assert.equal(kisitli.durum, DURUM.ENGELLI);

  assert.equal(karar('odnoklassniki.ru', yanit(200, '<script>OK.VideoPlayer("//x.m3u8")</script>')).durum, DURUM.OK);
  assert.equal(karar('ok.ru', yanit(410)).durum, DURUM.OLU);
});

test('Drive: başlıkta dosya adı "ok", başlıksız sayfa "belirsiz"', () => {
  assert.equal(karar('drive.google.com', yanit(200, '<title>Bölüm 1.mp4 - Google Drive</title>')).durum, DURUM.OK);
  assert.equal(karar('drive.google.com', yanit(200, '<title>Sayfa bulunamadı</title>')).durum, DURUM.BELIRSIZ);
  assert.equal(karar('docs.google.com', yanit(404)).durum, DURUM.OLU);
});

test('uqload/mp4upload: silinme imzası ölü, oynatıcı işareti "ok"', () => {
  assert.equal(karar('uqload.com', yanit(200, 'This file is no longer available')).durum, DURUM.OLU);
  assert.equal(karar('uqload.com', yanit(200, '<video src="x.mp4"></video>')).durum, DURUM.OK);
  assert.equal(karar('uqload.com', yanit(404)).durum, DURUM.OLU);
  assert.equal(karar('mp4upload.com', yanit(200, 'File was deleted')).durum, DURUM.OLU);
  assert.equal(karar('mp4upload.com', yanit(404)).durum, DURUM.OLU);
});

test('voe: 404 ölü, DDoS duvarı belirsiz (kanıt yok)', () => {
  assert.equal(karar('voe.sx', yanit(404)).durum, DURUM.OLU);
  const duvar = karar('voe.sx', yanit(200, '<html>Just a moment...</html>'));
  assert.equal(duvar.durum, DURUM.BELIRSIZ);
  assert.match(duvar.sebep, /DDoS/);
});

test('VK: dosya listesi yoksa ASLA ölü denmez (H-11)', () => {
  const kabuk = karar('vk.com', yanit(200, '<html><script>var x = 1;</script></html>'));
  assert.equal(kabuk.durum, DURUM.BELIRSIZ);
  assert.match(kabuk.sebep, /dosya listesi yok/);

  const canli = karar('vk.com', yanit(200, '{"files":{"mp4_720":"https://vkvd1.okcdn.ru/x.mp4"}}'));
  assert.equal(canli.durum, DURUM.OK);
  assert.equal(karar('vk.com', yanit(410)).durum, DURUM.OLU);
});

test('MEGA: HTTP katmanı kanıt üretemez, "ok" denemez (H-12)', () => {
  const mega = karar('mega.nz', yanit(200, '<script src="/js/mega.js"></script><video id="x"></video>'));
  assert.equal(mega.durum, DURUM.BELIRSIZ);
  assert.match(mega.sebep, /API/);
  assert.equal(karar('mega.nz', yanit(410)).durum, DURUM.OLU);
});

test('Yandex Disk / Dailymotion / pixeldrain: JSON uçları kararı verir', () => {
  assert.equal(karar('yadi.sk', yanit(200, '{"type":"file","name":"bölüm.mp4"}', { json: true })).durum, DURUM.OK);
  assert.equal(karar('yadi.sk', yanit(200, '{"error":"NotFoundError"}', { json: true })).durum, DURUM.OLU);
  assert.equal(karar('dailymotion.com', yanit(200, '{"title":"Bölüm 1"}', { json: true })).durum, DURUM.OK);
  assert.equal(karar('dailymotion.com', yanit(200, '{"error":"Invalid video URL."}', { json: true })).durum, DURUM.OLU);
  assert.equal(karar('pixeldrain.com', yanit(200, '{"success":true}', { json: true })).durum, DURUM.OK);
  assert.equal(karar('turkanime.tv', yanit(404)).durum, DURUM.OLU);
});

test('siniflandir: karar, yönlendirme sarmalının nihai host’una da bakar (H-10)', () => {
  const sarmalKabuk = siniflandir({ ...yanit(200, '<html><script>var x = 1;</script></html>'), host: 'href.li', hedefHost: 'vk.com' });
  assert.equal(sarmalKabuk.durum, DURUM.BELIRSIZ);
  assert.match(sarmalKabuk.sebep, /VK/);

  const sarmalCanli = siniflandir({ ...yanit(200, '{"files":{"mp4_1080":"https://x.okcdn.ru/a.mp4"}}'), host: 'href.li', hedefHost: 'vk.com' });
  assert.equal(sarmalCanli.durum, DURUM.OK);

  const sarmalOlu = siniflandir({ ...yanit(404), host: 'href.li', hedefHost: 'vk.com' });
  assert.equal(sarmalOlu.durum, DURUM.OLU);
});

test('KURALLAR: isimli, host listesi dolu ve host çakışması yok', () => {
  assert.ok(KURALLAR.length >= 10, `kural sayısı ${KURALLAR.length}`);
  const gorulen = new Set();
  for (const kural of KURALLAR) {
    assert.equal(typeof kural.ad, 'string');
    assert.ok(Array.isArray(kural.hostlar) && kural.hostlar.length > 0, `${kural.ad}: host listesi boş`);
    assert.equal(typeof kural.fn, 'function');
    for (const host of kural.hostlar) {
      assert.ok(!gorulen.has(host), `aynı host iki kuralda: ${host}`);
      gorulen.add(host);
    }
  }
});

/* ================================================================ */
/* 6 · Sicil denetimi (oran sınırı artefaktları)                    */
/* ================================================================ */

const sibnetKaydi = (n, durum, dk) => ({ url: `https://video.sibnet.ru/shell.php?videoid=${n}`, durum, zaman: dakika(dk) });

test('sicilArtefaktlari: 20 ardışık "ölü"den sonrası artefakt sayılır', () => {
  const satirlar = [
    ...Array.from({ length: 19 }, (_, i) => sibnetKaydi(i, 'ölü', i)),
    ...Array.from({ length: 6 }, (_, i) => sibnetKaydi(100 + i, 'ölü', 19 + i)),
  ];
  const { ilgili, artefaktlar } = sicilArtefaktlari(satirlar, 'video.sibnet.ru');
  assert.equal(ilgili, 25);
  assert.equal(artefaktlar.length, 6);
  assert.equal(artefaktlar[0].url, satirlar[19].url);
});

test('sicilArtefaktlari: 30 dakikadan uzun boşluk yeni oturum sayılır', () => {
  const satirlar = [
    ...Array.from({ length: 25 }, (_, i) => sibnetKaydi(i, 'ölü', i)),
    ...Array.from({ length: 25 }, (_, i) => sibnetKaydi(200 + i, 'ölü', 65 + i)),
  ];
  const { artefaktlar } = sicilArtefaktlari(satirlar, 'video.sibnet.ru');
  assert.equal(artefaktlar.length, 12); // her oturumda 6 (20. kayıt ve sonrası)
});

test('sicilArtefaktlari: araya giren canlı kayıt sayacı sıfırlar, başka host karışmaz', () => {
  const satirlar = [
    ...Array.from({ length: 15 }, (_, i) => sibnetKaydi(i, 'ölü', i)),
    sibnetKaydi(50, 'çalışıyor', 15),
    ...Array.from({ length: 15 }, (_, i) => sibnetKaydi(60 + i, 'ölü', 16 + i)),
    { url: 'https://uqload.com/embed-x.html', durum: 'ölü', zaman: dakika(31) },
  ];
  const { ilgili, artefaktlar } = sicilArtefaktlari(satirlar, 'video.sibnet.ru');
  assert.equal(ilgili, 31); // uqload kaydı hesaba katılmaz
  assert.equal(artefaktlar.length, 0);
});

test('sicilArtefaktlari: bozuk/eksik zaman damgası oturumu bölmez', () => {
  const satirlar = [
    ...Array.from({ length: 25 }, (_, i) => sibnetKaydi(i, 'ölü', i)),
    ...Array.from({ length: 3 }, (_, i) => ({ url: `https://video.sibnet.ru/shell.php?videoid=${900 + i}`, durum: 'ölü' })),
  ];
  const { artefaktlar } = sicilArtefaktlari(satirlar, 'video.sibnet.ru');
  // Zaman damgası olmayan kayıtlar 0 sayılır: ileri doğru 30 dakikalık boşluk üretmediği
  // için oturumu bölmez, bozuk mod devam eder (6 damga + 3 kayıt = 9).
  assert.equal(artefaktlar.length, 9);
});

/* ================================================================ */
/* 7 · sağlık kaydı okuma (arşiv + kendi taramamız)                  */
/* ================================================================ */

test('saglikOku: durum adlarını eşler, bilinmeyeni "bilinmiyor" yapar (H-8)', () => {
  const gecici = path.join(os.tmpdir(), `genesis-saglik-test-${process.pid}.jsonl`);
  const satirlar = [
    { url: 'https://a.example/1', durum: 'çalışıyor' },
    { url: 'https://a.example/2', durum: 'ok' },
    { url: 'https://a.example/3', durum: 'ölü' },
    { url: 'https://a.example/4', durum: 'engellendi' },
    { url: 'https://a.example/5', durum: 'belirsiz' },
    { url: 'https://a.example/6', durum: 'saçmalık' },
  ];
  fs.writeFileSync(gecici, satirlar.map((k) => JSON.stringify(k)).join('\n') + '\n', 'utf8');
  try {
    const harita = saglikOku([gecici]);
    assert.equal(harita.size, 6);
    assert.equal(harita.get('https://a.example/1').durum, DURUM.OK, '"çalışıyor" → ok olmalı');
    assert.equal(harita.get('https://a.example/2').durum, DURUM.OK);
    assert.equal(harita.get('https://a.example/3').durum, DURUM.OLU);
    assert.equal(harita.get('https://a.example/4').durum, DURUM.ENGELLI);
    assert.equal(harita.get('https://a.example/5').durum, DURUM.BELIRSIZ);
    assert.equal(harita.get('https://a.example/6').durum, DURUM.BILINMIYOR);
    // host alanı yoksa URL'den türetilir
    assert.equal(harita.get('https://a.example/1').host, 'a.example');
  } finally {
    fs.rmSync(gecici, { force: true });
  }
});
