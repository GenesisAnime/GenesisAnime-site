/**
 * tmdb.test.mjs — TMDB eşleme/kırpım yardımcılarının saf mantığı
 * ==============================================================
 * Kapsam: `tools/lib/tmdb.mjs`. Ağ yok, dosya yok.
 *
 * Neyi korur?
 *   · AniList kimliği üç URL şemasından da çıkar (hash'li, `n` önekli, hashessiz)
 *   · TMDB alanı dizi/film ayrımıyla doğru okunur; bozuk alan "eşleşme yok" sayılır
 *   · Backdrop seçimi en geniş görseli alır, 4K eşiğinin altını `yeterli:false` işaretler
 *   · Kırpım matematiği: 16:9 kaynağın dar bantlarda ne kadarının kaldığı ölçülür
 *     (bu, "4K'ya geçince görsel değişir" kararının sayısal gerekçesidir)
 *   · Anime detay bandının ölçüsü `globals.css`'ten okunur: CSS değişip kırpım
 *     politikası bozulursa test kırmızıya döner (ölçü sessizce kaymaz)
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from '../lib/ortak.mjs';

import {
  anahtarYontemi,
  anilistKimligiCikar,
  aramaEslesmesi,
  backdropUrl,
  bantOrani,
  baslikBenzerligi,
  baslikNormalize,
  enIyiBackdrop,
  formatTip,
  kirpimOrani,
  tmdbIdSec,
} from '../lib/tmdb.mjs';

const CSS = fs.readFileSync(path.join(ROOT, 'src', 'app', 'globals.css'), 'utf8');

/** globals.css'ten tek bir ölçü okur; kalıp bulunamazsa ölçü testi kırmızıya döner. */
function cssSayi(kalipp, ad) {
  const m = CSS.match(kalipp);
  assert.ok(m, `globals.css: ${ad} okunamadı — ölçü testi güncellenmeli`);
  return Number(m[1]);
}

test('anilistKimligiCikar: üç CDN şemasını da çözer', () => {
  assert.equal(anilistKimligiCikar('https://s4.anilist.co/file/anilistcdn/media/anime/banner/177879-P3fhkRb5ei3R.jpg'), 177879);
  assert.equal(anilistKimligiCikar('https://s4.anilist.co/file/anilistcdn/media/anime/banner/n6682-lTTWYVZiZQWm.jpg'), 6682);
  assert.equal(anilistKimligiCikar('https://s4.anilist.co/file/anilistcdn/media/anime/banner/13859.jpg'), 13859);
  assert.equal(anilistKimligiCikar('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-GCsPm7waJ4kS.png'), 1);
});

test('anilistKimligiCikar: AniList olmayan ve boş girdide null döner', () => {
  assert.equal(anilistKimligiCikar('https://cdn.myanimelist.net/images/anime/1635/148561.jpg'), null);
  assert.equal(anilistKimligiCikar(''), null);
  assert.equal(anilistKimligiCikar(null), null);
  assert.equal(anilistKimligiCikar(undefined), null);
});

test('tmdbIdSec: dizi kaydı tercih edilir', () => {
  assert.deepEqual(tmdbIdSec({ themoviedb_id: { tv: 26209 } }), { tip: 'tv', id: 26209 });
  assert.deepEqual(tmdbIdSec({ themoviedb_id: { movie: 732203 } }), { tip: 'movie', id: 732203 });
  // İkisi de varsa dizi (animelerin çoğunluğu dizi).
  assert.deepEqual(tmdbIdSec({ themoviedb_id: { tv: 1429, movie: 1 } }), { tip: 'tv', id: 1429 });
});

