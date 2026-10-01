'use client';
/** KesfetIstemci.tsx — katalog tarama: filtre, sıralama, sonsuz yükleme */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Kart from './Kart';
import { AraIkon, KapatIkon } from './Ikon';
import { VARSAYILAN_FILTRE, filtrele, katalogYukle, type Filtre } from '@/lib/istemci/katalog';
import { useTercihler } from '@/lib/depo/kanca';
import { tercihKaydet } from '@/lib/depo/yerel';
import type { KatalogSatiri, Taksonomi } from '@/lib/tipler';
import { formatAd, sayiBicim } from '@/lib/bicim';

const SAYFA_BOYUT = 60;

const SIRALAR: { deger: Filtre['sirala']; ad: string }[] = [
  { deger: 'populer', ad: 'Öne çıkanlar' },
  { deger: 'puan', ad: 'Puana göre' },
  { deger: 'yeni', ad: 'En yeni yıl' },
  { deger: 'eski', ad: 'En eski yıl' },
  { deger: 'bolum', ad: 'Bölüm sayısı' },
  { deger: 'ad', ad: 'İsme göre (A-Z)' },
];

export default function KesfetIstemci({ taksonomi }: { taksonomi: Taksonomi }) {
  const aramalar = useSearchParams();
  const tercihler = useTercihler();

  const [satirlar, setSatirlar] = useState<KatalogSatiri[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>(VARSAYILAN_FILTRE);
  const [gosterilen, setGosterilen] = useState(SAYFA_BOYUT);

  // URL parametrelerini başlangıç filtresine uygula
  useEffect(() => {
    setFiltre({
      tur: aramalar.get('tur'),
      format: aramalar.get('format'),
      yil: aramalar.get('yil'),
      durum: aramalar.get('durum'),
      sirala: (aramalar.get('sirala') as Filtre['sirala']) || 'populer',
      sorgu: aramalar.get('q') ?? '',
    });
  }, [aramalar]);

  useEffect(() => {
    katalogYukle()
      .then(setSatirlar)
      .catch((e: Error) => setHata(e.message));
  }, []);

  useEffect(() => setGosterilen(SAYFA_BOYUT), [filtre]);

  const sonuclar = useMemo(() => (satirlar ? filtrele(satirlar, filtre) : []), [satirlar, filtre]);
  const gorunum = tercihler.gorunum;

  const guncelle = (degisiklik: Partial<Filtre>) => setFiltre((f) => ({ ...f, ...degisiklik }));

  if (hata) {
    return (
      <div className="kap">
        <div className="bos-durum">
          <div className="buyuk">📡</div>
          <h3>Katalog indirilemedi</h3>
          <p>{hata}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kap">
      <div className="sayfa-basi">
        <h1>Keşfet</h1>
        <p>
          {satirlar ? `${sayiBicim(satirlar.length)} yapım` : 'Katalog yükleniyor…'} · filtrele,
          sırala, izle.
        </p>
      </div>

      <div className="filtreler">
        <div className="ust-arama" style={{ flex: '1 1 260px' }}>
          <span className="arama-ikon" aria-hidden="true">
            <AraIkon />
          </span>
          <input
            type="search"
            value={filtre.sorgu}
            placeholder="Katalog içinde ara…"
            aria-label="Katalog içinde ara"
            onChange={(e) => guncelle({ sorgu: e.target.value })}
          />
        </div>

        <select
          className="secim"
          aria-label="Tür"
          value={filtre.tur ?? ''}
          onChange={(e) => guncelle({ tur: e.target.value || null })}
        >
          <option value="">Tüm türler</option>
          {taksonomi.turler.slice(0, 40).map((t) => (
            <option key={t.ad} value={t.ad}>
              {t.ad} ({t.sayi})
            </option>
          ))}
        </select>

        <select
          className="secim"
          aria-label="Format"
          value={filtre.format ?? ''}
          onChange={(e) => guncelle({ format: e.target.value || null })}
        >
          <option value="">Tüm formatlar</option>
          {taksonomi.formatlar.map((f) => (
            <option key={f.ad} value={f.ad}>
              {formatAd(f.ad)} ({f.sayi})
            </option>
          ))}
        </select>

        <select
          className="secim"
          aria-label="Yıl"
          value={filtre.yil ?? ''}
          onChange={(e) => guncelle({ yil: e.target.value || null })}
        >
          <option value="">Tüm yıllar</option>
          {taksonomi.yillar.slice(0, 45).map((y) => (
            <option key={y.yil} value={String(y.yil)}>
              {y.yil} ({y.sayi})
            </option>
          ))}
        </select>

        <select
          className="secim"
          aria-label="Sıralama"
          value={filtre.sirala}
          onChange={(e) => guncelle({ sirala: e.target.value as Filtre['sirala'] })}
        >
          {SIRALAR.map((s) => (
            <option key={s.deger} value={s.deger}>
              {s.ad}
            </option>
          ))}
        </select>

        <select
          className="secim"
          aria-label="Durum"
          value={filtre.durum ?? ''}
          onChange={(e) => guncelle({ durum: e.target.value || null })}
        >
          <option value="">Tüm durumlar</option>
          <option value="FINISHED">Tamamlandı</option>
          <option value="RELEASING">Devam ediyor</option>
          <option value="NOT_YET_RELEASED">Yakında</option>
          <option value="HIATUS">Ara verdi</option>
        </select>

        <button
          className="dugme dugme-sade"
          onClick={() => setFiltre({ ...VARSAYILAN_FILTRE })}
          disabled={
            !filtre.tur && !filtre.format && !filtre.yil && !filtre.durum && !filtre.sorgu && filtre.sirala === 'populer'
          }
        >
          <KapatIkon boyut={14} /> Sıfırla
        </button>

        <button
          className="dugme dugme-sade"
          onClick={() => tercihKaydet({ gorunum: gorunum === 'izgara' ? 'liste' : 'izgara' })}
          aria-pressed={gorunum === 'liste'}
        >
          {gorunum === 'izgara' ? 'Liste görünümü' : 'Izgara görünümü'}
        </button>

        <span className="filtre-sayac">
          {satirlar ? `${sayiBicim(sonuclar.length)} sonuç` : '…'}
        </span>
      </div>

      {!satirlar ? (
        <div className="izgara">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="iskelet" style={{ aspectRatio: '2 / 3' }} />
          ))}
        </div>
      ) : sonuclar.length === 0 ? (
        <div className="bos-durum">
          <div className="buyuk">🔍</div>
          <h3>Sonuç yok</h3>
          <p>Filtreleri gevşetmeyi dene.</p>
          <button className="dugme dugme-birincil" onClick={() => setFiltre({ ...VARSAYILAN_FILTRE })}>
            Filtreleri sıfırla
          </button>
        </div>
      ) : gorunum === 'liste' ? (
        <>
          <div className="liste-gorunum">
            {sonuclar.slice(0, gosterilen).map((s) => (
              <Kart
                key={s[0]}
                slug={s[0]}
                ad={s[1]}
                poster={s[5]}
                yil={s[2]}
                puan={s[3]}
                format={s[4]}
                bolumSayisi={s[6]}
                kaynakSayisi={s[10]}
              />
            ))}
          </div>
          {sonuclar.length > gosterilen ? (
            <div className="devam">
              <button className="dugme dugme-ikincil" onClick={() => setGosterilen((g) => g + SAYFA_BOYUT * 2)}>
                Daha fazla göster ({sayiBicim(sonuclar.length - gosterilen)} kaldı)
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="izgara">
            {sonuclar.slice(0, gosterilen).map((s) => (
              <Kart
                key={s[0]}
                slug={s[0]}
                ad={s[1]}
                poster={s[5]}
                yil={s[2]}
                puan={s[3]}
                format={s[4]}
                bolumSayisi={s[6]}
                kaynakSayisi={s[10]}
              />
            ))}
          </div>
          {sonuclar.length > gosterilen ? (
            <div className="devam">
              <button className="dugme dugme-ikincil" onClick={() => setGosterilen((g) => g + SAYFA_BOYUT * 2)}>
                Daha fazla göster ({sayiBicim(sonuclar.length - gosterilen)} kaldı)
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
