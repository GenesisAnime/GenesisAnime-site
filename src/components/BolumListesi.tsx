'use client';
/**
 * BolumListesi.tsx — anime detay sayfasındaki bölüm listesi
 *
 * Performans notu: bu bileşene tam `Anime` nesnesi geçilmez. Aksi halde ~317 bin
 * kaynak kaydı her anime sayfasının hem HTML'ine hem de RSC yüküne serileşir ve
 * sayfa boyutu megabaytlara çıkar. Bunun yerine sunucu tarafında üretilen
 * `BolumOzet[]` (bölüm başına ~80 bayt) aktarılır.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { bolumNumarasi, sayiBicim } from '@/lib/bicim';
import { izlenenHaritasi } from '@/lib/depo/yerel';
import { useBaglandi } from '@/lib/depo/kanca';
import { AraIkon } from './Ikon';

export interface BolumOzet {
  n: number;
  no: string | null;
  ad: string;
  ks: number;
  fansub: string | null;
  ekipSayisi: number;
}

interface Props {
  slug: string;
  bolumler: BolumOzet[];
}

/**
 * Sunucuda (ve ilk istemci render'ında) basılacak bölüm satırı üst sınırı.
 * One Piece gibi 1.000+ bölümlü yapılarda HTML'in megabaytlara çıkmasını engeller;
 * geri kalanı "tümünü göster" ile aynı veriden anında açılır.
 */
const BASLANGIC_SATIR = 100;

export default function BolumListesi({ slug, bolumler: tumBolumler }: Props) {
  const baglandi = useBaglandi();
  const [sorgu, setSorgu] = useState('');
  const [sirala, setSirala] = useState<'artan' | 'azalan'>('artan');
  const [izlenmisGizle, setIzlenmisGizle] = useState(false);
  const [gosterilen, setGosterilen] = useState(BASLANGIC_SATIR);

  const izlenenler = baglandi ? izlenenHaritasi() : {};

  const izlendi = (n: number) => Boolean(izlenenler[`${slug}|${n}`]);

  const bolumler = useMemo(() => {
    const q = sorgu.trim().toLowerCase();
    let dizi = tumBolumler.filter((b) => {
      if (izlenmisGizle && izlendi(b.n)) return false;
      if (!q) return true;
      const no = b.no ?? String(b.n);
      return no.includes(q) || b.ad.toLowerCase().includes(q) || String(b.n) === q;
    });
    if (sirala === 'azalan') dizi = [...dizi].reverse();
    return dizi;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tumBolumler, sorgu, sirala, izlenmisGizle, izlenenler, slug]);

  const izlendiSayisi = baglandi ? tumBolumler.filter((b) => izlendi(b.n)).length : 0;
  const gosterilecek = bolumler.slice(0, gosterilen);

  if (tumBolumler.length === 0) {
    return (
      <div className="uyari-kutu uyari">
        <span aria-hidden="true">⚠️</span>
        <span>
          Bu yapım için arşivde bölüm kaydı bulunmuyor. Arşiv eksiklerini tamamlamak için çalışmalar
          sürüyor.
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="satir-basi">
        <h2 className="satir-baslik">Bölümler</h2>
        <span className="satir-tumu">
          {sayiBicim(tumBolumler.length)} bölüm
          {baglandi && izlendiSayisi > 0 ? ` · ${sayiBicim(izlendiSayisi)} izlendi` : ''}
        </span>
      </div>

      <div className="filtreler" style={{ margin: '0 0 16px', padding: 12 }}>
        <div className="ust-arama" style={{ flex: '1 1 220px' }}>
          <span className="arama-ikon" aria-hidden="true">
            <AraIkon />
          </span>
          <input
            type="search"
            value={sorgu}
            placeholder="Bölüm no veya adı…"
            aria-label="Bölüm ara"
            onChange={(e) => {
            setSorgu(e.target.value);
            setGosterilen(BASLANGIC_SATIR);
          }}
          />
        </div>

        <select
          className="secim"
          value={sirala}
          aria-label="Sıralama"
          onChange={(e) => {
            setSirala(e.target.value as 'artan' | 'azalan');
            setGosterilen(BASLANGIC_SATIR);
          }}
        >
          <option value="artan">1 → son</option>
          <option value="azalan">Son → 1</option>
        </select>

        <button
          className={`dugme dugme-sade${izlenmisGizle ? ' etkin' : ''}`}
          onClick={() => {
            setIzlenmisGizle((g) => !g);
            setGosterilen(BASLANGIC_SATIR);
          }}
          aria-pressed={izlenmisGizle}
        >
          İzlediklerimi gizle
        </button>

        <span className="filtre-sayac">{sayiBicim(bolumler.length)} bölüm listeleniyor</span>
      </div>

      <div className="bolum-liste">
        {gosterilecek.map((b) => {
          const gecerli = b.ks > 0;
          return (
            <Link
              key={b.n}
              className="bolum"
              href={gecerli ? `/izle/?a=${encodeURIComponent(slug)}&b=${b.n}` : '#'}
              aria-disabled={!gecerli}
              style={gecerli ? undefined : { opacity: 0.55, pointerEvents: 'none' }}
            >
              <span className="bolum-no">{bolumNumarasi(b.no, b.n)}</span>
              <span className="bolum-icerik">
                <span className="bolum-ad">{b.ad || `${bolumNumarasi(b.no, b.n)}. Bölüm`}</span>
                <span className="bolum-alt">
                  {gecerli ? (
                    <>
                      <span>{sayiBicim(b.ks)} kaynak</span>
                      {b.fansub ? <span>{b.fansub}</span> : null}
                      {b.ekipSayisi > 0 ? <span>{b.ekipSayisi} ekip kaydı</span> : null}
                    </>
                  ) : (
                    <span>Bu bölüm için çalışan kaynak kalmadı</span>
                  )}
                </span>
              </span>
              {izlendi(b.n) ? (
                <span className="bolum-isaret" title="İzlendi">
                  ✓ izlendi
                </span>
              ) : null}
            </Link>
          );
        })}
        {bolumler.length > gosterilen ? (
          <div className="devam" style={{ padding: 14 }}>
            <button
              className="dugme dugme-ikincil"
              onClick={() => setGosterilen((g) => g + BASLANGIC_SATIR)}
            >
              {Math.min(BASLANGIC_SATIR, bolumler.length - gosterilen)} bölüm daha göster
              <span style={{ color: 'var(--tx3)' }}>({sayiBicim(bolumler.length - gosterilen)} kaldı)</span>
            </button>
          </div>
        ) : null}
        {bolumler.length === 0 ? (
          <div className="bos-durum" style={{ padding: 30 }}>
            <p>Bu filtreyle eşleşen bölüm yok.</p>
          </div>
        ) : null}
      </div>
    </>
  );
}
