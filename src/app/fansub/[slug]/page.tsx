import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Kart from '@/components/Kart';
import { fansublarDosyaOku, katalogOku } from '@/lib/veri';
import { sayiBicim } from '@/lib/bicim';
import { KOLON } from '@/lib/veri';

export const dynamicParams = false;

export function generateStaticParams() {
  return fansublarDosyaOku().gruplar.map((g) => ({ slug: g.s }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const grup = fansublarDosyaOku().gruplar.find((g) => g.s === slug);
  if (!grup) return { title: 'Bulunamadı' };
  return {
    title: `${grup.ad} — fansub grubu`,
    description:
      `${grup.ad} grubunun arşivdeki katkısı: ${sayiBicim(grup.anime.length)} yapım, ` +
      `${sayiBicim(grup.bolum)} bölüm. Çevirmen ve redaktör bilgileri bölüm bazında kayıtlı.`,
    alternates: { canonical: `/fansub/${grup.s}/` },
  };
}

export default async function FansubSayfasi({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const grup = fansublarDosyaOku().gruplar.find((g) => g.s === slug);
  if (!grup) notFound();

  const kume = new Set(grup.anime);
  const kartlar = katalogOku()
    .anime.filter((s) => kume.has(s[KOLON.slug]))
    .map((s) => ({
      slug: s[KOLON.slug],
      ad: s[KOLON.ad],
      poster: s[KOLON.poster],
      yil: s[KOLON.yil],
      puan: s[KOLON.puan],
      format: s[KOLON.format],
      bolumSayisi: s[KOLON.bolumSayisi],
      kaynakSayisi: s[KOLON.kaynakSayisi],
    }));

  return (
    <div className="kap" style={{ paddingTop: 26 }}>
      <nav className="kirinti" aria-label="Sayfa yolu">
        <Link href="/">Ana Sayfa</Link>
        <span>/</span>
        <Link href="/fansublar/">Fansublar</Link>
        <span>/</span>
        <span>{grup.ad}</span>
      </nav>

      <div className="sayfa-basi">
        <h1>{grup.ad}</h1>
        <p>
          Bu grubun arşivdeki katkısı: <b>{sayiBicim(grup.anime.length)}</b> yapım,{' '}
          <b>{sayiBicim(grup.bolum)}</b> bölüm. Bölüm bazında çevirmen, redaktör ve encode
          bilgileri oynatıcı sayfasında görünür.
        </p>
      </div>

      {kartlar.length > 0 ? (
        <div className="izgara">
          {kartlar.map((k) => (
            <Kart key={k.slug} {...k} />
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--tx2)' }}>
          Bu grubun yapımları katalogda bulunamadı.{' '}
          <Link href="/kesfet/" style={{ color: 'var(--ac2)' }}>
            Kataloğa göz at
          </Link>
        </p>
      )}
    </div>
  );
}
