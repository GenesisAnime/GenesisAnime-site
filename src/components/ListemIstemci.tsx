'use client';
/** ListemIstemci.tsx — tarayıcıda saklanan kişisel izleme durumu */
import Link from 'next/link';
import { useState } from 'react';
import Kart from './Kart';
import { ArtiIkon, TikIkon } from './Ikon';
import { useIlerlemeListesi, useIzlenenler, useListe, useTercihler } from '@/lib/depo/kanca';
import { ilerlemeSil, ilerlemeTemizle, listeCikar, tercihKaydet } from '@/lib/depo/yerel';
import { sayiBicim, tarihBicim } from '@/lib/bicim';

type Sekme = 'listem' | 'devam' | 'izlenen';

export default function ListemIstemci() {
  const [sekme, setSekme] = useState<Sekme>('listem');
  const liste = useListe();
  const devam = useIlerlemeListesi();
  const izlenenler = useIzlenenler();
  const tercihler = useTercihler();

  const izlenenSayisi = Object.keys(izlenenler).length;

  const sekmeler: { deger: Sekme; ad: string; sayi: number }[] = [
    { deger: 'listem', ad: 'İzleme listem', sayi: liste.length },
    { deger: 'devam', ad: 'İzlemeye devam et', sayi: devam.length },
    { deger: 'izlenen', ad: 'İzlenen bölümler', sayi: izlenenSayisi },
  ];

  return (
    <div className="kap">
      <div className="sayfa-basi">
        <h1>İzleme listem</h1>
        <p>
          Bu sayfadaki her şey yalnızca bu tarayıcıda saklanır; hesap açmadan kullanabilirsin.
          Hesaplar ve cihazlar arası eşitleme sonraki sürümde geliyor.
        </p>
      </div>

      <div className="filtreler">
        {sekmeler.map((s) => (
          <button
            key={s.deger}
            className={`dugme dugme-sade${sekme === s.deger ? ' etkin' : ''}`}
            onClick={() => setSekme(s.deger)}
            aria-pressed={sekme === s.deger}
          >
            {s.ad} <span style={{ color: 'var(--tx3)' }}>({sayiBicim(s.sayi)})</span>
          </button>
        ))}
        <span className="filtre-sayac">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={tercihler.dogrulanmisOncelik}
              onChange={(e) => tercihKaydet({ dogrulanmisOncelik: e.target.checked })}
            />
            Doğrulanmış kaynakları öne al
          </label>
        </span>
      </div>

      {sekme === 'listem' ? (
        liste.length === 0 ? (
          <div className="bos-durum">
            <div className="buyuk">🔖</div>
            <h3>Listen henüz boş</h3>
            <p>Beğendiğin yapımları “Listeme ekle” ile buraya kaydedebilirsin.</p>
            <Link className="dugme dugme-birincil" href="/kesfet/">
              <ArtiIkon /> Keşfetmeye başla
            </Link>
          </div>
        ) : (
          <>
            <div className="izgara">
              {liste.map((k) => (
                <div key={k.slug} style={{ position: 'relative' }}>
                  <Kart slug={k.slug} ad={k.ad} poster={k.poster} yil={k.yil} puan={null} format={null} />
                  <button
                    className="dugme dugme-sade dugme-kucuk"
                    style={{ marginTop: 6, width: '100%' }}
                    onClick={() => listeCikar(k.slug)}
                  >
                    Listeden çıkar
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>{tarihBicim(k.zaman)} eklendi</div>
                </div>
              ))}
            </div>
          </>
        )
      ) : null}

      {sekme === 'devam' ? (
        devam.length === 0 ? (
          <div className="bos-durum">
            <div className="buyuk">▶️</div>
            <h3>İzlemeye devam edilecek bir şey yok</h3>
            <p>Bir bölüm izlemeye başladığında burada görünür.</p>
            <Link className="dugme dugme-birincil" href="/kesfet/">
              Kataloğa göz at
            </Link>
          </div>
        ) : (
          <>
            <div className="izgara">
              {devam.map((k) => (
                <div key={k.slug}>
                  <Kart
                    slug={k.slug}
                    ad={k.ad}
                    poster={k.poster}
                    yil={null}
                    puan={null}
                    format={null}
                    hedef={`/izle/?a=${encodeURIComponent(k.slug)}&b=${k.bolum}`}
                    altBilgi={`${k.bolum}. bölüm`}
                  />
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>
                    {tarihBicim(k.zaman)} · {Math.round(k.saniye / 60)} dk
                  </div>
                  <button
                    className="dugme dugme-sade dugme-kucuk"
                    style={{ marginTop: 6, width: '100%' }}
                    onClick={() => ilerlemeSil(k.slug)}
                  >
                    Kaydı sil
                  </button>
                </div>
              ))}
            </div>
            <div className="devam">
              <button
                className="dugme dugme-sade"
                onClick={() => {
                  if (window.confirm('Tüm izleme geçmişi silinsin mi?')) ilerlemeTemizle();
                }}
              >
                Tüm geçmişi temizle
              </button>
            </div>
          </>
        )
      ) : null}

      {sekme === 'izlenen' ? (
        izlenenSayisi === 0 ? (
          <div className="bos-durum">
            <div className="buyuk">✓</div>
            <h3>İzlenen bölüm yok</h3>
            <p>Bir bölümü 90 saniyeden uzun izlediğinde ya da “İzledim” dediğinde burada listelenir.</p>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--tx2)', marginBottom: 16 }}>
              <TikIkon boyut={14} /> Toplam {sayiBicim(izlenenSayisi)} bölüm izlendi olarak
              işaretli.
            </p>
            <div className="etiketler">
              {Object.keys(izlenenler)
                .sort((a, b) => (izlenenler[b] ?? 0) - (izlenenler[a] ?? 0))
                .slice(0, 300)
                .map((anahtar) => {
                  const [slug, no] = anahtar.split('|');
                  return (
                    <Link
                      key={anahtar}
                      className="etiket"
                      href={`/izle/?a=${encodeURIComponent(slug)}&b=${no}`}
                      title={`${tarihBicim(izlenenler[anahtar])} izlendi`}
                    >
                      {slug.replace(/-/g, ' ')} · {no}
                    </Link>
                  );
                })}
            </div>
          </>
        )
      ) : null}
    </div>
  );
}
