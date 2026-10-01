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
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  anahtarYontemi,
  anilistKimligiCikar,
  backdropUrl,
  bantOrani,
  enIyiBackdrop,
  kirpimOrani,
  tmdbIdSec,
} from '../lib/tmdb.mjs';

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

test('anahtarYontemi: v3 anahtarı ile v4 token ayrılır', () => {
  assert.equal(anahtarYontemi('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'), 'param', '32 karakter hex → api_key');
  assert.equal(anahtarYontemi('eyJhbGciOiJIUzI1NiJ9.abc.def'), 'baslik', 'v4 JWT → Bearer başlığı');
  assert.equal(anahtarYontemi('  '), null);
  assert.equal(anahtarYontemi(''), null);
  assert.equal(anahtarYontemi(null), null);
});

test('bantOrani: sitedeki iki gerçek bandı ölçer', () => {
  assert.ok(Math.abs(bantOrani(1480, 190) - 7.789) < 0.01, 'anime sayfası banner bandı');
  assert.ok(Math.abs(bantOrani(1440, 666) - 2.162) < 0.01, 'hero bandı (1440×900 ekran)');
  assert.equal(bantOrani(0, 190), 0);
});
