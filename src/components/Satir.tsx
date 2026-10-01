'use client';
/**
 * Satir.tsx — Netflix tarzı yatay kaydırma satırı
 * Oklarla kaydırma, klavye ile erişim, mobilde dokunarak kaydırma.
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SagIkon, SolIkon } from './Ikon';

interface Props {
  baslik: string;
  tumuHref?: string;
  tumuMetni?: string;
  children: ReactNode;
}

export default function Satir({ baslik, tumuHref, tumuMetni = 'Tümünü gör', children }: Props) {
  const kapRef = useRef<HTMLDivElement>(null);
  const [solVar, setSolVar] = useState(false);
  const [sagVar, setSagVar] = useState(false);

  const guncelle = useCallback(() => {
    const el = kapRef.current;
    if (!el) return;
    setSolVar(el.scrollLeft > 8);
    setSagVar(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    guncelle();
    const el = kapRef.current;
    if (!el) return;
    el.addEventListener('scroll', guncelle, { passive: true });
    window.addEventListener('resize', guncelle);
    return () => {
      el.removeEventListener('scroll', guncelle);
      window.removeEventListener('resize', guncelle);
    };
  }, [guncelle]);

  const kaydir = (yon: 1 | -1) => {
    const el = kapRef.current;
    if (!el) return;
    el.scrollBy({ left: yon * Math.max(320, el.clientWidth * 0.82), behavior: 'smooth' });
  };

  return (
    <section className="satir" aria-label={baslik}>
      <div className="satir-basi">
        <h2 className="satir-baslik">{baslik}</h2>
        {tumuHref ? (
          <Link className="satir-tumu" href={tumuHref}>
            {tumuMetni} →
          </Link>
        ) : null}
      </div>

      {solVar ? (
        <button className="satir-ok sol" onClick={() => kaydir(-1)} aria-label={`${baslik} satırında sola kaydır`}>
          <SolIkon />
        </button>
      ) : null}

      <div className="satir-kaydirma" ref={kapRef}>
        {children}
      </div>

      {sagVar ? (
        <button className="satir-ok sag" onClick={() => kaydir(1)} aria-label={`${baslik} satırında sağa kaydır`}>
          <SagIkon />
        </button>
      ) : null}
    </section>
  );
}
