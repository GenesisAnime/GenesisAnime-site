/**
 * tmdb.mjs — TMDB (The Movie Database) yardımcılarının SAF kısmı
 * =============================================================
 * Neden TMDB? Ölçüm (01.10.2026): AniList banner'ları **1900 px**de tavanlanıyor
 * (21 örneğin en genişi 1900; CDN'de `large`/`original` varyantı 404, `?w=`
 * yok sayılıyor). Hero 74vh'lik bir bant olduğu için 4K ekranda ~3840 px
 * isteniyor, yani AniList görseli 2× büyütülüyor. TMDB backdrop'ları 16:9 ve
 * `original` boyutta çoğu kez 3840×2160 → gerçek 4K kaynağı.
 *
 * Eşleme anahtarsız yapılır: banner URL'i AniList kimliğini taşır, `anime-list`
 * (Fribb) veri kümesi `anilist_id → themoviedb_id` eşlemesini verir.
 * Ölçüm: banner'lı 4.075 animenin 3.726'sında (%91,4) TMDB kimliği var.
 *
 * KIRPIM UYARISI: TMDB görselleri 16:9; sitemizdeki bantlar çok daha geniş
 * (hero ~2,4:1 · anime sayfası bandı ~7,8:1). Bu yüzden görselin **dikey
 * kırpımı** değişir: `kirpimOrani` bunu ölçülebilir hâle getirir.
 */

/**
 * AniList CDN şemaları (hepsi ölçüldü):
 *   banner/177879-hash.jpg · banner/n6682-hash.jpg · banner/13859.jpg
 *   cover/large/bx1-hash.png · cover/extraLarge/bx1-hash.png
 * Önek (`n` eski şema, `bx` anime kapağı) kimliğin parçası değildir.
 */
export function anilistKimligiCikar(url) {
  const tam = String(url || '').match(/anilistcdn\/media\/anime\/(?:banner|cover)\/(?:[a-z]+\/)?(?:bx|b|n)?(\d+)/i);
  if (tam) return Number(tam[1]);
  const sade = String(url || '').match(/\/banner\/(?:n)?(\d+)/); // host değişse bile şema aynı
  return sade ? Number(sade[1]) : null;
}

/**
 * `anime-list` kaydından TMDB kimliği seçer.
 * Alan iki biçimde gelir: `{ tv: 26209 }` · `{ movie: 123 }` · bazı kayıtlarda düz sayı.
 * Dizi kaydı varsa o tercih edilir (animelerin çoğunluğu dizi).
 */
export function tmdbIdSec(kayit) {
  const t = kayit && kayit.themoviedb_id;
  if (!t) return null;
  if (typeof t === 'number') return { tip: 'tv', id: t };
  const tv = Number(t.tv);
  const film = Number(t.movie);
  if (Number.isFinite(tv) && tv > 0) return { tip: 'tv', id: tv };
  if (Number.isFinite(film) && film > 0) return { tip: 'movie', id: film };
  return null;
}

/** TMDB görsel CDN adresi. Boyutlar: w300 · w780 · w1280 · original */
export function backdropUrl(dosyaYolu, boyut = 'original') {
  if (!dosyaYolu) return null;
  return `https://image.tmdb.org/t/p/${boyut}${String(dosyaYolu).startsWith('/') ? '' : '/'}${dosyaYolu}`;
}

/**
 * `/images` yanıtından kullanılacak backdrop'u seçer.
 * Kural: en geniş görsel kazanır (4K tercihi), eşitlikte TMDB oyu yüksek olan.
 * `enAzGenislik` altındaki görseller yine de aday olur ama `yeterli:false` işaretlenir
 * — çağıran taraf (veri hattı) böylece "TMDB var ama 4K yok" diyebilir.
 */
export function enIyiBackdrop(images, { enAzGenislik = 3000 } = {}) {
  const list = (images || []).filter((g) => g && g.file_path && Number(g.width) > 0);
  if (!list.length) return null;
  const sirali = [...list].sort(
    (a, b) => Number(b.width) - Number(a.width) || Number(b.vote_average || 0) - Number(a.vote_average || 0)
  );
  const secilen = sirali[0];
  return {
    yol: secilen.file_path,
    genislik: Number(secilen.width),
    yukseklik: Number(secilen.height),
    yeterli: Number(secilen.width) >= enAzGenislik,
  };
}

/**
 * Hedef bantta kaynağın dikey olarak ne kadarının kaldığı (0–1).
 * Örn. 16:9 (1,78) kaynak, 7,8:1 bantta → 0,23: görselin yalnızca %23'ü görünür.
 * Karar verirken "kırpım ne kadar agresif?" sorusunu sayıya çevirir.
 */
export function kirpimOrani(kaynakOran, hedefOran) {
  if (!(kaynakOran > 0) || !(hedefOran > 0)) return 0;
  return Math.min(1, kaynakOran / hedefOran);
}

/**
 * TMDB anahtarının kullanım biçimi.
 *   v3 "API Key": 32 karakter hex → `?api_key=...` sorgu parametresi
 *   v4 "API Read Access Token": uzun JWT (`eyJ…`) → `Authorization: Bearer` başlığı
 * Anahtar yoksa null döner: çağıran taraf kullanıcıya ne yapacağını söyler.
 */
export function anahtarYontemi(anahtar) {
  const a = String(anahtar || '').trim();
  if (!a) return null;
  if (/^eyJ[A-Za-z0-9._-]+$/.test(a) || a.length > 64) return 'baslik';
  return 'param';
}

/** Bant yüksekliği verildiğinde hedef oran (ör. 1480 px genişlik / 190 px yükseklik). */
export function bantOrani(genislik, yukseklik) {
  if (!(genislik > 0) || !(yukseklik > 0)) return 0;
  return genislik / yukseklik;
}
