/**
 * gorsel.ts — görsel adres yardımcıları
 * =====================================
 * İki iş yapar:
 *
 * 1) **Poster ölçekleme.** Kartlar 142–178 px genişliğindedir ama arşivdeki
 *    AniList/MAL posterleri 225×319'dur ve ~45 KB ortalamayla iner; ana sayfada
 *    540 kart birlikte açıldığında tek başına ~24 MB'lık görsel yükü oluşur ve
 *    mobil GPU/kod çözme tarafı şişer. MyAnimeList CDN'i `/r/<GxY>/images/...`
 *    yolunda gerçek küçültme sunar; aşağıdaki yardımcılar kart için doğru
 *    varyantı seçer (`srcSet` + `sizes`). Küçültülemeyen kaynaklar (Kitsu,
 *    Simkl, ANN) olduğu gibi kalır.
 *
 * 2) **TMDB 4K backdrop.** AniList banner CDN'i 1900 px'de tavanlanıyor; geniş
 *    ekranda hero ve anime detay bandı bu yüzden bulanık kalıyordu. TMDB
 *    backdrop'ları veri hattında `original` (≥3000 px) biçiminde saklanır, ama
 *    3840 px'lik dosyayı her cihaza indirmek israftır: `srcSet` küçük varyantı
 *    aday gösterir ve seçimi tarayıcıya bırakır (mobil `w1280`i, retina
 *    masaüstü `original`ı seçer).
 */

/** MyAnimeList poster kökü: `/images/anime/...` (ölçekleme bu kökün önüne girer). */
const MAL_ONEK = 'https://cdn.myanimelist.net/images/';

/**
 * Kart görselinin `sizes` bildirimi. Medya koşulu **şart**: çıplak uzunluk
 * listesi (`"142px, 178px"`) geçersiz sayılır ve tarayıcı son değeri (178px)
 * uygular — mobilde büyük varyant inerdi (canlı sayfada ölçüldü: 340×481).
 * Koşullu biçimde mobil 142px'i (globals.css @media 860px), üstü 178px'i alır.
 */
export const POSTER_SIZES = '(max-width: 860px) 142px, 178px';

/**
 * MyAnimeList posterini istenen ölçüye çevirir. `/images/...` biçimindeki
 * adresleri `/r/<GxY>/images/...` yapar; başka kaynaklar (Kitsu, Simkl, ANN)
 * ve zaten ölçeklenmiş adresler olduğu gibi döner.
 *
 * Not: CDN küçültmede ölçüyü yuvarlar (178×254 isteği 225×319 kaynağından
 * ~17 KB iner — 9.762 poster tarandı; küçültülemeyen adres bulunamadı).
 */
export function malOlcek(url: string, genislik: number, yukseklik: number): string {
  if (!url.startsWith(MAL_ONEK)) return url;
  return `https://cdn.myanimelist.net/r/${genislik}x${yukseklik}/images/${url.slice(MAL_ONEK.length)}`;
}

/** İstenen ölçekte varyant varsa srcSet üretir; yoksa null (src yalnız kalır). */
export function posterSrcSet(poster: string | null): string | null {
  if (!poster || !poster.startsWith(MAL_ONEK)) return null;
  return `${malOlcek(poster, 178, 254)} 178w, ${malOlcek(poster, 356, 508)} 356w, ${poster} 225w`;
}

/** TMDB `original` adresinin 1280 px varyantı (ölçek adayı). */
export function tmdbKucuk(url: string): string {
  return url.replace('/t/p/original/', '/t/p/w1280/');
}

/**
 * 4K backdrop için `srcSet`: küçük varyant + kaynağın **gerçek** genişliği.
 * Genişlik bilinmiyorsa 3840 varsayılır (ölçülen en geniş TMDB backdrop'u);
 * yanlış bildirilen genişlik yalnızca birkaç KB'lık seçim farkı yaratır, çünkü
 * iki adayın ikisi de aynı görselin farklı boyutudur.
 */
export function backdropSrcSet(url: string, genislik: number | null): string {
  return `${tmdbKucuk(url)} 1280w, ${url} ${genislik ?? 3840}w`;
}