import { Suspense } from 'react';
import type { Metadata } from 'next';
import KesfetIstemci from '@/components/KesfetIstemci';
import { taksonomiOku } from '@/lib/veri';

export const metadata: Metadata = {
  title: 'Keşfet — tüm anime kataloğu',
  description:
    'Tür, yıl, format ve duruma göre filtrele; puan, bölüm sayısı veya eklenme sırasına göre sırala.',
  alternates: { canonical: '/kesfet/' },
};

export default function KesfetSayfasi() {
  const taksonomi = taksonomiOku();
  return (
    <Suspense
      fallback={
        <div className="kap" style={{ paddingTop: 40 }}>
          <div className="iskelet" style={{ height: 40, width: 240, marginBottom: 20 }} />
          <div className="izgara">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="iskelet" style={{ aspectRatio: '2 / 3' }} />
            ))}
          </div>
        </div>
      }
    >
      <KesfetIstemci taksonomi={taksonomi} />
    </Suspense>
  );
}
