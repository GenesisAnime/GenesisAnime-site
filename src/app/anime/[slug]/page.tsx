import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import AnimeEylemler from '@/components/AnimeEylemler';
import BolumListesi from '@/components/BolumListesi';
import Kart from '@/components/Kart';
import { animeOku, fansublarDosyaOku, kunyeOku, serilerOku, tumSluglar } from '@/lib/veri';
import { durumAd, formatAd, jsonLdGuvenli, kisalt, puanBicim, sayiBicim, sureBicim } from '@/lib/bicim';
import { backdropSrcSet, tmdbKucuk } from '@/lib/gorsel';
import { SITE } from '@/lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return tumSluglar().map((slug) => ({ slug }));
}

const ILISKI_ADLARI: Record<string, string> = {
  SEQUEL: 'Devamı',
  PREQUEL: 'Öncesi',
  SIDE_STORY: 'Yan hikâye',
  SPIN_OFF: 'Spin-off',
  ALTERNATIVE: 'Alternatif versiyon',
  PARENT: 'Ana yapım',
  SUMMARY: 'Özet',
  OTHER: 'İlgili',
};

/**
 * Bant `srcSet` ipucu. Kolon genişliği: masaüstünde 1.480 − 2×28 (`.kap`) − 300 (afiş)
 * − 38 (ızgara boşluğu) = 1.086 px; ≤1100 px'te afiş 220 px + 26, ≤860 px'te 130 px + 18.
 */
const BANT_BOYUT =
  '(max-width: 860px) calc(100vw - 180px), (max-width: 1100px) calc(100vw - 302px), min(1086px, calc(100vw - 394px))';

const SEZON_ADLARI: Record<string, string> = {
  WINTER: 'Kış',
  SPRING: 'İlkbahar',
  SUMMER: 'Yaz',
  FALL: 'Sonbahar',
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const anime = animeOku(slug);
  if (!anime) return { title: 'Bulunamadı' };

  const bolumler = anime.bolumSayisi ? ` ${anime.bolumSayisi} bölüm,` : '';
  const aciklama =
    anime.ozet?.slice(0, 150) ??
    `${anime.ad}${anime.yil ? ` (${anime.yil})` : ''} —${bolumler} Türkçe altyazılı olarak GenesisAnime arşivinde.`;

  return {
    title: `${anime.ad}${anime.yil ? ` (${anime.yil})` : ''} Türkçe İzle`,
    description: aciklama,
    alternates: { canonical: `/anime/${anime.slug}/` },
    openGraph: {
      title: `${anime.ad} — GenesisAnime`,
      description: aciklama,
      type: 'video.tv_show',
      images: anime.banner || anime.poster ? [{ url: (anime.banner || anime.poster)! }] : undefined,
    },
  };
}

