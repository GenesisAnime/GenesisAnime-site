'use client';
/**
 * FansubIstemci.tsx — fansub grupları dizini
 *
 * Arşivin en ayırt edici verisi: 112 binden fazla bölüm-ekip kaydından üretilen
 * grup dizini. Bir grup seçildiğinde o grubun katkı verdiği yapımlar listelenir.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Kart from './Kart';
import { AraIkon, KapatIkon } from './Ikon';
import { genelYol } from '@/lib/yollar';
import { normalize, sayiBicim } from '@/lib/bicim';
import type { KatalogSatiri, Kunye, Taksonomi } from '@/lib/tipler';

interface FansubDosyasi {
  uretim: string;
  gruplar: { ad: string; s: string; bolum: number; anime: string[] }[];
}

export default function FansubIstemci({ taksonomi, kunye }: { taksonomi: Taksonomi; kunye: Kunye }) {
  const [sorgu, setSorgu] = useState('');
  const [secili, setSecili] = useState<string | null>(null);
  const [dizin, setDizin] = useState<FansubDosyasi | null>(null);
  const [katalog, setKatalog] = useState<KatalogSatiri[] | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  // Grup seçilince yalnızca gerekli veri indirilir
  useEffect(() => {
    if (!secili || dizin) return;
    setYukleniyor(true);
    fetch(genelYol('/data/fansublar.json'))
      .then((y) => y.json() as Promise<FansubDosyasi>)
      .then(setDizin)
      .catch(() => setDizin({ uretim: '', gruplar: [] }))
      .finally(() => setYukleniyor(false));
  }, [secili, dizin]);

  useEffect(() => {
    if (!secili || katalog) return;
    import('@/lib/istemci/katalog').then((m) => {
      m.katalogYukle().then(setKatalog).catch(() => setKatalog([]));
    });
  }, [secili, katalog]);

  const gruplar = useMemo(() => {
    const q = normalize(sorgu);
    if (!q) return taksonomi.fansublar;
    return taksonomi.fansublar.filter((g) => normalize(g.ad).includes(q));
  }, [sorgu, taksonomi.fansublar]);

  const seciliGrup = useMemo(() => dizin?.gruplar.find((g) => g.ad === secili) ?? null, [dizin, secili]);

  const seciliAnime = useMemo(() => {
    if (!seciliGrup || !katalog) return [];
    const kume = new Set(seciliGrup.anime);
    return katalog.filter((s) => kume.has(s[0]));
  }, [seciliGrup, katalog]);

  return (
    <div className="kap">
      <div className="sayfa-basi">
        <h1>Fansub grupları</h1>
        <p>
          Arşivde <b>{sayiBicim(kunye.fansubGrubu)}</b> fansub grubunun katkısı kayıtlı. Bölüm
          bazında çevirmen, redaktör ve encode bilgileri oynatıcı sayfasında görünür.
        </p>
      </div>

      <div className="filtreler">
        <div className="ust-arama" style={{ flex: '1 1 260px' }}>
          <span className="arama-ikon" aria-hidden="true">
            <AraIkon />
          </span>
          <input
            type="search"
            value={sorgu}
            placeholder="Grup ara…"
            aria-label="Fansub grubu ara"
            onChange={(e) => setSorgu(e.target.value)}
          />
        </div>
        <span className="filtre-sayac">{sayiBicim(gruplar.length)} grup</span>
      </div>

      <div className="etiketler" style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 6 }}>
        {gruplar.map((g) => (
          <button
            key={g.ad}
            className={`etiket${secili === g.ad ? ' vurgu' : ''}`}
            onClick={() => setSecili(secili === g.ad ? null : g.ad)}
            title={`${sayiBicim(g.bolum)} bölüm · ${sayiBicim(g.anime)} yapım`}
          >
            {g.ad} · {sayiBicim(g.bolum)}
          </button>
        ))}
        {gruplar.length === 0 ? <p style={{ color: 'var(--tx2)' }}>Eşleşen grup yok.</p> : null}
      </div>

      {secili ? (
        <section style={{ marginTop: 40 }}>
          <div className="satir-basi">
            <h2 className="satir-baslik">{secili}</h2>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {seciliGrup?.s ? (
                <Link className="satir-tumu" href={`/fansub/${seciliGrup.s}/`}>
                  Grup sayfası →
                </Link>
              ) : null}
              <button className="dugme dugme-sade" onClick={() => setSecili(null)}>
                <KapatIkon boyut={14} /> Seçimi kapat
              </button>
            </div>
          </div>

          {yukleniyor ? (
            <div className="izgara">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="iskelet" style={{ aspectRatio: '2 / 3' }} />
              ))}
            </div>
          ) : seciliAnime.length > 0 ? (
            <>
              <p style={{ color: 'var(--tx2)', marginBottom: 18 }}>
                <b>{seciliGrup?.anime.length}</b> yapımda, <b>{sayiBicim(seciliGrup?.bolum ?? 0)}</b>{' '}
                bölümde katkı.
              </p>
              <div className="izgara">
                {seciliAnime.map((s) => (
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
          ) : katalog ? (
            <p style={{ color: 'var(--tx2)' }}>
              Bu grubun katkı verdiği yapımlar katalogda bulunamadı.{' '}
              <Link href="/kesfet/" style={{ color: 'var(--ac2)' }}>
                Kataloğa göz at
              </Link>
            </p>
          ) : (
            <div className="devam">Yapımlar yükleniyor…</div>
          )}
        </section>
      ) : (
        <section style={{ marginTop: 34 }}>
          <h2 className="satir-baslik" style={{ fontSize: 17, marginBottom: 12 }}>
            En çok katkı veren 20 grup
          </h2>
          <table className="tablo">
            <thead>
              <tr>
                <th>Grup</th>
                <th className="sayi">Bölüm</th>
                <th className="sayi">Yapım</th>
              </tr>
            </thead>
            <tbody>
              {taksonomi.fansublar.slice(0, 20).map((g) => (
                <tr key={g.ad} onClick={() => setSecili(g.ad)} style={{ cursor: 'pointer' }}>
                  <td>{g.ad}</td>
                  <td className="sayi">{sayiBicim(g.bolum)}</td>
                  <td className="sayi">{sayiBicim(g.anime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: 'var(--tx3)', fontSize: 12.5, marginTop: 12 }}>
            Satıra veya yukarıdaki gruba tıklayarak o grubun yapımlarını görebilirsin.
          </p>
        </section>
      )}
    </div>
  );
}