test('tmdbIdSec: bozuk/eksik alanda eşleşme yok sayılır', () => {
  assert.equal(tmdbIdSec({}), null);
  assert.equal(tmdbIdSec({ themoviedb_id: {} }), null);
  assert.equal(tmdbIdSec({ themoviedb_id: { tv: 0, movie: 0 } }), null);
  assert.equal(tmdbIdSec({ themoviedb_id: { tv: null } }), null);
  // Düz sayı biçimi de kabul edilir.
  assert.deepEqual(tmdbIdSec({ themoviedb_id: 456 }), { tip: 'tv', id: 456 });
});

test('backdropUrl: boyut ve eğik çizgi düzeltmesi', () => {
  assert.equal(backdropUrl('/abc123.jpg'), 'https://image.tmdb.org/t/p/original/abc123.jpg');
  assert.equal(backdropUrl('abc123.jpg'), 'https://image.tmdb.org/t/p/original/abc123.jpg');
  assert.equal(backdropUrl('/abc123.jpg', 'w1280'), 'https://image.tmdb.org/t/p/w1280/abc123.jpg');
  assert.equal(backdropUrl(null), null);
});

test('enIyiBackdrop: en geniş görsel kazanır, 4K eşiği işaretlenir', () => {
  const gorseller = [
    { file_path: '/kucuk.jpg', width: 1280, height: 720, vote_average: 9 },
    { file_path: '/dev.jpg', width: 3840, height: 2160, vote_average: 5 },
    { file_path: '/orta.jpg', width: 1920, height: 1080, vote_average: 7 },
  ];
  const secilen = enIyiBackdrop(gorseller);
  assert.equal(secilen.yol, '/dev.jpg');
  assert.equal(secilen.genislik, 3840);
  assert.equal(secilen.yeterli, true);
});

test('enIyiBackdrop: eşit genişlikte oy üstünlüğü, eşiğin altında yeterli:false', () => {
  const secilen = enIyiBackdrop([
    { file_path: '/a.jpg', width: 1920, height: 1080, vote_average: 3 },
    { file_path: '/b.jpg', width: 1920, height: 1080, vote_average: 8 },
  ]);
  assert.equal(secilen.yol, '/b.jpg');
  assert.equal(secilen.yeterli, false, '1920 px 4K eşiğinin altında kalmalı');

  // file_path'i olmayan/boş liste → null
  assert.equal(enIyiBackdrop([{ width: 3840 }]), null);
  assert.equal(enIyiBackdrop([]), null);
  assert.equal(enIyiBackdrop(null), null);
});

test('kirpimOrani: 16:9 kaynak dar bantlarda ne kadar kalıyor', () => {
  // 16:9 görsel, 7,8:1 bant → dikey kırpımın yalnızca ~%23'ü görünür.
  assert.ok(Math.abs(kirpimOrani(16 / 9, bantOrani(1480, 190)) - 0.228) < 0.005);
  // 16:9 görsel, hero (1440×666 = 2,16:1) → %82'si görünür.
  assert.ok(Math.abs(kirpimOrani(16 / 9, bantOrani(1440, 666)) - 0.824) < 0.005);
  // AniList banner'ı (1900×400 = 4,75:1) aynı bantta daha az kayıp verir.
  assert.ok(kirpimOrani(1900 / 400, bantOrani(1480, 190)) > kirpimOrani(16 / 9, bantOrani(1480, 190)));
  // Oran eşitse kırpım yok; kaynak banttan GENİŞSE dikey kayıp olmaz (1'de durur).
  assert.equal(kirpimOrani(2, 2), 1);
  assert.equal(kirpimOrani(3, 1.5), 1);
  // Kaynak banttan darsa dikey kayıp kaçınılmazdır (portre görsel dar bantta yarısını kaybeder).
  assert.equal(kirpimOrani(1.5, 3), 0.5);
  assert.equal(kirpimOrani(0, 3), 0);
  assert.equal(kirpimOrani(2, 0), 0);
});

