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

export default function RastgeleDugme({ havuz, etiket = 'Şansıma ne çıkarsa' }: { havuz: Oge[]; etiket?: string }) {
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
    <button type="button" className="dugme dugme-ikincil" onClick={tikla}>
      <span aria-hidden="true">🎲</span> {etiket}
    </button>
  );
}
