'use client';
/**
 * IzleIstemci.tsx — oynatıcı çekirdeği
 *
 * Akış: /izle/?a=<slug>&b=<bölüm sırası>
 *  1. anime verisi (public/data/anime/<slug>.json) ve player güvenilirliği indirilir
 *  2. bölümün kaynakları listelenir; kullanıcının "çalışmıyor" dedikleri gizlenir
 *  3. doğrulanmış + tercih edilen player öne alınarak bir kaynak seçilir
 *  4. kaynak iframe ile gömülür (video barındırılmaz, üçüncü taraf sayfa gösterilir)
 *  5. sayfada geçirilen süre ölçülür ve "izlemeye devam et" kaydı güncellenir
 *  6. kaynak postMessage API'si yayınlıyorsa (VK, ölçüldü) gerçek konum/süre
 *     köprüden okunur ve oynat/duraklat/sar komutları gönderilir
 *
 * Kısıt (dürüstçe): iframe içeriği farklı kaynakta olduğu için videonun gerçek
 * oynatma konumu/süresi **yalnızca** API yayınlayan host'ta okunabilir. Ölçüm
 * (tools/kopru-test.html): kaynakların ~%7'si (VK) konuşuyor, ~%42'si (Sibnet)
 * tamamen opak. Opak kaynakta ilerleme "sayfada geçirilen süre" olarak tutulur
 * ve bölüm 90 saniye sonra izlendi sayılır.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Anime, Taksonomi } from '@/lib/tipler';
import { animeVeriYolu, genelYol } from '@/lib/yollar';
import { bolumNumarasi, embedUygun, kaynakEtiketi, kaynakGrubu, kaynakGrupla, playerAd, sayiBicim } from '@/lib/bicim';
import { bildirimGonder } from '@/lib/bildirim';
import {
  KOMUT_DENEME_ARASI_MS,
  KOMUT_DENEME_SAYISI,
  komutlar,
  komutOnaylandi,
  kopruBul,
  kopruOrigin,
  kaynakAdresi,
  medyaSaati,
  olayCoz,
  type KopruEylem,
} from '@/lib/kopru';
import { useBaglandi, useCalismayanlar, useTercihler } from '@/lib/depo/kanca';
import {
  calismayanIsaretle,
  ilerlemeKaydet,
  izlenenEkle,
  izlenenHaritasi,
  konumKaydet,
  konumOku,
  tercihKaydet,
} from '@/lib/depo/yerel';
import { AraIkon, DisBaglantiIkon, OynatIkon, SagIkon, SolIkon, TikIkon } from './Ikon';

const IZLENDI_SAYILMA_SANIYESI = 90;

export default function IzleIstemci() {
  const aramalar = useSearchParams();
  const router = useRouter();
  const slug = aramalar.get('a') ?? '';
  const bParam = aramalar.get('b');

  const baglandi = useBaglandi();
  const calismayanlar = useCalismayanlar();
  const tercihler = useTercihler();

  const [anime, setAnime] = useState<Anime | null>(null);
  const [taksonomi, setTaksonomi] = useState<Taksonomi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const [bolumSira, setBolumSira] = useState(1);
  const [kaynakSira, setKaynakSira] = useState(0);
  const [saniye, setSaniye] = useState(0);
  const [tamEkran, setTamEkran] = useState(false);
  const [bildirildi, setBildirildi] = useState(false);

  const kutuRef = useRef<HTMLDivElement>(null);
  const saniyeRef = useRef(0);
  const izlendiRef = useRef(false);
  saniyeRef.current = saniye;

  /* ------------------------- veri indirme ------------------------- */

  useEffect(() => {
    if (!slug) {
      setYukleniyor(false);
      setHata('adres-yok');
      return;
    }
    let iptal = false;
    setYukleniyor(true);
    setHata(null);

    Promise.all([
      fetch(animeVeriYolu(slug)).then((y) => {
        if (y.status === 404) throw new Error('404');
        if (!y.ok) throw new Error(String(y.status));
        return y.json() as Promise<Anime>;
      }),
      fetch(genelYol('/data/taksonomi.json'))
        .then((y) => (y.ok ? (y.json() as Promise<Taksonomi>) : null))
        .catch(() => null),
    ])
      .then(([a, t]) => {
        if (iptal) return;
        setAnime(a);
        setTaksonomi(t);
        setYukleniyor(false);
      })
      .catch((e: Error) => {
        if (iptal) return;
        setHata(e.message === '404' ? 'bulunamadi' : 'ag-hatasi');
        setYukleniyor(false);
      });

    return () => {
      iptal = true;
    };
  }, [slug]);

  /* --------------------- bölüm seçimi ve adres --------------------- */

  useEffect(() => {
    if (!anime) return;
    const istenen = Number(bParam);
    if (Number.isFinite(istenen) && istenen >= 1) {
      const varMi = anime.bolumler.some((b) => b.n === istenen);
      setBolumSira(varMi ? istenen : (anime.bolumler[0]?.n ?? 1));
      return;
    }
    // bölüm belirtilmemiş: kayıtlı ilerleme varsa oradan devam et
    const kayit = ilerlemeKaydetYoksaDevam();
    setBolumSira(kayit ?? anime.bolumler[0]?.n ?? 1);

    function ilerlemeKaydetYoksaDevam(): number | null {
      try {
        const ham = window.localStorage.getItem('genesisanime:v1:ilerleme');
        if (!ham) return null;
        const harita = JSON.parse(ham) as Record<string, { bolum: number }>;
        return harita[slug]?.bolum ?? null;
      } catch {
        return null;
      }
    }
  }, [anime, bParam, slug]);

  // bölüm değişince kaynak seçimini başa al
  useEffect(() => {
    setKaynakSira(0);
    setBildirildi(false);
  }, [bolumSira]);

  const bolum = useMemo(
    () => anime?.bolumler.find((b) => b.n === bolumSira) ?? anime?.bolumler[0] ?? null,
    [anime, bolumSira]
  );

  /* --------------------------- kaynaklar --------------------------- */

  const kaynaklar = useMemo(() => {
    if (!bolum) return [];
    const temiz = bolum.src.filter((k) => !calismayanlar.includes(k[2]));
    const dayanak = temiz.length ? temiz : bolum.src;
    return [...dayanak].sort((x, y) => {
      if (tercihler.dogrulanmisOncelik) {
        const dx = x[3] === 'ok' ? 0 : 1;
        const dy = y[3] === 'ok' ? 0 : 1;
        if (dx !== dy) return dx - dy;
      }
      if (tercihler.kaynakTercihi) {
        const px = x[0] === tercihler.kaynakTercihi ? 0 : 1;
        const py = y[0] === tercihler.kaynakTercihi ? 0 : 1;
        if (px !== py) return px - py;
      }
      return 0;
    });
  }, [bolum, calismayanlar, tercihler.dogrulanmisOncelik, tercihler.kaynakTercihi]);

  /** Bölümdeki fansub grupları ve kaynak sayıları — süzgeç düğmeleri buradan üretilir. */
  const epkGruplari = useMemo(() => {
    if (!bolum) return [] as { ad: string; sayi: number }[];
    const harita = new Map<string, number>();
    for (const k of bolum.src) {
      const ad = kaynakGrubu(k);
      harita.set(ad, (harita.get(ad) ?? 0) + 1);
    }
    return [...harita]
      .map(([ad, sayi]) => ({ ad, sayi }))
      .sort((a, b) => b.sayi - a.sayi || a.ad.localeCompare(b.ad, 'tr'));
  }, [bolum]);

  const seciliFansublar: string[] = tercihler.fansubSuzgeci ?? [];
  // Seçilen gruplardan hiçbiri bu bölümde yoksa süzgeci uygulamayız: kullanıcı boş listeyle
  // baş başa kalmamalı (dizi/film aralarında fansub kadrosu tamamen değişebiliyor).
  const gecerliSecim = useMemo(
    () => seciliFansublar.filter((g) => epkGruplari.some((e) => e.ad === g)),
    [seciliFansublar, epkGruplari]
  );

  const gosterilenKaynaklar = useMemo(
    () => (gecerliSecim.length ? kaynaklar.filter((k) => gecerliSecim.includes(kaynakGrubu(k))) : kaynaklar),
    [kaynaklar, gecerliSecim]
  );

  // Süzgeç değişince seçili kaynak başa döner (aksi hâlde kaynak "kaybolmuş" görünür).
  useEffect(() => setKaynakSira(0), [gecerliSecim]);

  const aktifKaynak =
    gosterilenKaynaklar[Math.min(kaynakSira, Math.max(0, gosterilenKaynaklar.length - 1))] ?? null;

  const guvenlik = useMemo(() => {
    const harita = new Map<string, { guvenilirlik: number; ok: number; kontrol: number }>();
    for (const p of taksonomi?.playerlar ?? []) {
      harita.set(p.ad, { guvenilirlik: p.guvenilirlik, ok: p.ok, kontrol: p.kontrol });
    }
    return harita;
  }, [taksonomi]);

  /* ---------------------- gömülü oynatıcı köprüsü ---------------------- */
  /* Bazı host'lar resmî postMessage API'si yayınlıyor; ölçüm sonuçları ve
     yetenek farkındalığı `@/lib/kopru` içinde. Kural: **kanıtlanmamış** host'a
     kontrol düğmesi gösterilmez (ölü düğme, düğmesizlikten kötüdür). */

  const kopru = useMemo(() => (aktifKaynak ? kopruBul(aktifKaynak[2]) : null), [aktifKaynak]);
  /** iframe'e giden adres: sarmalayıcı çözülür, destekli host'ta API açılır. */
  const iframeAdresi = useMemo(() => (aktifKaynak ? kaynakAdresi(aktifKaynak[2]) : ''), [aktifKaynak]);

  const cerceveRef = useRef<HTMLIFrameElement>(null);
  const [konum, setKonum] = useState(0);
  const [gercekSure, setGercekSure] = useState(0);
  const [oynuyor, setOynuyor] = useState<boolean | null>(null);
  const [kopruHazir, setKopruHazir] = useState(false);
  const [kaldigiYer, setKaldigiYer] = useState(0);
  const sonKayitRef = useRef(0);
  const bekleyenRef = useRef<{ eylem: KopruEylem; hedef: number; deneme: number; zamanlayici: number | null } | null>(
    null
  );

  /**
   * Komutu gönderir ve **onaylanana kadar yineler**. Ölçümde komut, oynatıcı
   * dinleyiciyi kurmadan gönderildiğinde sessizce kayboluyordu; bu yüzden
   * "gönderdim" ile "oldu" ayrı şeyler sayılır.
   */
  const komutGonder = useCallback(
    (eylem: KopruEylem, hedef = 0) => {
      if (!kopru?.komut || !cerceveRef.current?.contentWindow) return;
      if (bekleyenRef.current?.zamanlayici) window.clearTimeout(bekleyenRef.current.zamanlayici);
      const bekleyen = { eylem, hedef, deneme: 0, zamanlayici: null as number | null };
      bekleyenRef.current = bekleyen;
      const gonder = () => {
        const pencere = cerceveRef.current?.contentWindow;
        if (!pencere) return;
        /* Yükler **nesne** olarak gider: metin biçimi ölçümde cevapsız kaldı. */
        for (const yuk of komutlar(kopru.ad, eylem, hedef)) {
          try {
            pencere.postMessage(yuk, '*');
            pencere.postMessage(yuk, kopruOrigin(kopru.ad));
          } catch {
            /* kaynak penceresi değişmiş olabilir; deneme döngüsü devam eder */
          }
        }
        bekleyen.deneme += 1;
        if (bekleyen.deneme < KOMUT_DENEME_SAYISI) {
          bekleyen.zamanlayici = window.setTimeout(gonder, KOMUT_DENEME_ARASI_MS);
        }
      };
      gonder();
    },
    [kopru]
  );

  useEffect(() => {
    if (!kopru) return;
    setKopruHazir(false);
    setKonum(0);
    setGercekSure(0);
    setOynuyor(null);
    sonKayitRef.current = 0;
    const dinle = (olay: MessageEvent) => {
      if (olay.origin !== kopruOrigin(kopru.ad)) return;
      const cikti = olayCoz(olay.data);
      if (cikti.tur === 'yok') return;
      if (cikti.tur === 'hazir') setKopruHazir(true);
      if (typeof cikti.sure === 'number' && cikti.sure > 0) setGercekSure(Math.round(cikti.sure));
      if (typeof cikti.saniye === 'number') setKonum(Math.max(0, Math.round(cikti.saniye)));
      if (typeof cikti.oynuyor === 'boolean') setOynuyor(cikti.oynuyor);
      const bekleyen = bekleyenRef.current;
      if (bekleyen && komutOnaylandi(bekleyen.eylem, bekleyen.hedef, cikti)) {
        if (bekleyen.zamanlayici) window.clearTimeout(bekleyen.zamanlayici);
        bekleyenRef.current = null;
      }
    };
    window.addEventListener('message', dinle);
    return () => window.removeEventListener('message', dinle);
  }, [kopru]);

  /* Bileşen sökerken bekleyen komut zamanlayıcısı kalmasın. */
  useEffect(
    () => () => {
      if (bekleyenRef.current?.zamanlayici) window.clearTimeout(bekleyenRef.current.zamanlayici);
    },
    []
  );

  /* Kaldığı yeri oku ve gerçek konumu (15 sn'de bir) cihazda sakla. */
  useEffect(() => {
    if (!anime || !bolum || !kopru?.telemetri) return;
    setKaldigiYer(konumOku(anime.slug, bolum.n));
  }, [anime, bolum, kopru]);

  useEffect(() => {
    if (!anime || !bolum || !kopru?.telemetri || !gercekSure) return;
    if (Math.abs(konum - sonKayitRef.current) < 15) return;
    sonKayitRef.current = konum;
    konumKaydet(anime.slug, bolum.n, konum);
  }, [anime, bolum, kopru, konum, gercekSure]);

  /* -------------------------- ilerleme kaydı -------------------------- */

  useEffect(() => {
    if (!anime || !bolum) return;
    izlendiRef.current = Boolean(izlenenHaritasi()[`${anime.slug}|${bolum.n}`]);
    setSaniye(0);
  }, [anime, bolum]);

  useEffect(() => {
    if (!anime || !bolum) return;
    const zamanlayici = setInterval(() => setSaniye((s) => s + 1), 1000);
    return () => clearInterval(zamanlayici);
  }, [anime, bolum]);

  const kaydet = useCallback(() => {
    if (!anime || !bolum) return;
    const izlendi = saniyeRef.current >= IZLENDI_SAYILMA_SANIYESI || izlendiRef.current;
    ilerlemeKaydet(
      {
        slug: anime.slug,
        ad: anime.ad,
        poster: anime.poster,
        bolum: bolum.n,
        bolumAdi: bolum.ad || `${bolumNumarasi(bolum.no, bolum.n)}. Bölüm`,
        saniye: saniyeRef.current,
      },
      izlendi
    );
    if (izlendi) izlendiRef.current = true;
  }, [anime, bolum]);

  useEffect(() => {
    const zamanlayici = setInterval(kaydet, 15000);
    return () => {
      clearInterval(zamanlayici);
      kaydet();
    };
  }, [kaydet]);

  /* --------------------------- gezinme --------------------------- */

  const oncekiVar = bolum ? anime?.bolumler.some((b) => b.n === bolum.n - 1) : false;
  const sonrakiVar = bolum ? anime?.bolumler.some((b) => b.n === bolum.n + 1) : false;

  const bolumeGit = useCallback(
    (n: number) => {
      if (!anime) return;
      if (!anime.bolumler.some((b) => b.n === n)) return;
      kaydet();
      setBolumSira(n);
      router.replace(`/izle/?a=${encodeURIComponent(anime.slug)}&b=${n}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [anime, kaydet, router]
  );

  /* -------------------------- klavye kısayolları -------------------------- */

  useEffect(() => {
    const tusla = (e: KeyboardEvent) => {
      const hedef = e.target as HTMLElement | null;
      if (hedef && (hedef.tagName === 'INPUT' || hedef.tagName === 'TEXTAREA' || hedef.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') {
        if (sonrakiVar) {
          e.preventDefault();
          bolumeGit(bolumSira + 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'p' || e.key === 'P') {
        if (oncekiVar) {
          e.preventDefault();
          bolumeGit(bolumSira - 1);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        tamEkranAc();
      } else if (/^[1-9]$/.test(e.key)) {
        const hedefSira = Number(e.key) - 1;
        if (hedefSira < gosterilenKaynaklar.length) {
          e.preventDefault();
          setKaynakSira(hedefSira);
        }
      }
    };
    window.addEventListener('keydown', tusla);
    return () => window.removeEventListener('keydown', tusla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sonrakiVar, oncekiVar, bolumSira, gosterilenKaynaklar.length, bolumeGit]);

  function tamEkranAc() {
    const el = kutuRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    el.requestFullscreen?.().catch(() => undefined);
  }

  useEffect(() => {
    const dinle = () => setTamEkran(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', dinle);
    return () => document.removeEventListener('fullscreenchange', dinle);
  }, []);

  /* ------------------------------- durumlar ------------------------------- */

  if (!slug || hata === 'adres-yok') {
    return (
      <div className="kap">
        <div className="bos-durum">
          <div className="buyuk">🎬</div>
          <h3>İzlemek için bir yapım seç</h3>
          <p>Oynatıcı doğrudan bağlantıyla çalışır: /izle/?a=anime-adresi&amp;b=1</p>
          <Link className="dugme dugme-birincil" href="/kesfet/">
            Kataloğa göz at
          </Link>
        </div>
      </div>
    );
  }

  if (yukleniyor) {
    return (
      <div className="kap" style={{ paddingTop: 30 }}>
        <div className="iskelet" style={{ height: 30, width: 260, marginBottom: 18 }} />
        <div className="oynatici-izgara">
          <div className="iskelet" style={{ height: 420, borderRadius: 14 }} />
          <div className="iskelet" style={{ height: 320, borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  if (hata || !anime) {
    return (
      <div className="kap">
        <div className="bos-durum">
          <div className="buyuk">🔌</div>
          <h3>Yapım bulunamadı</h3>
          <p>
            {hata === 'ag-hatasi'
              ? 'Veri indirilemedi. Bağlantını kontrol edip yeniden dene.'
              : 'Bu adrese karşılık gelen bir yapım arşivde yok.'}
          </p>
          <Link className="dugme dugme-birincil" href="/kesfet/">
            Kataloğa dön
          </Link>
        </div>
      </div>
    );
  }

  const gruplar = kaynakGrupla(gosterilenKaynaklar);
  const seciliK = gosterilenKaynaklar[Math.min(kaynakSira, gosterilenKaynaklar.length - 1)] ?? null;
  const seciliEkip = seciliK && bolum ? bolum.ekip.find((e) => e.g === seciliK[1]) ?? null : null;
  const guven = seciliK ? guvenlik.get(seciliK[0]) : undefined;
  const gomulebilir = seciliK ? embedUygun(seciliK[2]) : true;

  return (
    <div className="kap" style={{ paddingTop: 22 }}>
      <nav className="kirinti" aria-label="Sayfa yolu">
        <Link href="/">Ana Sayfa</Link>
        <span>/</span>
        <Link href={`/anime/${anime.slug}/`}>{anime.ad}</Link>
        <span>/</span>
        <span>{bolum ? bolumNumarasi(bolum.no, bolum.n) : ''}. bölüm</span>
      </nav>

      <div className="oynatici-izgara">
        <div>
          <div className="oynatici-kutu" ref={kutuRef}>
            {aktifKaynak && gomulebilir ? (
              <iframe
                key={aktifKaynak[2]}
                ref={cerceveRef}
                src={iframeAdresi}
                title={`${anime.ad} ${bolumNumarasi(bolum?.no ?? null, bolumSira)}. bölüm — ${playerAd(aktifKaynak[0])}`}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                referrerPolicy="no-referrer"
                loading="eager"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
              />
            ) : (
              <div className="oynatici-bos">
                <div>
                  <h3>{aktifKaynak ? 'Bu kaynak siteye gömülemiyor' : 'Çalışan kaynak bulunamadı'}</h3>
                  <p>
                    {aktifKaynak
                      ? `${playerAd(aktifKaynak[0])} gömülü oynatmayı engelliyor. Kaynağı yeni sekmede açabilir ya da başka bir kaynak seçebilirsin.`
                      : 'Bu bölüm için kayıtlı kaynakların tümü çalışmıyor olarak işaretlenmiş. Sağdaki listeden başka bir kaynak deneyebilir veya başka bir kaynak grubuna geçebilirsin.'}
                  </p>
                  {aktifKaynak ? (
                    <a className="dugme dugme-birincil" href={aktifKaynak[2]} target="_blank" rel="noreferrer noopener">
                      <DisBaglantiIkon /> Yeni sekmede aç
                    </a>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* Köprü şeridi: gerçek konum/süre ve (kanıtlanmışsa) kendi kontrollerimiz. */}
          {aktifKaynak && gomulebilir && kopru ? (
            <div className="oynatici-kopru">
              <span className={`oynatici-kopru-nokta${kopruHazir ? ' canli' : ''}`} aria-hidden="true" />
              <span className="oynatici-kopru-ad">{kopru.etiket}</span>
              {kopru.telemetri && gercekSure ? (
                <span className="oynatici-kopru-saat">
                  {medyaSaati(konum)} / {medyaSaati(gercekSure)}
                </span>
              ) : null}

              {kopru.komut ? (
                <span className="oynatici-kopru-dugmeler">
                  <button
                    className="dugme dugme-sade"
                    onClick={() => komutGonder(oynuyor ? 'duraklat' : 'oynat')}
                    title="Oynat/duraklat (köprü üzerinden)"
                  >
                    {oynuyor ? '❚❚ Duraklat' : '▶ Oynat'}
                  </button>
                  <button
                    className="dugme dugme-sade"
                    onClick={() => komutGonder('sar', Math.max(0, konum - 10))}
                    title="10 saniye geri"
                  >
                    −10 sn
                  </button>
                  <button className="dugme dugme-sade" onClick={() => komutGonder('sar', konum + 10)} title="10 saniye ileri">
                    +10 sn
                  </button>
                  {kaldigiYer > 30 ? (
                    <button
                      className="dugme dugme-sade"
                      onClick={() => {
                        komutGonder('sar', kaldigiYer);
                        window.setTimeout(() => komutGonder('oynat'), 1500);
                      }}
                      title="Bu cihazda kayıtlı konuma dön"
                    >
                      Kaldığın yerden: {medyaSaati(kaldigiYer)}
                    </button>
                  ) : null}
                </span>
              ) : (
                <span className="oynatici-kopru-not">
                  Bu kaynak kendi oynatıcısını kullanır; oynatma konumu okunamaz.
                </span>
              )}
            </div>
          ) : null}

          <div className="oynatici-cubuk">
            <div className="oynatici-cubuk-grup">
              <button className="dugme dugme-sade" onClick={() => bolumeGit(bolumSira - 1)} disabled={!oncekiVar}>
                <SolIkon boyut={16} /> Önceki
              </button>
              <button
                className={`dugme ${sonrakiVar ? 'dugme-birincil' : 'dugme-sade'}`}
                onClick={() => bolumeGit(bolumSira + 1)}
                disabled={!sonrakiVar}
                title="Sonraki bölüm (kısayol: →)"
              >
                Sonraki <SagIkon boyut={16} />
              </button>
              <button className="dugme dugme-sade" onClick={tamEkranAc}>
                {tamEkran ? 'Tam ekrandan çık' : 'Tam ekran'} <span style={{ fontSize: 11, color: 'var(--tx3)' }}>F</span>
              </button>
            </div>

            <div className="oynatici-cubuk-grup">
              {aktifKaynak ? (
                <a className="dugme dugme-sade" href={aktifKaynak[2]} target="_blank" rel="noreferrer noopener">
                  <DisBaglantiIkon /> Kaynağı aç
                </a>
              ) : null}
              <button
                className="dugme dugme-sade"
                disabled={bildirildi || !aktifKaynak}
                onClick={() => {
                  if (!aktifKaynak) return;
                  calismayanIsaretle(aktifKaynak[2]);
                  // API tanımlıysa bildirimi sunucuya da ilet (tarama önceliği).
                  bildirimGonder({ url: aktifKaynak[2], anime: slug, bolum: bolumSira });
                  setBildirildi(true);
                  if (kaynakSira + 1 < gosterilenKaynaklar.length) setKaynakSira(kaynakSira + 1);
                }}
              >
                {bildirildi ? 'Bildirildi, teşekkürler' : 'Kaynak çalışmıyor'}
              </button>
              <button className="dugme dugme-sade" onClick={kaydet} title="Bu bölümü izlendi olarak işaretle">
                <TikIkon boyut={15} /> İzledim
              </button>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
            {seciliK && !gomulebilir ? (
              <div className="uyari-kutu uyari">
                <span aria-hidden="true">⚠️</span>
                <span>
                  <b>{playerAd(seciliK[0])}</b> dosya paylaşım servisi olduğu için gömülü
                  oynatmayı desteklemez; kaynak yeni sekmede açılır.
                </span>
              </div>
            ) : null}

            <div className="uyari-kutu bilgi">
              <span aria-hidden="true">🛡️</span>
              <span>
                Video bu sitede barındırılmaz; oynatma <b>{aktifKaynak ? playerAd(aktifKaynak[0]) : 'üçüncü taraf'}</b>{' '}
                sunucularında gerçekleşir. Reklam/sekme açılması o platformun davranışıdır, kaynağı
                değiştirerek bundan kaçınabilirsin.
              </span>
            </div>

            {bolum && bolum.ks === 0 ? (
              <div className="uyari-kutu hata">
                <span aria-hidden="true">⛔</span>
                <span>Bu bölümün kaynakları arşivde çalışmadığı için gizlendi.</span>
              </div>
            ) : null}
          </div>
        </div>

        <aside style={{ display: 'grid', gap: 16 }}>
          <div className="kaynak-panel">
            <h3>
              Kaynaklar{' '}
              <span style={{ color: 'var(--tx3)', fontWeight: 500 }}>
                ({sayiBicim(gosterilenKaynaklar.length)}
                {gecerliSecim.length ? ` / ${sayiBicim(kaynaklar.length)}` : ''})
              </span>
            </h3>
            <p className="ipucu">
              {bolum ? `${bolumNumarasi(bolum.no, bolum.n)}. bölüm · ${sayiBicim(bolum.ekip.length)} ekip kaydı` : ''}
              {gosterilenKaynaklar.length > 1 ? ' · klavyeden 1-9 ile hızlı seçim' : ''}
            </p>

            {epkGruplari.length > 1 || seciliFansublar.length > 0 ? (
              <div className="fansub-suzgec">
                <div className="suzgec-basi">
                  <span>Fansub süzgeci</span>
                  {seciliFansublar.length > 0 ? (
                    <button className="suzgec-temizle" onClick={() => tercihKaydet({ fansubSuzgeci: [] })}>
                      Tümünü göster
                    </button>
                  ) : null}
                </div>
                <div className="suzgec-dugmeleri">
                  {epkGruplari.map((e) => {
                    const secili = seciliFansublar.includes(e.ad);
                    return (
                      <button
                        key={e.ad}
                        className={`suzgec-dugme${secili ? ' etkin' : ''}`}
                        aria-pressed={secili}
                        title={`${e.ad} — bu bölümde ${e.sayi} kaynak`}
                        onClick={() =>
                          tercihKaydet({
                            fansubSuzgeci: secili
                              ? seciliFansublar.filter((g) => g !== e.ad)
                              : [...seciliFansublar, e.ad],
                          })
                        }
                      >
                        <span className="suzgec-ad">{e.ad}</span>
                        <span className="suzgec-sayi">{e.sayi}</span>
                      </button>
                    );
                  })}
                </div>
                {seciliFansublar.length > 0 && gecerliSecim.length === 0 ? (
                  <p className="suzgec-not">
                    Seçtiğin {sayiBicim(seciliFansublar.length)} fansub bu bölümde yok; tüm kaynaklar
                    listeleniyor.
                  </p>
                ) : null}
              </div>
            ) : null}

            {gosterilenKaynaklar.length === 0 ? (
              <div className="uyari-kutu uyari">
                <span aria-hidden="true">⚠️</span>
                <span>Bu bölüm için kaynak yok.</span>
              </div>
            ) : (
              gruplar.map((g) => {
                const guv = guvenlik.get(g.player);
                return (
                  <div className="kaynak-grup" key={g.player}>
                    <div className="kaynak-grup-basi">
                      <span>
                        {playerAd(g.player)} <span style={{ color: 'var(--tx3)' }}>· {g.kaynaklar.length}</span>
                      </span>
                      {guv && guv.kontrol > 0 ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="guven-cubuk" title={`${guv.ok}/${guv.kontrol} kaynak çalışıyor`}>
                            <span style={{ width: `${Math.round(guv.guvenilirlik * 100)}%` }} />
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
                            %{Math.round(guv.guvenilirlik * 100)}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    <div className="cipler">
                      {g.kaynaklar.map(({ k, sira: i }) => (
                        <button
                          key={`${k[2]}-${i}`}
                          className={`cip${i === kaynakSira ? ' etkin' : ''}`}
                          onClick={() => setKaynakSira(i)}
                          title={`${playerAd(k[0])} · ${kaynakEtiketi(k)}${k[1] ? ` · ${k[1]}` : ''}`}
                        >
                          {k[3] === 'ok' ? (
                            <span className="ok-isaret" title="Çalıştığı doğrulanmış">
                              ✓
                            </span>
                          ) : (
                            <OynatIkon boyut={11} />
                          )}
                          {k[1] && k[1] !== k[0] ? <span className="fansub">{k[1]}</span> : null}
                          <span>#{i + 1}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            {seciliEkip ? (
              <div className="ekip-bilgi">
                <b>{seciliEkip.g}</b>
                {seciliEkip.e ? <div style={{ marginTop: 4 }}>{seciliEkip.e}</div> : null}
              </div>
            ) : null}

            {guven && guven.kontrol > 0 ? (
              <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
                {playerAd(seciliK![0])} için bugüne kadar {sayiBicim(guven.kontrol)} kaynak kontrol
                edildi, {sayiBicim(guven.ok)} tanesi çalışıyor.
              </p>
            ) : null}
          </div>

          <div className="kaynak-panel">
            <h3>
              Bölümler <span style={{ color: 'var(--tx3)', fontWeight: 500 }}>({sayiBicim(anime.bolumler.length)})</span>
            </h3>
            <p className="ipucu">Klavyeden ← → ile bölüm değiştir.</p>
            <div className="bolum-numaralari">
              {anime.bolumler.map((b) => {
                const izlendi = baglandi ? Boolean(izlenenHaritasi()[`${anime.slug}|${b.n}`]) : false;
                const etkin = b.n === bolumSira;
                return (
                  <button
                    key={b.n}
                    className={`bolum-numara${etkin ? ' etkin' : ''}${izlendi ? ' izlendi' : ''}`}
                    onClick={() => bolumeGit(b.n)}
                    title={b.ad || `${b.n}. bölüm`}
                    disabled={b.ks === 0}
                  >
                    {bolumNumarasi(b.no, b.n)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="kaynak-panel">
            <h3>Kısayollar</h3>
            <table className="tablo" style={{ fontSize: 12.5 }}>
              <tbody>
                <tr>
                  <td>Sonraki / önceki bölüm</td>
                  <td className="sayi">← →</td>
                </tr>
                <tr>
                  <td>Kaynak seç</td>
                  <td className="sayi">1-9</td>
                </tr>
                <tr>
                  <td>Tam ekran</td>
                  <td className="sayi">F</td>
                </tr>
                <tr>
                  <td>Arama</td>
                  <td className="sayi">/</td>
                </tr>
              </tbody>
            </table>
          </div>
        </aside>
      </div>

      <div style={{ marginTop: 30, color: 'var(--tx2)', fontSize: 14 }}>
        <AraIkon boyut={14} />{' '}
        <Link href={`/anime/${anime.slug}/`} style={{ color: 'var(--ac2)' }}>
          {anime.ad}
        </Link>{' '}
        · bölüm bilgileri, özet ve fansub künyesi için detay sayfasına dön.
      </div>
    </div>
  );
}
