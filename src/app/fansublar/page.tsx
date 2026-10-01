import type { Metadata } from 'next';
import FansubIstemci from '@/components/FansubIstemci';
import { kunyeOku, taksonomiOku } from '@/lib/veri';

export const metadata: Metadata = {
  title: 'Fansub grupları',
  description:
    'Arşivdeki tüm fansub grupları, katkı verdikleri bölüm sayıları ve yapımlar. Çevirmen ve redaktör bilgileri bölüm bazında.',
  alternates: { canonical: '/fansublar/' },
};

export default function FansublarSayfasi() {
  const taksonomi = taksonomiOku();
  const kunye = kunyeOku();
  return <FansubIstemci taksonomi={taksonomi} kunye={kunye} />;
}
