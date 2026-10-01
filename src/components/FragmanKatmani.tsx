'use client';
/**
 * FragmanKatmani.tsx — tıkla-yükle fragman katmanı
 *
 * YouTube ancak kullanıcı istediğinde yüklenir (gizlilik + performans):
 * hover'da üçüncü taraf istek yapılmaz, `youtube-nocookie` alan adı kullanılır.
 * Escape veya arka plana tıklama kapatır; açıkken gövde kaydırması kilitlenir.
 */
import { useEffect, useRef } from 'react';
import { KapatIkon } from './Ikon';

interface Props {
  kimlik: string;
  ad: string;
  kapat: () => void;
}

export default function FragmanKatmani({ kimlik, ad, kapat }: Props) {
  const kutu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') kapat();
    };
    window.addEventListener('keydown', tus);
    const onceki = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    kutu.current?.focus();
    return () => {
      window.removeEventListener('keydown', tus);
      document.body.style.overflow = onceki;
    };
  }, [kapat]);

  return (
    <div
      className="katman"
      role="dialog"
      aria-modal="true"
      aria-label={`${ad} fragmanı`}
      onClick={(e) => {
        if (e.target === e.currentTarget) kapat();
      }}
    >
      <div className="katman-kutu" ref={kutu} tabIndex={-1}>
        <div className="katman-basi">
          <b>{ad} — fragman</b>
          <button className="dugme dugme-sade" onClick={kapat}>
            <KapatIkon boyut={15} /> Kapat
          </button>
        </div>
        <div className="oynatici-kutu">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${kimlik}?autoplay=1&rel=0`}
            title={`${ad} fragmanı`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          />
        </div>
      </div>
    </div>
  );
}
