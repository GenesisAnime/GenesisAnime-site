import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  const kok = SITE.url.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // İnce/tekrarlı içerik: oynatıcı ve arama sayfaları indekslenmez.
        disallow: ['/izle/', '/ara/', '/listem/', '/yonetim/'],
      },
    ],
    sitemap: `${kok}/sitemap.xml`,
    host: kok,
  };
}
