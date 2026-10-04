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

/** AniList kapak kökü: yalnız `/cover/large/` biçimi kabul edilir (460×662). */
export const ANILIST_KAPAK_ONEK = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/';

/** AniList büyük kapağının gerçek genişliği (ölçüldü: bx5 460×662, bx6 460×690). */
export const POSTER_XL_GENISLIK = 460;

/**
 * Kart posteri `srcSet`i. Adaylar ve **neden** bunlar:
 *
 *   178w  MAL `/r/178x254/` — 1× ekran (10–15 KB; bugünkü davranış, bayt aynı)
 *   225w  MAL `/r/225x319/` — MAL'ın gerçek kaynağı (225×320); tavan
 *   460w  AniList `/cover/large/` — yüksek yoğunluk (2×/3× telefon, retina masaüstü)
 *
 * Eskiden 356w adayı vardı: MAL CDN'i 225 px kaynağı **büyütüp** veriyordu
 * (31–38 KB, bulanık). Ölçüm 04.10: `/r/356x508/` = bulanık büyütme; telefonlar
 * bu yüzden hem yavaş hem bulanık kapak görüyordu. Büyütme adayı kaldırıldı;
 * yüksek yoğunluk artık AniList'in gerçek 460 px kaynağından karşılanıyor
 * (`p2` alanı, `tools/poster-xl.mjs` üretir). 1× ekranlar hiç etkilenmez.
 */
export function posterSrcSet(poster: string | null, buyuk?: string | null): string | null {
  const adaylar: string[] = [];
  if (poster && poster.startsWith(MAL_ONEK)) {
    adaylar.push(`${malOlcek(poster, 178, 254)} 178w`);
    adaylar.push(`${malOlcek(poster, 225, 319)} 225w`);
  }
  if (buyuk && buyuk.startsWith(ANILIST_KAPAK_ONEK)) adaylar.push(`${buyuk} ${POSTER_XL_GENISLIK}w`);
  return adaylar.length ? adaylar.join(', ') : null;
}

/**
 * Büyük görsel (hero / detay bandı) için `srcSet`: MAL'ın gerçek kaynağı ve
 * varsa AniList'in 460 px kapağı. 178 px adayı burada işe yaramaz (görsel
 * ekran genişliğinde çizilir); tarayıcı 1× ekranda 225'i, 2× ve üstünde 460'ı
 * seçer — eskiden hero mobilde 16:9 afişin ortasından kesilip büyütülüyordu.
 */
export function posterKapakSrcSet(poster: string | null, buyuk?: string | null): string | null {
  const adaylar: string[] = [];
  if (poster && poster.startsWith(MAL_ONEK)) adaylar.push(`${malOlcek(poster, 225, 319)} 225w`);
  if (buyuk && buyuk.startsWith(ANILIST_KAPAK_ONEK)) adaylar.push(`${buyuk} ${POSTER_XL_GENISLIK}w`);
  return adaylar.length ? adaylar.join(', ') : null;
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