import { Suspense } from 'react';
import type { Metadata } from 'next';
import AraIstemci from '@/components/AraIstemci';

export const metadata: Metadata = {
  title: 'Arama',
  description: 'Anime adı, eş adı ve orijinal adına göre arşivde arama yap.',
  robots: { index: false, follow: true },
};

export default function AraSayfasi() {
  return (
    <Suspense
      fallback={
        <div className="kap" style={{ paddingTop: 40 }}>
          <div className="iskelet" style={{ height: 44, marginBottom: 24 }} />
          <div className="izgara">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="iskelet" style={{ aspectRatio: '2 / 3' }} />
            ))}
          </div>
        </div>
      }
    >
      <AraIstemci />
    </Suspense>
  );
}
