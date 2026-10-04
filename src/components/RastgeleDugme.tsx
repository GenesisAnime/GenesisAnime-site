'use client';
/**
 * RastgeleDugme.tsx — "Şansıma ne çıkarsa"
 *
 * Ana sayfa (hero havuzu) ve 404 sayfasında kullanılır. Havuz sunucudan küçük
 * bir dizi olarak gelir; tıklamada rastgele yapım + bölüm seçilip oynatıcıya
 * gidilir. Bölüm sayısı bilinmiyorsa yapım sayfasına düşer.
 */
import { useRouter } from 'next/navigation';

interface Oge {
  s: string;
  bs: number;
}

export default function RastgeleDugme({
  havuz,
  etiket = 'Şansıma ne çıkarsa',
  kisaEtiket = 'Şansıma',
}: {
  havuz: Oge[];
  etiket?: string;
  /** Dar ekranda gösterilen kısa etiket (hero düğmesi yarım sütuna sığsın). */
  kisaEtiket?: string;
}) {
  const router = useRouter();

  const tikla = () => {
    if (havuz.length === 0) return;
    const sec = havuz[Math.floor(Math.random() * havuz.length)];
    if (sec.bs > 0) {
      const bolum = 1 + Math.floor(Math.random() * sec.bs);
      router.push(`/izle/?a=${encodeURIComponent(sec.s)}&b=${bolum}`);
    } else {
      router.push(`/anime/${sec.s}/`);
    }
  };

  return (
    <button type="button" className="dugme dugme-ikincil" onClick={tikla} aria-label={etiket}>
      <span aria-hidden="true">🎲</span>
      {/* Uzun etiket masaüstünde, kısası dar ekranda: hero düğmesi yarım
          sütunda kırpılıyordu (bkz. globals.css .etiket-kisa). */}
      <span className="etiket-uzun" aria-hidden="true">
        {etiket}
      </span>
      <span className="etiket-kisa" aria-hidden="true">
        {kisaEtiket}
      </span>
    </button>
  );
}
