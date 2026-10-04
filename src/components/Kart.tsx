import Link from 'next/link';
import { puanBicim, sayiBicim } from '@/lib/bicim';
import { POSTER_SIZES, posterSrcSet } from '@/lib/gorsel';

export interface KartVerisi {
  slug: string;
  ad: string;
  poster: string | null;
  yil: number | null;
  puan: number | null;
  format: string | null;
  bolumSayisi?: number;
  kaynakSayisi?: number;
  /** 0-1 arası izleme yüzdesi */
  ilerleme?: number;
  izlendi?: boolean;
  /** kartın gideceği adres (varsayılan: anime detayı) */
  hedef?: string;
  /** hedef açıklaması (ör. "12. bölüm") */
  altBilgi?: string;
}

export default function Kart({
  slug,
  ad,
  poster,
  yil,
  puan,
  format,
  bolumSayisi,
  kaynakSayisi,
  ilerleme,
  izlendi,
  hedef,
  altBilgi,
}: KartVerisi) {
  const puanMetni = puanBicim(puan);
  return (
    <Link className="kart" href={hedef ?? `/anime/${slug}/`} title={ad}>
      <div className="kart-gorsel">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            srcSet={posterSrcSet(poster) ?? undefined}
            sizes={POSTER_SIZES}
            alt={ad}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="kart-yer-tutucu">{ad}</div>
        )}

        {puanMetni ? (
          <span className="kart-rozet puan" title="AniList puanı">
            ★ {puanMetni}
          </span>
        ) : null}

        {izlendi ? (
          <span className="kart-izlendi" title="İzlendi">
            ✓
          </span>
        ) : null}

        {(kaynakSayisi ?? 0) > 0 ? (
          <span className="kart-rozet dogrulanmis" title="İzlenebilir kaynak sayısı">
            ▶ {sayiBicim(kaynakSayisi)}
          </span>
        ) : null}

        {typeof ilerleme === 'number' && ilerleme > 0 ? (
          <div className="kart-ilerleme">
            <span style={{ width: `${Math.min(100, Math.round(ilerleme * 100))}%` }} />
          </div>
        ) : null}
      </div>

      <div className="kart-alt">
        <div className="kart-ad">{ad}</div>
        <div className="kart-meta">
          {altBilgi ? <span>{altBilgi}</span> : null}
          {yil ? <span>{yil}</span> : null}
          {bolumSayisi ? <span>{bolumSayisi} bölüm</span> : null}
          {!altBilgi && format ? <span>{format}</span> : null}
        </div>
      </div>
    </Link>
  );
}
