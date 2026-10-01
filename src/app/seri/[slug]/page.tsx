import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Kart from '@/components/Kart';
import { serilerOku } from '@/lib/veri';
import { sayiBicim } from '@/lib/bicim';

export const dynamicParams = false;

export function generateStaticParams() {
  return serilerOku().seriler.map((s) => ({ slug: s.s }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const seri = serilerOku().seriler.find((s) => s.s === slug);
  if (!seri) return { title: 'Bulunamadı' };
  const yillar = seri.uyeler.map((u) => u.yil).filter((y): y is number => typeof y === 'number');
  const aralik = yillar.length ? `${Math.min(...yillar)}–${Math.max(...yillar)}` : '';
  return {
    title: `${seri.ad} serisi — tüm yapımlar`,
    description:
      `${seri.ad} serisinin arşivdeki ${seri.uyeler.length} yapımı${aralik ? ` (${aralik})` : ''} ` +
      'kronolojik sırayla. Kaynakların çalışma durumu doğrulanmış rozetiyle gösterilir.',
    alternates: { canonical: `/seri/${seri.s}/` },
  };
}

export default async function SeriSayfasi({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const seri = serilerOku().seriler.find((s) => s.s === slug);
  if (!seri) notFound();

  return (
    <div className="kap" style={{ paddingTop: 26 }}>
      <nav className="kirinti" aria-label="Sayfa yolu">
        <Link href="/">Ana Sayfa</Link>
        <span>/</span>
        <Link href="/seriler/">Seriler</Link>
        <span>/</span>
        <span>{seri.ad}</span>
      </nav>

      <div className="sayfa-basi">
        <h1>{seri.ad} serisi</h1>
        <p>
          Bu seride arşivde <b>{sayiBicim(seri.uyeler.length)}</b> yapım var; aşağıda kronolojik
          sırayla listeleniyor. İlişki türleri (devamı, öncesi, yan hikâye) yapım sayfalarındaki
          “Sezonlar ve bağlantılı yapımlar” bölümünde görünür.
        </p>
      </div>

      <div className="izgara">
        {seri.uyeler.map((u) => (
          <Kart
            key={u.s}
            slug={u.s}
            ad={u.ad}
            poster={u.p}
            yil={u.yil}
            puan={null}
            format={null}
            altBilgi={u.yil ? String(u.yil) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
