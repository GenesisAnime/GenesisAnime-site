/**
 * yollar.ts — alt dizin (basePath) uyumlu yol yardımcıları
 *
 * GitHub Pages proje siteleri `https://kullanici.github.io/GenesisAnime/` gibi bir
 * alt dizinde yayınlanır. Next.js kendi ürettiği bağlantı/varlık yollarına basePath
 * ekler, ancak `public/` altındaki ham dosyalara yapılan `fetch` çağrılarına eklemez.
 * Bu yardımcılar o boşluğu kapatır.
 */
export const TABAN = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function genelYol(yol: string): string {
  const temiz = yol.startsWith('/') ? yol : `/${yol}`;
  return `${TABAN}${temiz}`;
}

export function animeVeriYolu(slug: string): string {
  return genelYol(`/data/anime/${encodeURIComponent(slug)}.json`);
}
