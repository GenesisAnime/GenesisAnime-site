import type { MetadataRoute } from 'next';
import { fansublarDosyaOku, kunyeOku, serilerOku, tumSluglar } from '@/lib/veri';
import { SITE } from '@/lib/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const kok = SITE.url.replace(/\/$/, '');
  const uretim = new Date(kunyeOku().uretim);

  const sabitler: MetadataRoute.Sitemap = [
    { url: `${kok}/`, lastModified: uretim, changeFrequency: 'daily', priority: 1 },
    { url: `${kok}/kesfet/`, lastModified: uretim, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${kok}/seriler/`, lastModified: uretim, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${kok}/fansublar/`, lastModified: uretim, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${kok}/kunye/`, lastModified: uretim, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${kok}/api-dokumani/`, lastModified: uretim, changeFrequency: 'monthly', priority: 0.4 },
  ];

  const animeler: MetadataRoute.Sitemap = tumSluglar().map((slug) => ({
    url: `${kok}/anime/${slug}/`,
    lastModified: uretim,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  const serilerSayfa: MetadataRoute.Sitemap = serilerOku().seriler.map((s) => ({
    url: `${kok}/seri/${s.s}/`,
    lastModified: uretim,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  const fansublarSayfa: MetadataRoute.Sitemap = fansublarDosyaOku().gruplar.map((g) => ({
    url: `${kok}/fansub/${g.s}/`,
    lastModified: uretim,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  return [...sabitler, ...animeler, ...serilerSayfa, ...fansublarSayfa];
}
