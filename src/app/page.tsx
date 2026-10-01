import Link from 'next/link';
import type { Metadata } from 'next';
import Hero from '@/components/Hero';
import Satir from '@/components/Satir';
import Kart from '@/components/Kart';
import IzlemeyeDevam from '@/components/IzlemeyeDevam';
import { anaSayfaOku, kunyeOku } from '@/lib/veri';
import { sayiBicim } from '@/lib/bicim';
import type { AnaSayfaSatiri } from '@/lib/tipler';

export const metadata: Metadata = {
  title: 'GenesisAnime — Türkçe anime izleme arşivi',
  alternates: { canonical: '/' },
};

/** Satır başlığına karşılık gelen /kesfet filtre bağlantısı. */
function satirHref(s: AnaSayfaSatiri): string {
  if (s.tur) return `/kesfet/?tur=${encodeURIComponent(s.tur)}`;
  const harita: Record<string, string> = {
    'Şu An Popüler': '/kesfet/?sirala=populer',
    'Yeni Eklenenler': '/kesfet/?sirala=yeni',
    '2026 Sezonu': '/kesfet/?yil=2026',
    'Son 5 Yılın En İyileri': '/kesfet/?sirala=puan',
    'Uzun Soluklu Seriler': '/kesfet/?sirala=bolum',
    Filmler: '/kesfet/?format=MOVIE',
    'Klasikler (2010 ve Öncesi)': '/kesfet/?sirala=eski',
    'Kısa ve Tatlı (13 bölüm ve altı)': '/kesfet/?format=TV',
  };
  return harita[s.baslik] ?? '/kesfet/';
}

export default function AnaSayfa() {
  const anaSayfa = anaSayfaOku();
  const kunye = kunyeOku();

  return (
    <>
      <Hero ogeler={anaSayfa.hero} />

      <div className="kap">
        <IzlemeyeDevam />

        {anaSayfa.satirlar.map((s) => (
          <Satir key={s.baslik} baslik={s.baslik} tumuHref={satirHref(s)}>
            {s.ogeler.map((o) => (
              <Kart
                key={o.s}
                slug={o.s}
                ad={o.ad}
                poster={o.p}
                yil={o.yil}
                puan={o.puan}
                format={o.format}
                bolumSayisi={o.bs}
                kaynakSayisi={o.ks}
                hedef={`/anime/${o.s}/`}
              />
            ))}
          </Satir>
        ))}

        <section className="satir">
          <div className="satir-basi">
            <h2 className="satir-baslik">Arşivde ne var?</h2>
          </div>
          <div className="istatistik-izgara">
            <div className="istatistik">
              <b>{sayiBicim(kunye.anime)}</b>
              <span>anime</span>
            </div>
            <div className="istatistik">
              <b>{sayiBicim(kunye.bolum)}</b>
              <span>bölüm</span>
            </div>
            <div className="istatistik">
              <b>{sayiBicim(kunye.kaynak)}</b>
              <span>oynatılabilir kaynak</span>
            </div>
            <div className="istatistik">
              <b>{sayiBicim(kunye.fansubGrubu)}</b>
              <span>fansub grubu</span>
            </div>
          </div>
          <div className="uyari-kutu bilgi">
            <span aria-hidden="true">ℹ️</span>
            <span>
              Kaynakların bir bölümü (özellikle Sibnet ve eski yükleme siteleri) zamanla ölüyor.
              Çalıştığı doğrulanmış kaynaklar oynatıcıda <b>doğrulanmış</b> rozetiyle gösterilir.
              Kapsam ve yöntem için <Link href="/kunye/">Künye</Link> sayfasına bakabilirsin.
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