export default async function AnimeSayfasi({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const anime = animeOku(slug);
  if (!anime) notFound();

  const kunye = kunyeOku();

  // Fansub grubu kırılımı: kaç bölümde hangi grup geçiyor
  const grupSayaci = new Map<string, number>();
  for (const b of anime.bolumler) {
    const gorulen = new Set<string>();
    for (const e of b.ekip) {
      if (gorulen.has(e.g)) continue;
      gorulen.add(e.g);
      grupSayaci.set(e.g, (grupSayaci.get(e.g) ?? 0) + 1);
    }
  }
  const gruplar = [...grupSayaci.entries()].sort((a, b) => b[1] - a[1]) as [string, number][];

  const iliskiliVar = anime.iliski.some((i) => i.s);
  const puan = puanBicim(anime.puan);
  // Dekoratif bant sırası: 4K backdrop → TMDB (HD) → AniList banner'ı (1900 px tavanı).
  // HD katmanı, hâlâ banner'ı olmayan yapımların bandını da doldurur (bkz. tools/export-data.mjs).
  const bantTmdb = anime.banner4k ?? anime.bannerTmdb;
  const bant = bantTmdb ?? anime.banner;
  const bantGenislik = anime.banner4k ? anime.banner4kGenislik : anime.bannerTmdbGenislik;

  // Seri (franchise) ve fansub grup adresleri
  const seri = anime.seri ? serilerOku().seriler.find((s) => s.s === anime.seri) ?? null : null;
  const fansubSluglari = new Map(fansublarDosyaOku().gruplar.map((g) => [g.ad, g.s]));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': anime.format === 'MOVIE' ? 'Movie' : 'TVSeries',
    name: anime.ad,
    alternateName: anime.adEn ?? undefined,
    url: `${SITE.url}/anime/${anime.slug}/`,
    image: anime.poster ?? undefined,
    description: anime.ozet ?? undefined,
    inLanguage: 'tr',
    numberOfEpisodes: anime.bolumSayisi || undefined,
    genre: anime.turler,
    datePublished: anime.yil ? String(anime.yil) : undefined,
    aggregateRating: anime.puan
      ? { '@type': 'AggregateRating', ratingValue: (anime.puan / 10).toFixed(1), bestRating: '10', ratingCount: 1 }
      : undefined,
  };

  return (
    <div className="kap" style={{ paddingTop: 26 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdGuvenli(jsonLd) }} />

      <nav className="kirinti" aria-label="Sayfa yolu">
        <Link href="/">Ana Sayfa</Link>
        <span>/</span>
        <Link href="/kesfet/">Keşfet</Link>
        <span>/</span>
        <span>{anime.ad}</span>
      </nav>

      <div className="bilgi-izgara">
        <div>
          <div className="afis">
            {anime.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={anime.poster} alt={`${anime.ad} afişi`} fetchPriority="high" decoding="async" />
            ) : (
              <div className="kart-yer-tutucu">{anime.ad}</div>
            )}
          </div>

          <div className="istatistik" style={{ marginTop: 18 }}>
            <span style={{ display: 'block', marginBottom: 8, color: 'var(--tx2)', fontSize: 12.5 }}>
              İzleme listesi ve “devam et” bilgisi tarayıcında saklanır; hesap gerekmez.
            </span>
            <AnimeEylemler
              slug={anime.slug}
              ad={anime.ad}
              poster={anime.poster}
              yil={anime.yil}
              bolumSayisi={anime.bolumSayisi}
            />
          </div>
        </div>

        <div>
          {bant ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="anime-bant"
              src={bantTmdb ? tmdbKucuk(bantTmdb) : bant}
              srcSet={bantTmdb ? backdropSrcSet(bantTmdb, bantGenislik) : undefined}
              sizes={bantTmdb ? BANT_BOYUT : undefined}
              alt=""
              aria-hidden="true"
              decoding="async"
            />
          ) : null}

          <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 830, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            {anime.ad}
          </h1>
          {anime.adEn && anime.adEn !== anime.ad ? (
            <p style={{ color: 'var(--tx3)', fontSize: 14, marginTop: 6 }}>{anime.adEn}</p>
          ) : null}

          <div className="rozetler" style={{ marginTop: 18 }}>
            {puan ? (
              <div className="rozet">
                <b>★ {puan}</b>
                <span>puan</span>
              </div>
            ) : null}
            <div className="rozet">
              <b>{anime.yil ?? '—'}</b>
              <span>yıl</span>
            </div>
            <div className="rozet">
              <b>{formatAd(anime.format)}</b>
              <span>tür</span>
            </div>
            <div className="rozet">
              <b>{sayiBicim(anime.bolumSayisi)}</b>
              <span>bölüm</span>
            </div>
            {anime.sure ? (
              <div className="rozet">
                <b>{sureBicim(anime.sure)}</b>
                <span>bölüm süresi</span>
              </div>
            ) : null}
            <div className="rozet">
              <b>{sayiBicim(anime.kaynakSayisi)}</b>
              <span>kaynak</span>
            </div>
            <div className="rozet">
              <b>{durumAd(anime.durum)}</b>
              <span>durum</span>
            </div>
            {anime.sezon ? (
              <div className="rozet">
                <b>{SEZON_ADLARI[anime.sezon] ?? anime.sezon}</b>
                <span>sezon</span>
              </div>
            ) : null}
          </div>

          {anime.turler.length > 0 ? (
            <div className="etiketler" style={{ marginTop: 20 }}>
              {anime.turler.map((t) => (
                <Link key={t} className="etiket" href={`/kesfet/?tur=${encodeURIComponent(t)}`}>
                  {t}
                </Link>
              ))}
            </div>
          ) : null}

          {anime.ozet ? (
            <section style={{ marginTop: 26 }}>
              <h2 className="satir-baslik" style={{ fontSize: 17, marginBottom: 10 }}>
                Özet
              </h2>
              <p style={{ color: '#cdc4e0', lineHeight: 1.75, whiteSpace: 'pre-line' }}>{anime.ozet}</p>
            </section>
          ) : null}

          {anime.kaynakSayisi === 0 ? (
            <div className="uyari-kutu uyari" style={{ marginTop: 22 }}>
              <span aria-hidden="true">⚠️</span>
              <span>
                Bu yapımın arşivdeki kaynakları çalışmadığı için gizlendi. Farklı bir platformda
                yayında olup olmadığını aşağıdaki bağlantılardan kontrol edebilirsin.
              </span>
            </div>
          ) : null}

          {anime.fragman?.site === 'youtube' ? (
            <section style={{ marginTop: 26 }}>
              <h2 className="satir-baslik" style={{ fontSize: 17, marginBottom: 10 }}>
                Fragman
              </h2>
              <div className="oynatici-kutu" style={{ maxWidth: 640 }}>
                <iframe
                  src={`https://www.youtube.com/embed/${anime.fragman.id}`}
                  title={`${anime.ad} fragmanı`}
                  loading="lazy"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                />
              </div>
            </section>
          ) : null}

          {anime.yasal.length > 0 ? (
            <section style={{ marginTop: 26 }}>
              <h2 className="satir-baslik" style={{ fontSize: 17, marginBottom: 10 }}>
                Yasal izleme
              </h2>
              <p style={{ color: 'var(--tx3)', fontSize: 13, marginBottom: 10 }}>
                Bu yapım aşağıdaki platformlarda resmî olarak yayında. Desteğin için bu kanalları
                tercih edebilirsin.
              </p>
              <div className="etiketler">
                {anime.yasal.map((y) => (
                  <a
                    key={y.u}
                    className="etiket vurgu"
                    href={y.u}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {y.a} ↗
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <section style={{ marginTop: 46 }}>
        <BolumListesi
          slug={anime.slug}
          bolumler={anime.bolumler.map((b) => ({
            n: b.n,
            no: b.no,
            ad: b.ad,
            ks: b.ks,
            fansub: b.src[0]?.[1] ?? null,
            ekipSayisi: b.ekip.length,
          }))}
        />
      </section>

      {gruplar.length > 0 ? (
        <section style={{ marginTop: 46 }}>
          <div className="satir-basi">
            <h2 className="satir-baslik">Fansub ve çevirmen bilgisi</h2>
            <Link className="satir-tumu" href="/fansublar/">
              Tüm gruplar →
            </Link>
          </div>
          <p style={{ color: 'var(--tx3)', fontSize: 13, marginBottom: 14 }}>
            Bu yapımın bölümlerinde katkısı bulunan gruplar ve kapsadıkları bölüm sayısı.
          </p>
          <div className="etiketler">
            {gruplar.map(([grup, sayi]) => {
              const slug = fansubSluglari.get(grup);
              return slug ? (
                <Link key={grup} className="etiket" href={`/fansub/${slug}/`}>
                  {grup} · {sayi} bölüm
                </Link>
              ) : (
                <span key={grup} className="etiket" title="Grup dizininde bulunamadı">
                  {grup} · {sayi} bölüm
                </span>
              );
            })}
          </div>
        </section>
      ) : null}

      {seri && seri.uyeler.length > 1 ? (
        <section style={{ marginTop: 46 }}>
          <div className="satir-basi">
            <h2 className="satir-baslik">Serinin tamamı</h2>
            <Link className="satir-tumu" href={`/seri/${seri.s}/`}>
              {seri.ad} serisi →
            </Link>
          </div>
          <p style={{ color: 'var(--tx3)', fontSize: 13, marginBottom: 14 }}>
            İlişki kayıtlarından çıkarılan {seri.uyeler.length} yapımlık bağlantı ağı; bu yapım
            dâhil tümü kronolojik sırayla seri sayfasında.
          </p>
          <div className="izgara">
            {seri.uyeler.slice(0, 6).map((u) => (
              <Kart
                key={u.s}
                slug={u.s}
                ad={u.ad}
                poster={u.p}
                yil={u.yil}
                puan={null}
                format={null}
                altBilgi={u.s === anime.slug ? 'Bu yapım' : u.yil ? String(u.yil) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}

      {iliskiliVar ? (
        <section style={{ marginTop: 46 }}>
          <div className="satir-basi">
            <h2 className="satir-baslik">Sezonlar ve bağlantılı yapımlar</h2>
          </div>
          <div className="izgara">
            {anime.iliski
              .filter((i) => i.s)
              .map((i) => (
                <Kart
                  key={`${i.t}-${i.s}`}
                  slug={i.s!}
                  ad={i.ad}
                  poster={i.p}
                  yil={null}
                  puan={null}
                  format={i.f}
                  altBilgi={i.t ? ILISKI_ADLARI[i.t] ?? i.t : undefined}
                />
              ))}
          </div>
        </section>
      ) : null}

      {anime.iliski.some((i) => !i.s) ? (
        <section style={{ marginTop: 30 }}>
          <h3 style={{ fontSize: 14, color: 'var(--tx2)', marginBottom: 10 }}>
            Arşivde bulunmayan bağlantılı yapımlar
          </h3>
          <div className="etiketler">
            {anime.iliski
              .filter((i) => !i.s)
              .map((i, sira) => (
                <span key={`${i.ad}-${sira}`} className="etiket" title="Arşivde yok">
                  {i.ad}
                  {i.t ? ` · ${ILISKI_ADLARI[i.t] ?? i.t}` : ''}
                </span>
              ))}
          </div>
        </section>
      ) : null}

      <p className="gizli-gorsel">
        Arşiv künyesi: {sayiBicim(kunye.anime)} anime, {sayiBicim(kunye.bolum)} bölüm.
        {anime.ozet ? ` ${kisalt(anime.ozet, 200)}` : ''}
      </p>
    </div>
  );
}
