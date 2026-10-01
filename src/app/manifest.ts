import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export const dynamic = 'force-static';

/**
 * manifest.ts — PWA bildirgesi (statik dışa aktarımla uyumlu)
 *
 * İkon URL'leri BASE_PATH'e göre ön ek alır: GitHub Pages alt dizininde
 * (/GenesisAnime) de doğru çalışsın.
 */
export default function manifest(): MetadataRoute.Manifest {
  const taban = process.env.BASE_PATH || '';
  return {
    name: `${SITE.ad} — Türkçe anime izleme arşivi`,
    short_name: SITE.kisaAd,
    description: SITE.aciklama,
    lang: 'tr',
    start_url: `${taban}/`,
    scope: `${taban}/`,
    display: 'standalone',
    background_color: '#08060d',
    theme_color: '#08060d',
    icons: [
      { src: `${taban}/ikon/ikon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${taban}/ikon/ikon-512.png`, sizes: '512x512', type: 'image/png' },
      {
        src: `${taban}/ikon/ikon-maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
