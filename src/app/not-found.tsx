import Link from 'next/link';
import Kart from '@/components/Kart';
import RastgeleDugme from '@/components/RastgeleDugme';
import { katalogOku } from '@/lib/veri';
import { KOLON } from '@/lib/veri';

/** 404 — arşivden öneriler ve rastgele bölüm ile kayıp ziyaretçiyi tutar. */
export default function Bulunamadi() {
  // En yüksek puanlı, kaynağı olan yapımlardan küçük bir öneri havuzu.
  const oneriler = katalogOku()
    .anime.filter((s) => s[KOLON.puan] != null && s[KOLON.kaynakSayisi] > 0)
    .sort((a, b) => (b[KOLON.puan] ?? 0) - (a[KOLON.puan] ?? 0))
    .slice(0, 6);

  const havuz = katalogOku()
    .anime.filter((s) => s[KOLON.kaynakSayisi] > 0)
    .slice(0, 400)
    .map((s) => ({ s: s[KOLON.slug], bs: s[KOLON.bolumSayisi] }));

  return (
    <div className="kap">
      <div className="bos-durum" style={{ paddingTop: 80 }}>
        <div className="buyuk">🍥</div>
        <h3>Aradığın sayfa arşivde yok</h3>
        <p>
          Bağlantı eskimiş olabilir ya da yapım arşivde farklı bir adla kayıtlıdır. Yukarıdaki arama
          kutusundan (kısayol: <b>/</b>) deneyebilirsin.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="dugme dugme-birincil" href="/">
            Ana sayfa
          </Link>
          <Link className="dugme dugme-ikincil" href="/kesfet/">
            Keşfet
          </Link>
          <Link className="dugme dugme-ikincil" href="/seriler/">
            Seriler
          </Link>
          <RastgeleDugme havuz={havuz} etiket="Rastgele bölüm" />
        </div>
      </div>

      {oneriler.length > 0 ? (
        <section style={{ marginTop: 26, marginBottom: 60 }}>
          <h2 className="satir-baslik" style={{ fontSize: 17, marginBottom: 14 }}>
            Bunun yerine arşivin en iyileri
          </h2>
          <div className="izgara">
            {oneriler.map((s) => (
              <Kart
                key={s[KOLON.slug]}
                slug={s[KOLON.slug]}
                ad={s[KOLON.ad]}
                poster={s[KOLON.poster]}
                yil={s[KOLON.yil]}
                puan={s[KOLON.puan]}
                format={s[KOLON.format]}
                bolumSayisi={s[KOLON.bolumSayisi]}
                kaynakSayisi={s[KOLON.kaynakSayisi]}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
