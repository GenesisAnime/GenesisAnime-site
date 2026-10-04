'use client';
/**
 * TembelSatirlar.tsx — ana sayfanın alt satırlarını kademeli yükler
 * ==================================================================
 * Önce: 18 satır × 30 kart = 540 kart **tek HTML'de** geliyordu; sayfa
 * 981 KB (89 KB gzip) ve 6.900 DOM düğümü oluyordu. Tarayıcı bunların
 * tamamını ayrıştırıp React ile hidrasyon yapmak zorundaydı — ilk açılış
 * maliyetinin büyük kısmı buydu.
 *
 * Şimdi: ilk birkaç satır sunucuda render edilir (ekranın üstü anında dolu),
 * kalanı burada **yaklaşınca** yüklenir:
 *
 *   1. Yer tutucular: satır başlığı + "Tümünü gör" bağlantısı + birkaç iskelet
 *      kart (yükseklik sabit kalsın, kaydırma zıplamasın). Bunlar sunucuda da
 *      basılır — JavaScript hiç çalışmasa bile sayfa yapısı ve bağlantılar durur.
 *   2. Veri: `ana-sayfa-kartlar.json` (kart alanlarına kırpılmış, 15 KB gzip)
 *      gözcü sınıra yaklaşınca **bir kez** indirilir. Tam dosya
 *      `ana-sayfa.json` 99 KB gzip'tir; kırpılmış sürüm bu yüzden var.
 *   3. Render: satırlar üçerli gruplar hâlinde, gözcü görünür oldukça eklenir.
 *      Kullanıcı görmediği satır için düğüm üretilmez.
 *
 * Gözcü **sınırda** durur: yüklenmiş satırların hemen ardında, yer tutuculardan
 * önce. Böylece kullanıcı iskeletleri görmeden önce bir ekran öncesinden
 * yükleme başlar; gözcü sayfanın en altına konulsaydı iskeletler görünür ama
 * içerik gelmezdi. Konum ölçümü `scroll`/`resize` olaylarında rAF ile
 * kısıtlanır ve her büyümeden sonra tekrarlanır — 'End' ile sayfa sonuna
 * atlayan kullanıcıda da grup grup yakınsar.
 *
 * Bozulma davranışı: veri indirilemezse yer tutucular olduğu gibi kalır
 * (kitap başlıkları ve /kesfet bağlantıları görünür); sayfa boşalmaz.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Satir from './Satir';
import Kart from './Kart';
import { genelYol } from '@/lib/yollar';
import type { AnaSayfaSatiri } from '@/lib/tipler';

/** Bir seferde kaç satır eklenir. */
const GRUP_BOYU = 3;
/** Gözcü, görüş alanı sınırına bu kadar yaklaşınca tetiklenir (önceden yükleme payı). */
const ESIK_PAYI = 900;
/** Yer tutucuda kaç iskelet kart gösterilir (satır yüksekliğini korur). */
const ISKELET_SAYISI = 6;

export interface TembelSatirBasligi {
  baslik: string;
  href: string;
}

interface Props {
  /** Kaçıncı satırdan itibaren yüklenecek (sunucuda basılan satır sayısı). */
  baslangic: number;
  /** Yer tutucular için başlıklar (sunucuda hesaplanır; sıra birebir aynıdır). */
  basliklar: TembelSatirBasligi[];
}

