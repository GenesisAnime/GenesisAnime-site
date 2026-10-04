'use client';
/**
 * Hero.tsx — ana sayfanın öne çıkan bölümü
 * 24 aday arasından otomatik döner; ziyaretçi başına rastgele başlangıç.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AnaSayfaKarti } from '@/lib/tipler';
import { formatAd, kisalt, puanBicim, sayiBicim } from '@/lib/bicim';
import { backdropSrcSet, tmdbKucuk } from '@/lib/gorsel';
import { ArtiIkon, OynatIkon, TikIkon } from './Ikon';
import { listede, listeDegistir, abone } from '@/lib/depo/yerel';
import { useBaglandi } from '@/lib/depo/kanca';
import FragmanKatmani from './FragmanKatmani';
import RastgeleDugme from './RastgeleDugme';

interface Props {
  ogeler: AnaSayfaKarti[];
}


export default function Hero({ ogeler }: Props) {
  const [sira, setSira] = useState(0);
  const [duraklat, setDuraklat] = useState(false);
  const baglandi = useBaglandi();
  const [listedemi, setListedemi] = useState(false);
  const [fragmanAcik, setFragmanAcik] = useState(false);

  // İlk render'da rastgele bir seçimle başla (her ziyarette farklı vitrin)
  useEffect(() => {
    if (ogeler.length > 1) setSira(Math.floor(Math.random() * ogeler.length));
  }, [ogeler.length]);

  useEffect(() => {
    if (duraklat || ogeler.length <= 1) return;
    const zamanlayici = setInterval(() => setSira((s) => (s + 1) % ogeler.length), 9000);
    return () => clearInterval(zamanlayici);
  }, [duraklat, ogeler.length]);

  const aktif = ogeler[sira] ?? null;

  useEffect(() => {
    if (!aktif || !baglandi) return;
    const guncelle = () => setListedemi(listede(aktif.s));
    guncelle();
    return abone(guncelle);
  }, [aktif, baglandi]);

  if (!aktif) return null;

  const puan = puanBicim(aktif.puan);

  return (
    <section
      className="hero"
      onMouseEnter={() => setDuraklat(true)}
      onMouseLeave={() => setDuraklat(false)}
      aria-label="Öne çıkan yapım"
    >
      {aktif.ban4k ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="hero-gorsel"
          src={tmdbKucuk(aktif.ban4k)}
          srcSet={backdropSrcSet(aktif.ban4k, aktif.bw)}
          sizes="100vw"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
        />
      ) : aktif.ban ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="hero-gorsel" src={aktif.ban} alt="" aria-hidden="true" fetchPriority="high" decoding="async" />
      ) : aktif.p ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="hero-gorsel" src={aktif.p} alt="" aria-hidden="true" fetchPriority="high" decoding="async" />
      ) : null}
      <div className="hero-perde" />

      <div className="hero-ic">
        <div className="hero-etiket">Öne çıkan · GenesisAnime</div>
        <h1 className="hero-ad">{aktif.ad}</h1>

        <div className="hero-meta">
          {puan ? <span className="hero-puan">★ {puan}</span> : null}
          {aktif.yil ? <span>{aktif.yil}</span> : null}
          <span>{formatAd(aktif.format)}</span>
          <span>{sayiBicim(aktif.bs)} bölüm</span>
          <span>{sayiBicim(aktif.ks)} kaynak</span>
          {aktif.t.slice(0, 3).map((t) => (
            <span key={t} className="etiket">
              {t}
            </span>
          ))}
        </div>

        {aktif.oz ? <p className="hero-ozet">{kisalt(aktif.oz, 320)}</p> : null}

        <div className="hero-dugmeler">
          <Link className="dugme dugme-birincil" href={`/izle/?a=${encodeURIComponent(aktif.s)}&b=1`}>
            <OynatIkon /> Hemen İzle
          </Link>
          {/* Mobilde bu grup tek satırda yatay kaydırılır (hero tek ekrana sığsın);
              masaüstünde `display: contents` ile sarmalayıcı görünmez kalır. */}
          <div className="hero-ikinciller">
            <button
              className={`dugme dugme-ikincil${listedemi ? ' etkin' : ''}`}
              onClick={() =>
                listeDegistir({
                  slug: aktif.s,
                  ad: aktif.ad,
                  poster: aktif.p,
                  yil: aktif.yil,
                  zaman: Date.now(),
                })
              }
              aria-pressed={listedemi}
            >
              {listedemi ? <TikIkon /> : <ArtiIkon />}
              {listedemi ? 'Listemde' : 'Listeme ekle'}
            </button>
            {aktif.fr ? (
              <button
                className="dugme dugme-ikincil"
                onClick={() => setFragmanAcik(true)}
                aria-haspopup="dialog"
              >
                ▶ Fragman
              </button>
            ) : null}
            <Link className="dugme dugme-ikincil" href={`/anime/${aktif.s}/`}>
              Detaylar
            </Link>
            <RastgeleDugme havuz={ogeler.map((o) => ({ s: o.s, bs: o.bs }))} />
          </div>
        </div>

        {fragmanAcik && aktif.fr ? (
          <FragmanKatmani kimlik={aktif.fr} ad={aktif.ad} kapat={() => setFragmanAcik(false)} />
        ) : null}

        {ogeler.length > 1 ? (
          <div className="hero-noktalar" role="tablist" aria-label="Öne çıkan seçimleri">
            {ogeler.map((o, i) => (
              <button
                key={o.s}
                role="tab"
                aria-selected={i === sira}
                aria-label={o.ad}
                className={`hero-nokta${i === sira ? ' etkin' : ''}`}
                onClick={() => setSira(i)}
              />
            ))}
          </div>
        ) : null}

      </div>
    </section>
  );
}