test('baslikNormalize: diakritik, noktalama ve sezon işaretleri sadeleşir', () => {
  assert.equal(baslikNormalize('Kimi no Na wa.'), 'kimi no na wa');
  assert.equal(baslikNormalize('ÖĞRENCİ İŞLERİ'), 'ogrenci isleri');
  assert.equal(baslikNormalize('Foo Season 2'), 'foo');
  assert.equal(baslikNormalize('Foo Sezon 3'), 'foo');
  assert.equal(baslikNormalize('Foo Part II'), 'foo');
  assert.equal(baslikNormalize('Foo II'), 'foo 2', 'romen rakamı sayıya çevrilir');
  assert.equal(baslikNormalize(''), '');
  assert.equal(baslikNormalize(null), '');
  // Noktalama tek başına başlığı yok etmez: "009-1" sayı kalmalı.
  assert.equal(baslikNormalize('009-1: R&B'), '009 1 r b');
});

test('baslikBenzerligi: birebir, kapsama ve ilgisiz başlıklar', () => {
  assert.equal(baslikBenzerligi('Naruto', 'naruto'), 1);
  assert.equal(baslikBenzerligi('ÖĞRENCİ', 'ogrenci'), 1, 'diakritik farkı eşitliği bozmaz');
  // Kapsama: "X" ile "X: Alt Başlık" — yıl kontrolü olmasa yanlış eşleşme üretebilir,
  // bu yüzden benzerlik 1 değil, 0,9 ağırlıklıdır (karar `aramaEslesmesi`de).
  const kapsama = baslikBenzerligi('Kimi no Na wa', 'Kimi no Na wa: Another Side');
  assert.ok(kapsama >= 0.85 && kapsama < 1, `kapsama beklenen bantta: ${kapsama}`);
  assert.ok(baslikBenzerligi('Naruto', 'Bleach') < 0.5);
  assert.equal(baslikBenzerligi('', 'Naruto'), 0);
  assert.equal(baslikBenzerligi(null, null), 0);
});

test('formatTip: yalnızca MOVIE film sayılır', () => {
  assert.equal(formatTip('MOVIE'), 'movie');
  assert.equal(formatTip('movie'), 'movie');
  assert.equal(formatTip('TV'), 'tv');
  assert.equal(formatTip('OVA'), 'tv');
  assert.equal(formatTip('SPECIAL'), 'tv');
  assert.equal(formatTip(null), 'tv');
});

test('aramaEslesmesi: animasyon olmayan aday asla kabul edilmez', () => {
  const hedef = { adlar: ['Naruto'], yil: 2002, tip: 'tv' };
  const aday = { ad: 'Naruto', ozgunAd: 'Naruto', yil: 2002, tip: 'tv', animasyon: false };
  assert.equal(aramaEslesmesi(aday, hedef).guven, 'yok');
  assert.equal(aramaEslesmesi(aday, hedef).neden, 'animasyon-degil');
});

test('aramaEslesmesi: birebir ad + birebir yıl → tam', () => {
  const hedef = { adlar: ['Kimetsu no Yaiba'], yil: 2019, tip: 'tv' };
  const aday = { ad: 'Demon Slayer: Kimetsu no Yaiba', ozgunAd: 'Kimetsu no Yaiba', yil: 2019, tip: 'tv', animasyon: true };
  const s = aramaEslesmesi(aday, hedef);
  assert.equal(s.guven, 'tam');
  assert.equal(s.puan, 1);
});

test('aramaEslesmesi: yıl kayması ve tip uyuşmazlığı güveni düşürür', () => {
  const hedef = { adlar: ['Somethin'], yil: 2020, tip: 'tv' };
  // Yıl ±1: TMDB ile arşiv sık sık bir yıl kayar → yine kabul, ama 'yakin'.
  assert.equal(aramaEslesmesi({ ad: 'Somethin', yil: 2021, tip: 'tv', animasyon: true }, hedef).guven, 'yakin');
  // Yıl 5 yıl uzak: başlık birebir olsa bile reddedilir (farklı sezon/yapım riski).
  assert.equal(aramaEslesmesi({ ad: 'Somethin', yil: 2025, tip: 'tv', animasyon: true }, hedef).guven, 'yok');
  // Tip uyuşmazlığı (film adayı, dizi aranıyor) birebir adla bile 'tam' olamaz.
  const capraz = aramaEslesmesi({ ad: 'Somethin', yil: 2020, tip: 'movie', animasyon: true }, hedef);
  assert.equal(capraz.guven, 'yakin');
  // Benzer ama farklı ad + farklı yıl → red.
  assert.equal(aramaEslesmesi({ ad: 'Something Else', yil: 1998, tip: 'tv', animasyon: true }, hedef).guven, 'yok');
});

