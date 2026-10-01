import { Suspense } from 'react';
import type { Metadata } from 'next';
import IzleIstemci from '@/components/IzleIstemci';

export const metadata: Metadata = {
  title: 'İzle',
  // Bölüm sayfaları tek statik kabuktan üretilir; arama motorlarına ince içerik
  // olarak görünmemesi için indekslenmez. Anime detay sayfaları indekslenir.
  robots: { index: false, follow: true },
};

export default function IzleSayfasi() {
  return (
    <Suspense
      fallback={
        <div className="kap" style={{ paddingTop: 40 }}>
          <div className="iskelet" style={{ height: 420, borderRadius: 14 }} />
        </div>
      }
    >
      <IzleIstemci />
    </Suspense>
  );
}
