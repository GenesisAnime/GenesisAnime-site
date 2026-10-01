'use client';
/** AnimeEylemler.tsx — detay sayfasının etkileşimli düğmeleri */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ilerlemeAl, listede, listeDegistir } from '@/lib/depo/yerel';
import { useBaglandi } from '@/lib/depo/kanca';
import { ArtiIkon, OynatIkon, TikIkon } from './Ikon';

interface Props {
  slug: string;
  ad: string;
  poster: string | null;
  yil: number | null;
  bolumSayisi: number;
}

export default function AnimeEylemler({ slug, ad, poster, yil, bolumSayisi }: Props) {
  const baglandi = useBaglandi();
  const [listedemi, setListedemi] = useState(false);
  const [devam, setDevam] = useState<{ bolum: number; ad: string } | null>(null);

  useEffect(() => {
    if (!baglandi) return;
    const guncelle = () => {
      setListedemi(listede(slug));
      const kayit = ilerlemeAl(slug);
      setDevam(kayit ? { bolum: kayit.bolum, ad: kayit.bolumAdi } : null);
    };
    guncelle();
  }, [baglandi, slug]);

  return (
    <div className="hero-dugmeler">
      {devam && bolumSayisi > 0 ? (
        <Link className="dugme dugme-birincil" href={`/izle/?a=${encodeURIComponent(slug)}&b=${devam.bolum}`}>
          <OynatIkon /> {devam.ad || `${devam.bolum}. bölüm`} — devam et
        </Link>
      ) : null}

      <Link
        className={`dugme ${devam ? 'dugme-ikincil' : 'dugme-birincil'}`}
        href={`/izle/?a=${encodeURIComponent(slug)}&b=1`}
      >
        <OynatIkon /> 1. bölümden başla
      </Link>

      <button
        className={`dugme dugme-ikincil${listedemi ? ' etkin' : ''}`}
        aria-pressed={listedemi}
        onClick={() => listeDegistir({ slug, ad, poster, yil, zaman: Date.now() })}
      >
        {listedemi ? <TikIkon /> : <ArtiIkon />}
        {listedemi ? 'Listemde' : 'Listeme ekle'}
      </button>
    </div>
  );
}
