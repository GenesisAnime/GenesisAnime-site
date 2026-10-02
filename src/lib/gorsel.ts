/**
 * gorsel.ts — görsel adres yardımcıları (TMDB 4K backdrop)
 * =======================================================
 * Neden var? AniList banner CDN'i 1900 px'de tavanlanıyor; geniş ekranda hero ve
 * anime detay bandı bu yüzden bulanık kalıyordu. TMDB backdrop'ları veri hattında
 * `original` (≥3000 px) biçiminde saklanır, ama 3840 px'lik dosyayı her cihaza
 * indirmek israftır: aşağıdaki `srcSet` küçük varyantı aday gösterir ve seçimi
 * tarayıcıya bırakır (mobil `w1280`i, retina masaüstü `original`ı seçer).
 */

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