export default function TembelSatirlar({ baslangic, basliklar }: Props) {
  const [satirlar, setSatirlar] = useState<AnaSayfaSatiri[] | null>(null);
  const [gosterilen, setGosterilen] = useState(GRUP_BOYU);
  const [yukleniyor, setYukleniyor] = useState(false);
  const basladiRef = useRef(false);
  const altRef = useRef<HTMLDivElement>(null);

  /* ---------------- 1 · veriyi bir kez indir ---------------- */
  const yukle = useCallback(() => {
    if (basladiRef.current) return;
    basladiRef.current = true;
    setYukleniyor(true);
    fetch(genelYol('/data/ana-sayfa-kartlar.json'), { headers: { Accept: 'application/json' } })
      .then((yanit) => (yanit.ok ? yanit.json() : null))
      .then((veri: { satirlar?: AnaSayfaSatiri[] } | null) => {
        if (!veri || !Array.isArray(veri.satirlar)) return; // yer tutucular kalır
        setSatirlar(veri.satirlar.slice(baslangic));
      })
      .catch(() => {
        /* çevrimdışı: yer tutucular görünür kalır, sayfa bozulmaz */
      })
      .finally(() => setYukleniyor(false));
  }, [baslangic]);

  /* ---------------- 2 · gözcü: sınıra yaklaşınca ilerle ---------------- */
  useEffect(() => {
    /* Tüm satırlar yüklendiyse dinleyici kalmaz. */
    if (satirlar !== null && gosterilen >= satirlar.length) return;
    const gozcuyeBak = () => {
      const alt = altRef.current;
      if (!alt) return;
      if (alt.getBoundingClientRect().top > window.innerHeight + ESIK_PAYI) return;
      if (!basladiRef.current) yukle();
      /* Veri gelmeden grup büyütülmez: yavaş ağda kaydırma sayacı kaçmasın. */
      else if (satirlar) setGosterilen((g) => g + GRUP_BOYU);
    };

    let bekleyen = 0;
    const tetikle = () => {
      if (bekleyen) return;
      bekleyen = requestAnimationFrame(() => {
        bekleyen = 0;
        gozcuyeBak();
      });
    };

    /* Ölçüm API'si eksikse (çok eski tarayıcı) her koşuda bir grup ilerlet. */
    if (typeof requestAnimationFrame === 'undefined') {
      if (!basladiRef.current) yukle();
      else if (satirlar) setGosterilen((g) => g + GRUP_BOYU);
      return;
    }
    window.addEventListener('scroll', tetikle, { passive: true });
    window.addEventListener('resize', tetikle, { passive: true });
    tetikle();
    return () => {
      window.removeEventListener('scroll', tetikle);
      window.removeEventListener('resize', tetikle);
      if (bekleyen) cancelAnimationFrame(bekleyen);
    };
  }, [satirlar, gosterilen, yukle]);

  const gorunur = useMemo(() => (satirlar ? satirlar.slice(0, gosterilen) : []), [satirlar, gosterilen]);
  /** Yer tutucu listesi: yüklenen satırlar kadar kısalır. */
  const yerTutucular = useMemo(
    () => basliklar.slice(satirlar ? Math.min(gosterilen, basliklar.length) : 0),
    [basliklar, satirlar, gosterilen]
  );

  return (
    <>
      {gorunur.map((s) => (
        <Satir key={s.baslik} baslik={s.baslik} tumuHref={basliklar.find((b) => b.baslik === s.baslik)?.href}>
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

      {/* Gözcü: yüklenmiş satırlarla yer tutucuların tam sınırında durur. */}
      <div ref={altRef} style={{ height: 1 }} aria-hidden="true" />

      {yerTutucular.map((b) => (
        <section className="satir" key={b.baslik} aria-label={b.baslik} data-tembel="1">
          <div className="satir-basi">
            <h2 className="satir-baslik">{b.baslik}</h2>
            {b.href ? (
              <a className="satir-tumu" href={b.href}>
                Tümünü gör →
              </a>
            ) : null}
          </div>
          <div className="satir-kaydirma" aria-hidden="true">
            {Array.from({ length: ISKELET_SAYISI }, (_, i) => (
              <div className="kart kart-iskelet" key={i}>
                <div className="kart-gorsel" />
              </div>
            ))}
          </div>
        </section>
      ))}

      {yukleniyor && !satirlar ? (
        <p className="ipucu" role="status" style={{ textAlign: 'center', margin: '10px 0' }}>
          Alt satırlar yükleniyor…
        </p>
      ) : null}
    </>
  );
}