test('anahtarYontemi: v3 anahtarı ile v4 token ayrılır', () => {
  assert.equal(anahtarYontemi('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'), 'param', '32 karakter hex → api_key');
  assert.equal(anahtarYontemi('eyJhbGciOiJIUzI1NiJ9.abc.def'), 'baslik', 'v4 JWT → Bearer başlığı');
  assert.equal(anahtarYontemi('  '), null);
  assert.equal(anahtarYontemi(''), null);
  assert.equal(anahtarYontemi(null), null);
});

test('bantOrani: hero bandı ve eski anime bandı bilinen ölçüleri verir', () => {
  assert.ok(Math.abs(bantOrani(1440, 666) - 2.162) < 0.01, 'hero bandı (1440×900 ekran)');
  // 1480×190 = 7,79:1 — 02.10'a kadarki anime bandı; gerileme karşılaştırmasının tabanı.
  assert.ok(Math.abs(bantOrani(1480, 190) - 7.789) < 0.01, 'eski anime bandı');
  assert.equal(bantOrani(0, 190), 0);
});

test('anime detay bandı: 16:9 kaynağın yarısından çoğu görünür (ölçü CSS ile uyumlu)', () => {
  // Ölçüler doğrudan globals.css'ten okunur: bant yüksekliği ya da ızgara
  // değişirse bu test kırpım politikasını yeniden değerlendirir.
  const kapGenislik = cssSayi(/\.kap\s*\{[^}]*max-width:\s*(\d+)px/, '.kap max-width');
  const kapBosluk = cssSayi(/\.kap\s*\{[^}]*padding:\s*0 (\d+)px/, '.kap yan boşluğu');
  const afisKolon = cssSayi(/\.bilgi-izgara\s*\{[^}]*grid-template-columns:\s*(\d+)px/, 'afiş kolonu');
  const izgaraBosluk = cssSayi(/\.bilgi-izgara\s*\{[^}]*gap:\s*(\d+)px/, 'ızgara boşluğu');
  const bantMin = cssSayi(/\.anime-bant\s*\{[^}]*height:\s*clamp\((\d+)px/, 'bant alt sınırı');
  const bantMax = cssSayi(
    /\.anime-bant\s*\{[^}]*height:\s*clamp\(\d+px,\s*[\d.]+vw,\s*(\d+)px\)/,
    'bant üst sınırı'
  );

  // Bant, sağ kolonun gerçek genişliği kadardır (afiş + ızgara boşluğu düşülür).
  const bantGenislik = kapGenislik - 2 * kapBosluk - afisKolon - izgaraBosluk;
  const kalan = kirpimOrani(16 / 9, bantOrani(bantGenislik, bantMax));
  assert.ok(kalan >= 0.5, `16:9 kaynağın yalnızca %${Math.round(kalan * 100)}'i görünüyor (≥%50 beklenir)`);

  const eski = kirpimOrani(16 / 9, bantOrani(bantGenislik, 190));
  assert.ok(
    kalan > eski,
    `yeni bant eski 190 px ölçüsünden iyi olmalı (%${Math.round(kalan * 100)} vs %${Math.round(eski * 100)})`
  );
  assert.ok(bantMin > 0 && bantMin <= bantMax, 'clamp alt sınırı geçerli olmalı');
});
