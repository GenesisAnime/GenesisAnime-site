'use client';
/** AraIstemci.tsx — adres çubuğundaki ?q= değerine göre arama sonuçları */
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Kart from './Kart';
import { ara, katalogYukle, vurgula } from '@/lib/istemci/katalog';
import type { KatalogSatiri } from '@/lib/tipler';
import { sayiBicim } from '@/lib/bicim';

export default function AraIstemci() {
  const aramalar = useSearchParams();
  const sorgu = aramalar.get('q') ?? '';
  const [satirlar, setSatirlar] = useState<KatalogSatiri[] | null>(null);
  const [oneri, setOneri] = useState<KatalogSatiri[]>([]);

  useEffect(() => {
    katalogYukle()
      .then((s) => {
        setSatirlar(s);
        setOneri(s.filter((x) => x[3] != null).sort((a, b) => (b[3] ?? 0) - (a[3] ?? 0)).slice(0, 24));
      })
      .catch(() => setSatirlar([]));
  }, []);

  const sonuclar = useMemo(() => (satirlar && sorgu ? ara(satirlar, sorgu, 200) : []), [satirlar, sorgu]);

  return (
    <div className="kap">
      <div className="sayfa-basi">
        <h1>{sorgu ? `“${sorgu}” için sonuçlar` : 'Arama'}</h1>
        <p>
          {!satirlar
            ? 'Katalog yükleniyor…'
            : sorgu
              ? `${sayiBicim(sonuclar.length)} sonuç bulundu.`
              : 'Yukarıdaki arama kutusuna yazmaya başla — sonuçlar yazarken gelir.'}
        </p>
      </div>

      {!satirlar ? (
        <div className="izgara">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="iskelet" style={{ aspectRatio: '2 / 3' }} />
          ))}
        </div>
      ) : sorgu ? (
        sonuclar.length === 0 ? (
          <div className="bos-durum">
            <div className="buyuk">🔍</div>
            <h3>Sonuç bulunamadı</h3>
            <p>
              Yazımı kontrol etmeyi ya da karakterin orijinal adını denemeyi dene. Arşivde 6 binden
              fazla yapım var; bazen yalnızca ilk kelimeyi yazmak yeterli.
            </p>
            <Link className="dugme dugme-birincil" href="/kesfet/">
              Kataloğa göz at
            </Link>
          </div>
        ) : (
          <div className="izgara">
            {sonuclar.map((s) => (
              <div key={s[0]} title={s[1]}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, lineHeight: 1.3 }}>
                  {vurgula(s[1], sorgu).map((p, i) =>
                    typeof p === 'string' ? (
                      <span key={i}>{p}</span>
                    ) : (
                      <mark key={i} style={{ background: 'var(--ac)', color: '#fff', borderRadius: 3, padding: '0 2px' }}>
                        {p.v}
                      </mark>
                    )
                  )}
                </div>
                <Kart
                  slug={s[0]}
                  ad={s[1]}
                  poster={s[5]}
                  yil={s[2]}
                  puan={s[3]}
                  format={s[4]}
                  bolumSayisi={s[6]}
                  kaynakSayisi={s[10]}
                />
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="satir-basi">
            <h2 className="satir-baslik">En yüksek puanlılar</h2>
          </div>
          <div className="izgara">
            {oneri.map((s) => (
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
        </>
      )}
    </div>
  );
}
