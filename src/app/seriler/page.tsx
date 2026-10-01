import Link from 'next/link';
import type { Metadata } from 'next';
import { serilerOku } from '@/lib/veri';
import { sayiBicim } from '@/lib/bicim';

export const metadata: Metadata = {
  title: 'Seriler — bağlantılı yapımlar',
  description:
    'Arşivdeki ilişkili yapım ağları: devam sezonları, filmler, yan hikâyeler ve spin-off’lar tek sayfada.',
  alternates: { canonical: '/seriler/' },
};

export default function SerilerSayfasi() {
  const seriler = serilerOku().seriler;
  const toplam = seriler.reduce((t, s) => t + s.uyeler.length, 0);

  return (
    <div className="kap" style={{ paddingTop: 26 }}>
      <div className="sayfa-basi">
        <h1>Seriler</h1>
        <p>
          Arşivde <b>{sayiBicim(seriler.length)}</b> bağlantılı yapım ağı var; toplam{' '}
          <b>{sayiBicim(toplam)}</b> yapım bir seriye bağlı. Devam sezonları, filmler ve yan
          hikâyeler ilişki kayıtlarından otomatik çıkarılır.
        </p>
      </div>

      <table className="tablo">
        <thead>
          <tr>
            <th>Seri</th>
            <th className="sayi">Yapım</th>
            <th className="sayi">Yıllar</th>
          </tr>
        </thead>
        <tbody>
          {seriler.map((s) => {
            const yillar = s.uyeler.map((u) => u.yil).filter((y): y is number => typeof y === 'number');
            const aralik = yillar.length
              ? yillar.length === 1
                ? String(yillar[0])
                : `${Math.min(...yillar)}–${Math.max(...yillar)}`
              : '—';
            return (
              <tr key={s.s}>
                <td>
                  <Link href={`/seri/${s.s}/`} style={{ color: 'var(--ac2)' }}>
                    {s.ad}
                  </Link>
                </td>
                <td className="sayi">{sayiBicim(s.uyeler.length)}</td>
                <td className="sayi">{aralik}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
