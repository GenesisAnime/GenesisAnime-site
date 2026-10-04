import Link from 'next/link';
import type { Metadata } from 'next';
import Hero from '@/components/Hero';
import Satir from '@/components/Satir';
import Kart from '@/components/Kart';
import IzlemeyeDevam from '@/components/IzlemeyeDevam';
import TembelSatirlar from '@/components/TembelSatirlar';
import { anaSayfaOku, kunyeOku } from '@/lib/veri';
import { sayiBicim } from '@/lib/bicim';
import { satirHref } from '@/lib/ana-sayfa';

export const metadata: Metadata = {
  title: 'GenesisAnime — Türkçe anime izleme arşivi',
  alternates: { canonical: '/' },
};

/**
 * Sunucuda basılan satır sayısı. Ekranın üst kısmı (hero + ilk satırlar) HTML
 * ile birlikte gelir; altındaki satırlar `TembelSatirlar` ile yaklaşınca
 * yüklenir. Ölçüm (04.10): 18 satırın tamamını basmak 981 KB HTML ve ~6.900
 * DOM düğümü üretiyordu; ilk üç satırda bu 300 KB / ~1.700 düğüme iner.
 */
const HEMEN_SATIR = 3;

export default function AnaSayfa() {
  const anaSayfa = anaSayfaOku();
  const kunye = kunyeOku();

  const hemen = anaSayfa.satirlar.slice(0, HEMEN_SATIR);
  const tembel = anaSayfa.satirlar.slice(HEMEN_SATIR);

  return (
    <>
      <Hero ogeler={anaSayfa.hero} />

      <div className="kap">
        <IzlemeyeDevam />

        {hemen.map((s) => (
          <Satir key={s.baslik} baslik={s.baslik} tumuHref={satirHref(s)}>
            {s.ogeler.map((o) => (
              <Kart
                key={o.s}
                slug={o.s}
                ad={o.ad}
                poster={o.p}
                buyuk={o.p2}
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

        {/* Kalan satırlar: yer tutucular HTML'e girer, içerik yaklaşınca gelir. */}
        {tembel.length ? (
          <TembelSatirlar
            baslangic={HEMEN_SATIR}
            basliklar={tembel.map((s) => ({ baslik: s.baslik, href: satirHref(s) }))}
          />
        ) : null}

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
