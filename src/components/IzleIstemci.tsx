'use client';
/**
 * IzleIstemci.tsx — oynatıcı çekirdeği
 *
 * Akış: /izle/?a=<slug>&b=<bölüm sırası>
 *  1. anime verisi (public/data/anime/<slug>.json) ve player güvenilirliği indirilir
 *  2. bölümün kaynakları listelenir; kullanıcının "çalışmıyor" dedikleri gizlenir
 *  3. doğrulanmış + tercih edilen player öne alınarak bir kaynak seçilir
 *  4. Mail.ru kaynakları **kendi `<video>` oynatıcımıza** alınır: akış köprüsü
 *     (`/akis/coz` → `/akis/aktar`) videoyu bizim elemanımıza getirir (docs/12)
 *  5. kendi oynatıcıya alınamayan kaynak iframe ile gömülür
 *  6. sayfada geçirilen süre ölçülür ve "izlemeye devam et" kaydı güncellenir
 *  7. kaynak postMessage API'si yayınlıyorsa (VK, ölçüldü) gerçek konum/süre
 *     köprüden okunur ve oynat/duraklat/sar komutları gönderilir
 *
 * Kısıt (dürüstçe): iframe içeriği farklı kaynakta olduğu için videonun gerçek
 * oynatma konumu/süresi **yalnızca** iki yolda okunabilir: kaynak postMessage API
 * yayınlıyorsa (ölçüm: ~%7, VK) veya video bizim `<video>` elemanımızdaysa
 * (bugün Mail.ru, kaynakların ~%28'i). Sibnet (~%42) tamamen opak ve kullanım
 * dışı. Opak iframe'de ilerleme "sayfada geçirilen süre" olarak tutulur ve
 * bölüm 90 saniye sonra izlendi sayılır.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Anime, Kaynak, Taksonomi } from '@/lib/tipler';
import { animeVeriYolu, genelYol } from '@/lib/yollar';
import { bolumNumarasi, embedUygun, kaynakEtiketi, kaynakGrubu, kaynakGrupla, playerAd, sayiBicim } from '@/lib/bicim';
import { durumOzeti, kullanimDisiMi, oynaticiDurumu, type OynatıcıDurum } from '@/lib/oynatici';
import { bildirimGonder } from '@/lib/bildirim';
import {
  KOMUT_DENEME_ARASI_MS,
  KOMUT_DENEME_SAYISI,
  SINA_PENCERESI_MS,
  komutlar,
  komutOnaylandi,
  komutSinamasi,
  kopruBul,
  kopruCoz,
  kopruOrigin,
  kaynakAdresi,
  medyaSaati,
  olayCoz,
  olcumGuncelle,
  olcumKomutOnayla,
  olcumSinaBasarisiz,
  sarmalayiciCoz,
  sinaOnaylandi,
  type KopruEylem,
  type KopruOlcumu,
} from '@/lib/kopru';
import {
  akisCoz,
  akisKapsami,
  akisKaynakSinifla,
  akisKapsamSorunuMetni,
  akisSorunAciklamasi,
  akisNotuMetni,
  akisOynatilirMi,
  akisVarMi,
  akisYenilenmeliMi,
  aktarimAdresi,
  aktarimDurumu,
  kapsamdaMi,
  medyaHatasiTazeGerektirir,
  type AkisCozumu,
  type AkisNotu,
} from '@/lib/akis';
import {
  akisHatasiBildir,
  cozumKaydet,
  cozumOku,
  cozumluAdresler,
  hostBasarilari,
  hostBasarisiKaydet,
  hostKanitli,
  kanitliSira,
  kaynakHostu,
  type AkisHataKodu,
} from '@/lib/akis-kayit';
import { useBaglandi, useCalismayanlar, useTercihler } from '@/lib/depo/kanca';
import {
  calismayanIsaretle,
  ilerlemeKaydet,
  izlenenEkle,
  izlenenHaritasi,
  konumKaydet,
  konumOku,
  kopruOlcumKaydet,
  kopruOlcumleri,
  tercihKaydet,
} from '@/lib/depo/yerel';
import { AraIkon, DisBaglantiIkon, OynatIkon, SagIkon, SolIkon, TikIkon } from './Ikon';

const IZLENDI_SAYILMA_SANIYESI = 90;

/* Otomatik zincir: bir kaynak sitenin playerında açılmazsa sıradaki denenir.
   Amaç kullanıcının "bu bölümde hiçbir kaynak açılmıyor" duvarına çarpmaması.
   Sınır bilinçli: `/akis/coz` IP başına günde 300 istekle sınırlı, tek bir
   bölümde kotayı tüketmemek için zincir en çok 8 kaynak dener. */
const ZINCIR_SINIRI = 8;
/** İki deneme arası bekleme: kullanıcı hangi kaynağın denendiğini görebilsin. */
const ZINCIR_GECIKME_MS = 900;
/** Akış çözüldü ama video bu sürede oynamaya başlamazsa kaynak başarısız sayılır. */
const ZINCIR_YUKLEME_SINIRI_MS = 20000;

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
  const [oynaticiSuzgeci, setOynaticiSuzgeci] = useState<string | null>(null);
  const saniyeRef = useRef(0);
  const [tamEkran, setTamEkran] = useState(false);
  const [bildirildi, setBildirildi] = useState(false);

  const kutuRef = useRef<HTMLDivElement>(null);
  const izlendiRef = useRef(false);

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
    setOynaticiSuzgeci(null);
    setBildirildi(false);
  }, [bolumSira]);

  const bolum = useMemo(
    () => anime?.bolumler.find((b) => b.n === bolumSira) ?? anime?.bolumler[0] ?? null,
    [anime, bolumSira]
  );

  /* ------------------- site playerı (mod + sunucu kapsamı) ------------------- */
  /* Kaynak listesi bu iki değere göre süzüldüğü için **önce** tanımlanırlar. */
  const [akisKapsam, setAkisKapsam] = useState<string[] | null>(null);
  const [akisKapsamHatasi, setAkisKapsamHatasi] = useState<string | undefined>();
  const [playerModu, setPlayerModu] = useState<'kaynak' | 'site'>('kaynak');

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
      /* Kullanım dışı player'ın kaynakları **listede kalır ama önerilmez**: en sona düşer.
         Gizlemek yanlış olurdu — tek kaynağı Sibnet olan bölümde oynatıcıyı boşaltırdı. */
      const kx = kullanimDisiMi(x[0]) ? 1 : 0;
      const ky = kullanimDisiMi(y[0]) ? 1 : 0;
      if (kx !== ky) return kx - ky;
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

  /* -------------------- "sitenin playerı" kaynak kapsamı -------------------- */
  /* Sunucu hangi host'ları çözebiliyorsa yalnız onlar bu modda gösterilir.
     Sibnet gibi veri merkezini engelleyen host'lar burada hiç görünmez (zincir
     de onları denemez); "Kaynağın playerı" modunda liste yine tam kalır —
     kullanıcı sibnet'i orada görüp iframe ile izleyebilir. */
  const siteKapsami = playerModu === 'site' && akisKapsam != null;
  const kapsamIciMi = useCallback(
    (k: Kaynak) => kapsamdaMi(akisKapsam, sarmalayiciCoz(k[2])),
    [akisKapsam]
  );

  const oynaticiSecenekleri = useMemo(() => {
    const sayilar = new Map<string, number>();
    for (const kaynak of kaynaklar) {
      if (gecerliSecim.length && !gecerliSecim.includes(kaynakGrubu(kaynak))) continue;
      if (siteKapsami && !kapsamIciMi(kaynak)) continue;
      sayilar.set(kaynak[0], (sayilar.get(kaynak[0]) ?? 0) + 1);
    }
    return [...sayilar].map(([ad, sayi]) => ({ ad, sayi })).sort((a, b) => b.sayi - a.sayi || playerAd(a.ad).localeCompare(playerAd(b.ad), 'tr'));
  }, [kaynaklar, gecerliSecim, siteKapsami, kapsamIciMi]);

  const temelKaynaklar = useMemo(() => {
    const ekipSuzulmus = gecerliSecim.length ? kaynaklar.filter((k) => gecerliSecim.includes(kaynakGrubu(k))) : kaynaklar;
    const seciliPlayerVar = oynaticiSuzgeci && oynaticiSecenekleri.some((p) => p.ad === oynaticiSuzgeci);
    return seciliPlayerVar ? ekipSuzulmus.filter((k) => k[0] === oynaticiSuzgeci) : ekipSuzulmus;
  }, [kaynaklar, gecerliSecim, oynaticiSuzgeci, oynaticiSecenekleri]);

  const siteUygunlar = useMemo(
    () => (siteKapsami ? temelKaynaklar.filter(kapsamIciMi) : temelKaynaklar),
    [temelKaynaklar, siteKapsami, kapsamIciMi]
  );
  /** Site modunda listeden çıkarılan kaynak sayısı (yalnız gizleme gerçekten olduysa). */
  const kapsamDisiGizlenen = siteKapsami && siteUygunlar.length ? temelKaynaklar.length - siteUygunlar.length : 0;
  /* Hepsi kapsam dışıysa liste boşaltılmaz: kullanıcı boş panel yerine kaynakları
     görsün (oynatma yine çalışmaz, ama sebep ve mod düğmesi önünde olur). */
  const gosterilenKaynaklar = siteUygunlar.length ? siteUygunlar : temelKaynaklar;

  /* Süzgeç değişince seçim başa döner. Karşılaştırma **içerik** üzerinden: tercih
     deposu yeniden yüklendiğinde (senkron/abonelik) dizi kimliği değişiyor ama
     içerik aynı kalıyor — kimlik değişimi seçimi boşa sıfırlayıp zincirin
     ortasındaki kaynağı yeniden denetiyordu (canlı test: 7 kaynak, 8 istek). */
  const ekipAnahtari = gecerliSecim.join('|');
  useEffect(() => setKaynakSira(0), [ekipAnahtari, oynaticiSuzgeci]);
  useEffect(() => setOynaticiSuzgeci(null), [ekipAnahtari]);

  const aktifKaynak =
    gosterilenKaynaklar[Math.min(kaynakSira, Math.max(0, gosterilenKaynaklar.length - 1))] ?? null;

  /** Seçili kaynağın player'ı kullanım dışıysa durum kaydı (etiket + sebep + tarihler). */
  const aktifDurum = aktifKaynak ? oynaticiDurumu(aktifKaynak[0]) : null;

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

  const kopruAdi = useMemo(() => (aktifKaynak ? kopruBul(aktifKaynak[2]) : null), [aktifKaynak]);
  /** iframe'e giden adres: sarmalayıcı çözülür, destekli host'ta API açılır. */
  const iframeAdresi = useMemo(() => (aktifKaynak ? kaynakAdresi(aktifKaynak[2]) : ''), [aktifKaynak]);

  /* --------------------- site playerı (akış köprüsü) --------------------- */
  /* Akış çözümleme kullanıcı isteğiyle birer kaynak denenerek yapılır; iframe
     player modu varsayılan kalır. Sunucu kapsamı dinamik, başarılı/başarısız
     kaynaklar ise bu bölümdeki gerçek deneme sonucuna göre listelenir.
     (`akisKapsam`, `akisKapsamHatasi`, `playerModu` yukarıda tanımlı: kaynak
     listesi bunlara göre süzülüyor.) */
  const [zorlaCoz, setZorlaCoz] = useState(false);
  const [akisYenidenDeneme, setAkisYenidenDeneme] = useState(0);
  const [akisDenenenler, setAkisDenenenler] = useState<
    Record<string, { hata?: string; durum: 'bekliyor' | 'basarisiz' | 'calisiyor' }>
  >({});
  /** Otomatik zincir: kullanıcı isterse kapatabilir (varsayılan açık). */
  const [zincirAktif, setZincirAktif] = useState(true);
  const [zincirBilgi, setZincirBilgi] = useState<{
    durum: 'bos' | 'deniyor' | 'basarili' | 'tukendi' | 'sinir';
    denenen: number;
  }>({ durum: 'bos', denenen: 0 });
  /** Zincirde denenen kaynak sayısı (sınır için) ve bekleyen zamanlayıcılar. */
  const zincirSayacRef = useRef(0);
  /**
   * Bu zincir turunda seçilmiş kaynakların ham adresleri. `denenenler` durumu
   * render ile geciktiğinde aynı kaynak ikinci kez seçilebiliyordu (canlı testte
   * sibnet iki kez denendi, bir zincir hakkı boşa gitti); bu küme o boşluğu kapatır.
   * Bölüm/mod değişiminde ve elle seçimde sıfırlanır. */
  const zincirDenenenRef = useRef<Set<string>>(new Set());
  const zincirZamanlayiciRef = useRef<number | null>(null);
  const zincirSurumRef = useRef(0);
  const yuklemeZamanlayiciRef = useRef<number | null>(null);

  useEffect(() => {
    if (!akisVarMi()) {
      setAkisKapsamHatasi('kopru-yok');
      return;
    }
    let iptal = false;
    akisKapsami().then((kapsam) => {
      if (iptal) return;
      setAkisKapsam(kapsam.hostlar);
      setAkisKapsamHatasi(kapsam.hata);
    });
    return () => {
      iptal = true;
    };
  }, []);

  const kendiVideoAdayi = Boolean(
    playerModu === 'site' &&
      aktifKaynak &&
      (!akisVarMi() || zorlaCoz || kapsamdaMi(akisKapsam, sarmalayiciCoz(aktifKaynak[2])))
  );

  /* ------------------------- otomatik kaynak zinciri ------------------------- */
  /* Sıradaki kaynak, mevcut sıradan başlayarak seçilir; kapsam içi host'lar öne
     alınır, bilinen başarısızlar atlanır. Tüm değerler ref üzerinden okunur:
     zincir, çözümleme sözünün (promise) içinden tetiklendiği için kapanışın
     bayatlaması engellenir. Fonksiyonlar burada, kendilerini kullanan
     efektlerden **önce** tanımlanır (TDZ güvenliği). */
  const zincirRef = useRef({
    aktif: true,
    mod: 'kaynak' as 'kaynak' | 'site',
    kaynaklar: gosterilenKaynaklar,
    denenenler: akisDenenenler,
    kapsam: akisKapsam,
    sira: kaynakSira,
  });
  zincirRef.current.aktif = zincirAktif;
  zincirRef.current.mod = playerModu;
  zincirRef.current.kaynaklar = gosterilenKaynaklar;
  zincirRef.current.denenenler = akisDenenenler;
  zincirRef.current.kapsam = akisKapsam;
  zincirRef.current.sira = kaynakSira;

  /** Bekleyen zincir zamanlayıcılarını iptal eder (mod/bölüm değişimi, elle seçim). */
  const zincirTemizle = useCallback(() => {
    zincirSurumRef.current += 1;
    if (zincirZamanlayiciRef.current !== null) {
      window.clearTimeout(zincirZamanlayiciRef.current);
      zincirZamanlayiciRef.current = null;
    }
    if (yuklemeZamanlayiciRef.current !== null) {
      window.clearTimeout(yuklemeZamanlayiciRef.current);
      yuklemeZamanlayiciRef.current = null;
    }
  }, []);

  const zincirAdaylari = useCallback(() => {
    const { kaynaklar, denenenler, kapsam, sira } = zincirRef.current;
    const adaylar: number[] = [];
    for (let adim = 1; adim < kaynaklar.length; adim++) {
      const s = (sira + adim) % kaynaklar.length;
      const kaynak = kaynaklar[s];
      if (!kaynak) continue;
      if (zincirDenenenRef.current.has(kaynak[2])) continue;
      if (denenenler[kaynak[2]]?.durum === 'basarisiz') continue;
      /* Kapsam dışı host'lar sunucudan **çözülemez** (tablo sunucuda; ör. sibnet
         veri merkezini engelliyor). Bunları denemek yalnız zaman kaybıdır:
         site modunda 900 ms'lik turlar bitmez, kullanıcı "takıldı" sanır.
         Sunucu kapsamı okunamadıysa eleme yapılmaz (bilgi yoksa varsayma). */
      if (kapsam != null && !kapsamdaMi(kapsam, sarmalayiciCoz(kaynak[2]))) continue;
      adaylar.push(s);
    }
    /* Sıra: bu oturumda kanıtlanmış → **çözümü hazır** (taramasız oynar) →
       cihazda kanıtlı host → kapsam içi host → geri kalan.
       Çözüm önbelleği en güçlü kanıttır: kaynağın imzalı adresi elimizde olduğu
       için hiç ağ turu harcamadan oynar. Kanıt, kullanıcının sekiz bilinmeyen
       host'u boşa denemesini engeller; cihaz kaydı bölümler arasında taşınır. */
    const cihaz = hostBasarilari();
    const cozumlu = cozumluAdresler();
    const puan = (s: number) => {
      const kaynak = kaynaklar[s];
      const adres = sarmalayiciCoz(kaynak[2]);
      if (denenenler[kaynak[2]]?.durum === 'calisiyor') return 0;
      if (cozumlu.has(adres)) return 0.5;
      if (hostKanitli(cihaz[kaynakHostu(adres)])) return 1;
      return kapsamdaMi(kapsam, adres) ? 2 : 3;
    };
    return adaylar.sort((a, b) => puan(a) - puan(b));
  }, []);

  /** Sıradaki kaynağa geç; aday kalmadıysa veya sınır dolduysa zinciri bitir. */
  const zincirIlerle = useCallback(() => {
    const { aktif, mod } = zincirRef.current;
    if (!aktif || mod !== 'site') return;
    const adaylar = zincirAdaylari();
    if (zincirSayacRef.current >= ZINCIR_SINIRI || !adaylar.length) {
      setZincirBilgi({ durum: 'tukendi', denenen: zincirSayacRef.current });
      return;
    }
    const sonraki = adaylar[0];
    const sonrakiKaynak = zincirRef.current.kaynaklar[sonraki];
    if (sonrakiKaynak) zincirDenenenRef.current.add(sonrakiKaynak[2]);
    zincirSayacRef.current += 1;
    setZincirBilgi({ durum: 'deniyor', denenen: zincirSayacRef.current });
    setKaynakSira(sonraki);
    setZorlaCoz(true);
  }, [zincirAdaylari]);

  /** Kısa gecikmeyle sıradakini dene (kullanıcı denemeyi görebilsin). */
  const zincirZamanla = useCallback(() => {
    const { aktif, mod } = zincirRef.current;
    if (!aktif || mod !== 'site') return;
    if (zincirZamanlayiciRef.current !== null) window.clearTimeout(zincirZamanlayiciRef.current);
    const surum = ++zincirSurumRef.current;
    zincirZamanlayiciRef.current = window.setTimeout(() => {
      zincirZamanlayiciRef.current = null;
      if (zincirSurumRef.current !== surum) return;
      zincirIlerle();
    }, ZINCIR_GECIKME_MS);
  }, [zincirIlerle]);

  /** Elle "dene" seçiminde sayaç sıfırlanır: zincir seçilen kaynaktan sürer. */
  const zincirSifirla = useCallback(() => {
    zincirTemizle();
    zincirDenenenRef.current.clear();
    zincirSayacRef.current = 0;
    setZincirBilgi({ durum: 'bos', denenen: 0 });
  }, [zincirTemizle]);

  /**
   * Başarısız denemeyi cihaz hafızasına ve telemetriye yazar. Günlük kota ve
   * köprü yokluğu kaynağın kusuru değildir; çağıran taraf onları hiç iletmez.
   */
  const kaynakBasarisiz = useCallback(
    (kaynak: Kaynak, hata: AkisHataKodu) => {
      const adres = sarmalayiciCoz(kaynak[2]);
      hostBasarisiKaydet(adres, false);
      akisHatasiBildir({ url: adres, hata, anime: anime?.slug ?? null, bolum: bolum?.n ?? null });
    },
    [anime?.slug, bolum?.n]
  );

  /* Cihazda kanıtlı host varsa ilk deneme ondan yapılır: bölüm ya da mod
     değişiminde **bir kez** uygulanır, kullanıcının sonraki seçimini ezmez. */
  const tercihUygulananRef = useRef('');
  const tercihAnahtari = `${anime?.slug ?? ''}|${bolum?.n ?? 0}`;
  /** Kullanıcı bu bölümde kaynağı elle seçti: otomatik tercih devreye girmez. */
  const tercihiKapat = useCallback(() => {
    tercihUygulananRef.current = `${anime?.slug ?? ''}|${bolum?.n ?? 0}`;
  }, [anime?.slug, bolum?.n]);
  /**
   * Kanıtlı sırayı **senkron** uygular. Mod düğmesi bunu `setPlayerModu('site')`
   * ile aynı tıklamada çağırır: iki durum tek render'da birleştiği için ilk
   * çözümleme doğrudan kanıtlı host'la başlar. Ayrı effect yalnızca kaynaklar
   * sonradan geldiği durumu yakalar; aksi hâlde aradaki varsayılan seçim bir
   * kez boşa denenirdi (canlı test yakaladı: ilk istek Odnoklassniki'ydi).
   */
  const tercihiUygula = useCallback(() => {
    if (!gosterilenKaynaklar.length) return;
    if (tercihUygulananRef.current === tercihAnahtari) return;
    tercihUygulananRef.current = tercihAnahtari;
    const sira = kanitliSira(gosterilenKaynaklar.map((k) => sarmalayiciCoz(k[2])));
    if (sira !== null) setKaynakSira(sira);
  }, [gosterilenKaynaklar, tercihAnahtari]);
  useEffect(() => {
    if (playerModu !== 'site') return;
    tercihiUygula();
  }, [playerModu, tercihiUygula]);

  /* Embed moduna dönünce ya da bölüm değişince zincir sıfırlanır: iframe'in
     açılıp açılmadığını okuyamadığımız için orada otomatik deneme anlamsız. */
  useEffect(() => {
    zincirTemizle();
    zincirDenenenRef.current.clear();
    zincirSayacRef.current = 0;
    setZincirBilgi({ durum: 'bos', denenen: 0 });
  }, [playerModu, bolum?.n, zincirTemizle]);

  const [akis, setAkis] = useState<{ cozum: AkisCozumu; baslangic: number } | null>(null);
  const [akisDurum, setAkisDurum] = useState<'yok' | 'cozuluyor' | 'yenileniyor' | 'hazir' | 'basarisiz'>('yok');
  const [akisNotu, setAkisNotu] = useState<AkisNotu | null>(null);
  const [akisSorun, setAkisSorun] = useState('');
  const [videoSaat, setVideoSaat] = useState({ konum: 0, sure: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoKonumRef = useRef(0);
  /** Seçim başına sayaç: geç dönen çözümleme eski seçime yazılamasın. */
  const akisSurumRef = useRef(0);
  /** Taze çözümleme hakkı (seçim başına en çok bir deneme). */
  const akisTazeRef = useRef(false);
  /** Videonun ait olduğu bölüm: aynı bölümde kaynak değişimi konumu taşır. */
  const akisBolumRef = useRef('');

  const oynatmaAdresi = akis ? aktarimAdresi(akis.cozum, akis.baslangic) : '';

  /* ------------------------------------------------------------------ */
  /* HLS köprüsü: Safari yerel oynatır; diğer tarayıcılarda hls.js takılır */
  /* ------------------------------------------------------------------ */
  /** hls.js yalnız gerektiğinde (ve bir kez) indirilir: paket şişmesin. */
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !akis || akis.cozum.tur !== 'hls') return;
    const adres = oynatmaAdresi.split('#')[0];
    /* Yerel HLS desteği (Safari/iOS): aracıya gerek yok. */
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      if (video.src !== adres) video.src = adres;
      return;
    }
    let iptal = false;
    import('hls.js')
      .then((mod) => {
        if (iptal || !videoRef.current) return;
        const Hls = mod.default;
        if (!Hls.isSupported()) return;
        const hls = new Hls({ enableWorker: true, maxBufferLength: 30 });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_olay, veri) => {
          if (!veri?.fatal) return;
          hls.destroy();
          hlsRef.current = null;
          /* Zincir aynı hatayı görsün: video elemanının hata yolu işletilir. */
          videoHatasiRef.current?.();
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play().catch(() => {});
        });
        hls.loadSource(adres);
        hls.attachMedia(video);
      })
      .catch(() => {
        /* hls.js indirilemedi: video elemanı hatayı bildirir, zincir ilerler. */
      });
    return () => {
      iptal = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [akis, oynatmaAdresi]);

  /** Kaynak seçilince akışı çözümle; başarısızlık iframe yolunu bozmaz. */
  useEffect(() => {
    const kaynak = aktifKaynak;
    const surum = ++akisSurumRef.current;
    akisTazeRef.current = false;
    /* Yeni deneme başlıyor: önceki kaynağın bekleyen zincir/yükleme zamanlayıcısı iptal. */
    zincirTemizle();
    setAkis(null);
    setAkisNotu(null);
    setVideoSaat({ konum: 0, sure: 0 });

    if (!kaynak || !anime || !bolum || !kendiVideoAdayi) {
      videoKonumRef.current = 0;
      setAkisDurum('yok');
      setAkisSorun('');
      return;
    }

    if (!akisVarMi()) {
      const hata = 'kopru-yok';
      setAkisDurum('basarisiz');
      setAkisSorun(hata);
      setAkisNotu('cozulemedi');
      return;
    }

    const anahtar = `${anime.slug}|${bolum.n}`;
    /* Konum koruma: aynı bölümde kaynak değişiyorsa **canlı** konum, yeni bölümse
       cihazda kayıtlı konum başlangıç olur.
       DİKKAT: canlı konum ref'ten **sıfırlamadan önce** okunur. İlk sürümde
       sıfırlama önceydi ve konum koruma sessizce çalışmıyordu (kaynak değişimi
       baştan başlıyordu); tarayıcı testi yakaladı — bkz. docs/05 H-34. */
    const canli = akisBolumRef.current === anahtar ? videoKonumRef.current : 0;
    videoKonumRef.current = 0;
    const baslangic = Math.max(0, Math.floor(canli > 1 ? canli : konumOku(anime.slug, bolum.n)));

    setAkisDenenenler((onceki) => ({ ...onceki, [kaynak[2]]: { durum: 'bekliyor' } }));
    setAkisSorun('');
    /* Çözümleme gerçekten başladı: kaynak bu zincir turunda denenmiş sayılır.
       Tercih ya da elle seçimle gelen ilk kaynak da buradan geçer; zincir onu
       ikinci kez seçemez (canlı testte bir kaynak iki kez denenmiş, bir hak
       boşa gitmişti). */
    zincirDenenenRef.current.add(kaynak[2]);

    /** Çözümü oynatıcıya bağlar ve takılma korumasını kurar. */
    const oynatmayiKur = (cozum: AkisCozumu) => {
      akisBolumRef.current = anahtar;
      setAkis({ cozum, baslangic });
      setAkisSorun('');
      setAkisDenenenler((onceki) => ({ ...onceki, [kaynak[2]]: { durum: 'bekliyor' } }));
      setAkisDurum('cozuluyor');
      /* Takılma koruması: akış çözüldü ama video makul sürede oynamaya başlamazsa
         kaynak başarısız sayılır ve zincir sıradakine geçer (onCanPlay timer'ı siler). */
      if (yuklemeZamanlayiciRef.current !== null) window.clearTimeout(yuklemeZamanlayiciRef.current);
      yuklemeZamanlayiciRef.current = window.setTimeout(() => {
        yuklemeZamanlayiciRef.current = null;
        if (akisSurumRef.current !== surum) return;
        if ((videoRef.current?.readyState ?? 0) >= 3) return;
        setAkis(null);
        setAkisDurum('basarisiz');
        setAkisSorun('akis-durdu');
        setAkisNotu('akis-durdu');
        setAkisDenenenler((onceki) => ({ ...onceki, [kaynak[2]]: { hata: 'akis-durdu', durum: 'basarisiz' } }));
        kaynakBasarisiz(kaynak, 'akis-durdu');
        zincirZamanla();
      }, ZINCIR_YUKLEME_SINIRI_MS);
    };

    /* Daha önce başarıyla çözülen kaynak: **ağ taraması yapılmaz**, eldeki imzalı
       adres doğrudan oynar. Adres bayatlamışsa `<video>` 403/502 verir ve mevcut
       taze çözümleme yolu devreye girer (bedeli bir yenileme turu). */
    const adres = sarmalayiciCoz(kaynak[2]);
    const hazir = cozumOku(adres);
    if (hazir) {
      oynatmayiKur({ kaynakAdi: '', tur: hazir.tur, imzaBitis: hazir.imzaBitis, aktarim: hazir.aktarim });
      return;
    }

    setAkisDurum('cozuluyor');
    akisCoz(adres).then((sonuc) => {
      if (akisSurumRef.current !== surum) return;
      if (!sonuc.ok) {
        setAkisDurum('basarisiz');
        setAkisSorun(sonuc.hata);
        setAkisDenenenler((onceki) => ({ ...onceki, [kaynak[2]]: { hata: sonuc.hata, durum: 'basarisiz' } }));
        /* Sunucudaki günlük sınır (429) ayrı anlatılır: sebep kullanıcıya görünsün. */
        setAkisNotu(sonuc.hata === 'cok-fazla-istek' ? 'akis-yogun' : 'cozulemedi');
        /* Kota ve köprü yokluğu kaynağın kusuru değil: ölçüme yazılmaz. */
        if (sonuc.hata !== 'cok-fazla-istek' && sonuc.hata !== 'kopru-yok') {
          kaynakBasarisiz(kaynak, 'cozulemedi');
        }
        /* Sınır dolduysa zincir durur: sıradakileri denemek kotayı kurtarmaz. */
        if (sonuc.hata === 'cok-fazla-istek') setZincirBilgi({ durum: 'sinir', denenen: zincirSayacRef.current });
        else zincirZamanla();
        return;
      }
      if (!akisOynatilirMi(sonuc.akis.tur)) {
        const hata = `tur-desteklenmiyor:${sonuc.akis.tur}`;
        setAkisDurum('basarisiz');
        setAkisSorun(hata);
        setAkisDenenenler((onceki) => ({ ...onceki, [kaynak[2]]: { hata, durum: 'basarisiz' } }));
        setAkisNotu('tur-desteklenmiyor');
        kaynakBasarisiz(kaynak, 'tur-desteklenmiyor');
        zincirZamanla();
        return;
      }
      oynatmayiKur(sonuc.akis);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktifKaynak, bolum, kendiVideoAdayi, akisYenidenDeneme, zorlaCoz, akisKapsam]);

  /**
   * Kendi `<video>` hata verdi: önce aktarım ucunu 2 baytla yokla (video elemanı
   * HTTP kodunu göremez), 403/502 ise **bir kez** taze çözümle; tutmazsa kaynak
   * iframe'e düşer. Taze deneme hakkı seçim başına birdir — döngü kurulmaz.
   */
  /* hls.js geri çağrısı bileşenin en güncel hata işleyicisini çağırsın. */
  const videoHatasiRef = useRef<(() => void) | null>(null);

  const videoHatasi = useCallback(async () => {
    const video = videoRef.current;
    const kaynak = aktifKaynak;
    if (!video || !akis || !kaynak) return;
    const surum = akisSurumRef.current;
    const anlik = Number.isFinite(video.currentTime) ? Math.floor(video.currentTime) : 0;
    const baslangic = Math.max(0, anlik || Math.floor(videoKonumRef.current) || akis.baslangic);

    const dur = (not: AkisNotu) => {
      setAkis(null);
      setAkisDurum('basarisiz');
      setAkisNotu(not);
      setAkisSorun(not);
      setAkisDenenenler((onceki) => ({ ...onceki, [kaynak[2]]: { hata: not, durum: 'basarisiz' } }));
      const kod: AkisHataKodu =
        not === 'akis-erisilemedi' || not === 'medya-desteklemiyor' ? not : 'akis-durdu';
      kaynakBasarisiz(kaynak, kod);
      zincirZamanla();
    };
    if (akisTazeRef.current) return dur('akis-durdu');
    if (!medyaHatasiTazeGerektirir(video.error?.code)) return dur('medya-desteklemiyor');

    akisTazeRef.current = true;
    setAkisDurum('yenileniyor');
    const durum = await aktarimDurumu(akis.cozum.aktarim);
    if (akisSurumRef.current !== surum) return;
    if (!akisYenilenmeliMi(durum)) return dur(durum === 0 ? 'akis-erisilemedi' : 'medya-desteklemiyor');

    const sonuc = await akisCoz(sarmalayiciCoz(kaynak[2]), { taze: true });
    if (akisSurumRef.current !== surum) return;
    if (!sonuc.ok || !akisOynatilirMi(sonuc.akis.tur)) return dur('akis-durdu');
    videoKonumRef.current = baslangic;
    setAkis({ cozum: sonuc.akis, baslangic });
    setAkisDurum('hazir');
    setAkisNotu('akis-tazelendi');
    hostBasarisiKaydet(sarmalayiciCoz(kaynak[2]), true);
    /* Tazeleme de oynatmayı başlattıysa zincir başarıyla durur. */
    if (yuklemeZamanlayiciRef.current !== null) {
      window.clearTimeout(yuklemeZamanlayiciRef.current);
      yuklemeZamanlayiciRef.current = null;
    }
    if (zincirSayacRef.current > 0) setZincirBilgi({ durum: 'basarili', denenen: zincirSayacRef.current });
  }, [akis, aktifKaynak, zincirZamanla]);
  videoHatasiRef.current = videoHatasi;

  /* Kendi oynatıcıda gerçek konum cihazda saklanır: bölüm yeniden açılınca
     "kaldığın yerden" çalışsın (iframe yolunda bu bilgi yoktu). */
  useEffect(() => {
    if (!akis || !anime || !bolum) return;
    const kaydet = () => {
      if (videoKonumRef.current > 5) konumKaydet(anime.slug, bolum.n, Math.floor(videoKonumRef.current));
    };
    const zamanlayici = window.setInterval(kaydet, 15000);
    return () => {
      window.clearInterval(zamanlayici);
      kaydet();
    };
  }, [akis, anime, bolum]);

  /* Çalışma anı ölçümü: bu cihazda biriken yetenek kaydı (bkz. kopru.ts). */
  const [olcumler, setOlcumler] = useState<Record<string, KopruOlcumu>>({});
  useEffect(() => setOlcumler(kopruOlcumleri()), []);

  const olcum = kopruAdi ? olcumler[kopruAdi] ?? null : null;
  const kopru = useMemo(
    /* Saat açıkça verilir: varsayılana güvenmek ölçümü bayat sayıp önsele düşürürdü. */
    () => (aktifKaynak ? kopruCoz(aktifKaynak[2], olcum, Date.now()) : null),
    [aktifKaynak, olcum]
  );

  /** Ölçümü hem duruma hem cihaz deposuna yazar. */
  const olcumYaz = useCallback((yeni: KopruOlcumu) => {
    kopruOlcumKaydet(yeni);
    setOlcumler((eski) => ({ ...eski, [yeni.ad]: yeni }));
  }, []);

  const cerceveRef = useRef<HTMLIFrameElement>(null);
  const [konum, setKonum] = useState(0);
  const [gercekSure, setGercekSure] = useState(0);
  const [oynuyor, setOynuyor] = useState<boolean | null>(null);
  const [kopruHazir, setKopruHazir] = useState(false);
  const [kaldigiYer, setKaldigiYer] = useState(0);
  const [sinaMesaji, setSinaMesaji] = useState<'kontrol-bulundu' | null>(null);
  const sonKayitRef = useRef(0);
  const konumRef = useRef(0);
  konumRef.current = konum;
  const sinaRef = useRef<{ hedef: number; zamanlayici: number | null } | null>(null);
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

      /* Çalışma anı ölçümü: her anlamlı olay kayda geçer (yetenek ekler, silmez). */
      olcumYaz(olcumGuncelle(kopruOlcumleri()[kopru.ad] ?? olcum, kopru.ad, cikti, Date.now()));

      /* Sınama penceresinde komuta özgü bir olay geldiyse kanal kanıtlanmıştır. */
      const sina = sinaRef.current;
      if (sina && sinaOnaylandi(cikti)) {
        if (sina.zamanlayici) window.clearTimeout(sina.zamanlayici);
        sinaRef.current = null;
        olcumYaz(olcumKomutOnayla(kopruOlcumleri()[kopru.ad] ?? olcum, kopru.ad, Date.now()));
        setSinaMesaji('kontrol-bulundu');
      }

      const bekleyen = bekleyenRef.current;
      if (bekleyen && komutOnaylandi(bekleyen.eylem, bekleyen.hedef, cikti)) {
        if (bekleyen.zamanlayici) window.clearTimeout(bekleyen.zamanlayici);
        bekleyenRef.current = null;
        /* Kullanıcı komutunun onayı da komut kanalının kanıtıdır. */
        if (!(kopruOlcumleri()[kopru.ad] ?? olcum)?.komut) {
          olcumYaz(olcumKomutOnayla(kopruOlcumleri()[kopru.ad] ?? olcum, kopru.ad, Date.now()));
        }
      }
    };
    window.addEventListener('message', dinle);
    return () => window.removeEventListener('message', dinle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kopru?.ad, olcumYaz]);

  /**
   * Görünmez yetenek sınaması.
   *
   * Komut kanalı bilinmiyorsa (önsel "yok" diyor) ve oynatıcı konum bildiriyorsa:
   * oynatıcının **zaten bulunduğu** saniyeye bir sar komutu gönderilir. Dinleyen
   * oynatıcı `seeked` yayınlar → komut kanalı kanıtlanır ve düğmeler açılır;
   * dinlemeyen oynatıcıda hiçbir şey olmaz (ne görüntü ne ses değişir).
   * Aynı host için en sık `SINA_ARASI_MS` (7 gün) bir kez denenir.
   */
  useEffect(() => {
    if (!kopru || !kopruAdi) return;
    const karar = komutSinamasi(kopru, olcum, Date.now());
    if (!karar.sina) return;

    const bekle = window.setTimeout(() => {
      const pencere = cerceveRef.current?.contentWindow;
      if (!pencere) return;
      const hedef = Math.max(0, Math.round(konumRef.current));
      for (const yuk of komutlar(kopru.ad, 'sar', hedef)) {
        try {
          pencere.postMessage(yuk, '*');
          pencere.postMessage(yuk, kopruOrigin(kopru.ad));
        } catch {
          /* pencere değişmiş olabilir; sınama penceresi sonucu zaten kapatır */
        }
      }
      const bitis = window.setTimeout(() => {
        sinaRef.current = null;
        const guncel = kopruOlcumleri()[kopru.ad] ?? olcum;
        olcumYaz(olcumSinaBasarisiz(guncel, kopru.ad, Date.now()));
      }, SINA_PENCERESI_MS);
      sinaRef.current = { hedef, zamanlayici: bitis };
    }, 8000);

    return () => window.clearTimeout(bekle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeAdresi, kopru?.komut, olcum?.sonSina]);

  /* "Kontrol bulundu" bildirimi kısa süre görünür. */
  useEffect(() => {
    if (sinaMesaji !== 'kontrol-bulundu') return;
    const zamanlayici = window.setTimeout(() => setSinaMesaji(null), 8000);
    return () => window.clearTimeout(zamanlayici);
  }, [sinaMesaji]);

  /* Bileşen sökerken bekleyen komut/sınama zamanlayıcıları kalmasın. */
  useEffect(
    () => () => {
      if (bekleyenRef.current?.zamanlayici) window.clearTimeout(bekleyenRef.current.zamanlayici);
      if (sinaRef.current?.zamanlayici) window.clearTimeout(sinaRef.current.zamanlayici);
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
    saniyeRef.current = 0;
  }, [anime, bolum]);

  useEffect(() => {
    if (!anime || !bolum) return;
    const zamanlayici = setInterval(() => {
      saniyeRef.current += 1;
    }, 1000);
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

  const akisKaynakAdi = aktifKaynak ? playerAd(aktifKaynak[0]) : '';
  const playerKaynaklar = gosterilenKaynaklar.map((kaynak, sira) => {
    const sonuc = akisDenenenler[kaynak[2]];
    const hata = sonuc?.hata;
    const sinif = akisKaynakSinifla(sarmalayiciCoz(kaynak[2]), {
      embed: embedUygun(kaynak[2]),
      apiVar: akisVarMi(),
      kapsam: akisKapsam,
      hata: akisKapsamHatasi,
      sonuc,
    });
    return { kaynak, sira, sinif, hata };
  });
  const kendiPlayeriCalisanlar = playerKaynaklar.filter((x) => x.sinif === 'calisiyor');
  const kendiPlayeriCalismayanlar = playerKaynaklar.filter((x) => x.sinif === 'calismiyor' || x.sinif === 'gumulmez');
  const kendiPlayeriApiBekleyenler = playerKaynaklar.filter((x) => x.sinif === 'api-yok');
  const kendiPlayeriCozulenler = playerKaynaklar.filter((x) => x.sinif === 'cozuluyor');
  const kendiPlayeriBilinmeyenler = playerKaynaklar.filter((x) => x.sinif === 'denenmedi' || x.sinif === 'kapsam-disi');
  const kaynakCozumunuDene = (sira: number) => {
    const kaynak = gosterilenKaynaklar[sira];
    if (!kaynak) return;
    /* Kullanıcı bilinçli olarak bu kaynağı istedi: kanıtlı-host tercihi onu ezmesin. */
    tercihiKapat();
    setKaynakSira(sira);
    setPlayerModu('site');
    if (!akisVarMi()) {
      setZorlaCoz(false);
      setAkisDurum('basarisiz');
      setAkisSorun('kopru-yok');
      setAkisNotu('cozulemedi');
      return;
    }
    setZorlaCoz(true);
    setAkisDenenenler((onceki) => {
      const yeni = { ...onceki };
      delete yeni[kaynak[2]];
      return yeni;
    });
    setAkisYenidenDeneme((onceki) => onceki + 1);
    zincirSifirla();
  };

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
  /** Grup başlıklarındaki durum rozetleri (yalnız kullanım dışı player'lar için dolu). */
  const grupDurumlari = new Map<string, OynatıcıDurum>();
  for (const g of gruplar) {
    const d = oynaticiDurumu(g.player);
    if (d) grupDurumlari.set(g.player, d);
  }
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
            {akis ? (
              <video
                key={oynatmaAdresi}
                ref={videoRef}
                className="oynatici-video"
                /* HLS'te kaynak hls.js ya da yerel oynatıcı tarafından bağlanır;
                   `src` boş kalır ki tarayıcı listeyi kendi başına çekmesin. */
                src={akis.cozum.tur === 'hls' ? undefined : oynatmaAdresi}
                controls
                autoPlay
                playsInline
                preload="metadata"
                title={`${anime.ad} ${bolumNumarasi(bolum?.no ?? null, bolumSira)}. bölüm — ${akisKaynakAdi} akışı`}
                onLoadedMetadata={(olay) => {
                  /* Konum ekini (`#t=`) bazı tarayıcılar akış mp4'ünde yok sayıyor;
                     "kaynak değişiminde konum korunur" sözleşmesi burada açıkça kurulur. */
                  const v = olay.currentTarget;
                  if (akis.baslangic > 1 && Math.abs(v.currentTime - akis.baslangic) > 3) {
                    try {
                      v.currentTime = akis.baslangic;
                    } catch {
                      /* sarma desteklenmiyorsa video baştan oynar */
                    }
                  }
                }}
                onCanPlay={() => {
                  const kaynak = aktifKaynak;
                  if (!kaynak) return;
                  setAkisDurum('hazir');
                  setAkisDenenenler((onceki) => ({ ...onceki, [kaynak[2]]: { durum: 'calisiyor' } }));
                  /* Cihaz hafızası: bu host burada gerçekten oynadı. */
                  hostBasarisiKaydet(sarmalayiciCoz(kaynak[2]), true);
                  /* Çözüm önbelleği **oynama başlayınca** yazılır: sunucu çözümü
                     tek başına yeterli kanıt değil (bazı kaynaklar çözülüp
                     oynamıyor). Sonraki ziyaret bu kaynağı hiç taramaz —
                     "daha önce taranmış ve olumlu sonuç alınmış" hâli budur. */
                  if (akis) cozumKaydet(sarmalayiciCoz(kaynak[2]), akis.cozum);
                  /* Oynatma başladı: takılma koruması düşer, zincir başarıyla kapanır. */
                  if (yuklemeZamanlayiciRef.current !== null) {
                    window.clearTimeout(yuklemeZamanlayiciRef.current);
                    yuklemeZamanlayiciRef.current = null;
                  }
                  if (zincirSayacRef.current > 0) setZincirBilgi({ durum: 'basarili', denenen: zincirSayacRef.current });
                }}
                onTimeUpdate={(olay) => {
                  const v = olay.currentTarget;
                  videoKonumRef.current = v.currentTime;
                  setVideoSaat({
                    konum: Math.floor(v.currentTime),
                    sure: Number.isFinite(v.duration) ? Math.floor(v.duration) : 0,
                  });
                }}
                onDurationChange={(olay) => {
                  const v = olay.currentTarget;
                  setVideoSaat((eski) => ({
                    konum: eski.konum,
                    sure: Number.isFinite(v.duration) ? Math.floor(v.duration) : 0,
                  }));
                }}
                onError={videoHatasi}
              />
            ) : playerModu === 'site' && aktifKaynak ? (
              <div className="oynatici-bos">
                <div>
                  <h3>{akisDurum === 'cozuluyor' ? 'Sitenin playerı akışı çözümlüyor…' : 'Bu kaynak sitenin playerında açılamadı'}</h3>
                  <p>
                    {akisDurum === 'cozuluyor'
                      ? `${playerAd(aktifKaynak[0])} kaynağı deneniyor.`
                      : akisSorun === 'kopru-yok'
                        ? akisKapsamSorunuMetni(akisSorun)
                        : akisSorun
                          ? akisSorunAciklamasi(akisSorun)
                          : 'Akışı denemek için sağdaki listeden bir kaynak seç.'}
                  </p>
                  <button
                    className="dugme dugme-birincil"
                    onClick={() => {
                      setPlayerModu('kaynak');
                      setZorlaCoz(false);
                    }}
                  >
                    Kaynağın playerına geç
                  </button>
                </div>
              </div>
            ) : aktifKaynak && gomulebilir ? (
              <iframe
                key={`${aktifKaynak[2]}-${playerModu}`}
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

            {akisDurum === 'cozuluyor' || akisDurum === 'yenileniyor' ? (
              <div className="oynatici-yukleniyor" role="status">
                <span className="oynatici-donen" aria-hidden="true" />
                {akisDurum === 'yenileniyor' ? 'Akış tazeleniyor…' : `${akisKaynakAdi} akışı hazırlanıyor…`}
              </div>
            ) : null}
          </div>

          {/* Kendi oynatıcı şeridi: video bizim elemanımızda, baytlar aktarım ucundan. */}
          {akis ? (
            <div className="oynatici-kopru">
              <span className="oynatici-kopru-nokta canli" aria-hidden="true" />
              <span className="oynatici-kopru-ad">Kendi oynatıcımız</span>
              <span
                className="oynatici-kopru-olcum"
                title="Video bu sayfanın <video> elemanında; baytlar akış köprüsünden geçiyor."
              >
                köprü
              </span>
              {videoSaat.sure ? (
                <span className="oynatici-kopru-saat">
                  {medyaSaati(videoSaat.konum)} / {medyaSaati(videoSaat.sure)}
                </span>
              ) : null}
              <span className="oynatici-kopru-not">
                {akisKaynakAdi} akışı Workers üzerinden aktarılıyor; oynatma konumu bu sayfada okunuyor.
              </span>
            </div>
          ) : null}

          {akisNotu ? (
            <div className="uyari-kutu bilgi" style={{ marginTop: 10 }} role="status">
              <span aria-hidden="true">ℹ️</span>
              <span>
                {akisSorun ? akisSorunAciklamasi(akisSorun) : akisNotuMetni(akisNotu)}
                {playerModu === 'site' && aktifKaynak ? (
                  <button className="dugme dugme-sade" style={{ marginLeft: 10 }} onClick={() => { setPlayerModu('kaynak'); setZorlaCoz(false); }}>
                    Kaynağın playerına geç
                  </button>
                ) : null}
              </span>
            </div>
          ) : null}

          {/* Köprü şeridi: gerçek konum/süre ve (kanıtlanmışsa) kendi kontrollerimiz. */}
          {aktifKaynak && gomulebilir && kopru && !kendiVideoAdayi ? (
            <div className="oynatici-kopru">
              <span className={`oynatici-kopru-nokta${kopruHazir ? ' canli' : ''}`} aria-hidden="true" />
              <span className="oynatici-kopru-ad">{kopru.etiket}</span>
              {kopru.kaynak === 'olcum' ? (
                <span
                  className="oynatici-kopru-olcum"
                  title={`Bu cihazda ölçüldü (${kopru.olcum?.gozlem ?? 0} oturum, en son ${
                    kopru.olcum?.sonGorulme ? new Date(kopru.olcum.sonGorulme).toLocaleDateString('tr-TR') : '—'
                  })`}
                >
                  ölçüldü
                </span>
              ) : null}
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
                  {kopru.etiket} embed playerı kullanılıyor; GenesisAnime oynatma konumunu okuyamıyor.
                </span>
              )}

              {sinaMesaji === 'kontrol-bulundu' ? (
                <span className="oynatici-kopru-kesif" role="status">
                  Bu kaynak kontrol komutlarına cevap verdi — düğmeler açıldı.
                </span>
              ) : null}
            </div>
          ) : null}

          {aktifDurum && aktifKaynak ? (
            <div className="uyari-kutu uyari" style={{ marginTop: 12, marginBottom: 4 }}>
              <span aria-hidden="true">⚠️</span>
              <span>
                <b>{playerAd(aktifKaynak[0])}</b> kaynakları şu an <b>{aktifDurum.etiket.toLowerCase()}</b>{' '}
                sayılıyor ({durumOzeti(aktifDurum)}). {aktifDurum.sebep} Kaynağı yine de deneyebilirsin;
                çalışmazsa “Kaynak çalışmıyor” düğmesini kullan ya da başka bir kaynağa geç.
              </span>
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

            {/* Site modunda kapsam dışı host'lar listeden çıkarılır (Sibnet gibi
                veri merkezini engelleyenler bu modda hiç oynayamaz). Sessizce
                gizlemek yerine sayı + tek tıkla mod değişimi sunulur. */}
            {kapsamDisiGizlenen > 0 ? (
              <p className="ipucu" role="status">
                {sayiBicim(kapsamDisiGizlenen)} kaynak bu modda gösterilmiyor (sunucumuz o host'a
                erişemiyor).{' '}
                <button
                  type="button"
                  className="baglanti-dugme"
                  onClick={() => {
                    setPlayerModu('kaynak');
                    setZorlaCoz(false);
                  }}
                >
                  Kaynağın playerında gör
                </button>
              </p>
            ) : null}
            {siteKapsami && !siteUygunlar.length ? (
              <p className="ipucu" role="status">
                Bu bölümdeki kaynakların hiçbiri site playerımızda açılamıyor; kaynağın
                playerıyla izleyebilirsin.
              </p>
            ) : null}

            <div className="player-modu" role="group" aria-label="Oynatıcı seçimi">
              <button
                className={`player-modu-dugme${playerModu === 'kaynak' ? ' etkin' : ''}`}
                aria-pressed={playerModu === 'kaynak'}
                onClick={() => {
                  setPlayerModu('kaynak');
                  setZorlaCoz(false);
                }}
              >
                Kaynağın playerı
              </button>
              <button
                className={`player-modu-dugme${playerModu === 'site' ? ' etkin' : ''}`}
                aria-pressed={playerModu === 'site'}
                onClick={() => {
                  setPlayerModu('site');
                  setZorlaCoz(false);
                  tercihiUygula();
                }}
              >
                Sitenin playerı
              </button>
            </div>

            {playerModu === 'site' ? (
              <div className="site-player-panel" aria-live="polite">
                <p className="ipucu">
                  Kaynakları tek tek deneyip MP4/WebM olarak çözülebilenleri kendi playerımızda açarız.
                  Her host desteklenmez; başarısız olanlar ayrı listelenir.
                </p>
                <div className="zincir-satir">
                  <label className="zincir-anahtar">
                    <input
                      type="checkbox"
                      checked={zincirAktif}
                      onChange={(olay) => {
                        const acik = olay.currentTarget.checked;
                        setZincirAktif(acik);
                        if (!acik) zincirSifirla();
                      }}
                    />
                    <span>Otomatik dene — açılmayan kaynakta sıradakini dener</span>
                  </label>
                  {zincirBilgi.durum === 'deniyor' ? (
                    <span className="zincir-durum" role="status">
                      Sıradaki kaynak deneniyor ({zincirBilgi.denenen}/{ZINCIR_SINIRI})
                      {aktifKaynak ? `: ${playerAd(aktifKaynak[0])} · #${kaynakSira + 1}` : ''}…
                    </span>
                  ) : null}
                  {zincirBilgi.durum === 'basarili' && zincirBilgi.denenen > 0 ? (
                    <span className="zincir-durum" role="status">
                      Otomatik deneme çalışan kaynağı buldu ({zincirBilgi.denenen} kaynak denendi).
                    </span>
                  ) : null}
                  {zincirBilgi.durum === 'tukendi' ? (
                    <span className="zincir-durum" role="status">
                      Denenen kaynakların tümü açılmadı; kalanları elle deneyebilirsin.
                    </span>
                  ) : null}
                  {zincirBilgi.durum === 'sinir' ? (
                    <span className="zincir-durum" role="status">
                      Günlük akış sınırına gelindi; otomatik deneme durdu.
                    </span>
                  ) : null}
                </div>
                {akisKapsamHatasi ? <p className="site-player-sorun">{akisKapsamSorunuMetni(akisKapsamHatasi)}</p> : null}
                <section className="site-player-grup">
                  <h4>Sitenin playerında çalışan ({kendiPlayeriCalisanlar.length})</h4>
                  {kendiPlayeriCalisanlar.length ? (
                    <div className="cipler">
                      {kendiPlayeriCalisanlar.map(({ kaynak, sira }) => (
                        <button className={`cip${sira === kaynakSira ? ' etkin' : ''}`} key={kaynak[2]} onClick={() => setKaynakSira(sira)}>
                          ✓ {playerAd(kaynak[0])} · #{sira + 1}
                        </button>
                      ))}
                    </div>
                  ) : <p className="site-player-bos">Bu bölümde henüz doğrulanmış akış yok.</p>}
                </section>
                {kendiPlayeriCozulenler.length ? (
                  <section className="site-player-grup">
                    <h4>Şu anda deneniyor ({kendiPlayeriCozulenler.length})</h4>
                    <div className="cipler">
                      {kendiPlayeriCozulenler.map(({ kaynak, sira }) => (
                        <span className="cip" key={kaynak[2]}>
                          <span className="oynatici-donen" aria-hidden="true" /> {playerAd(kaynak[0])} · #{sira + 1}
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}
                {kendiPlayeriApiBekleyenler.length ? (
                  <section className="site-player-grup">
                    <h4>API bekleniyor ({kendiPlayeriApiBekleyenler.length})</h4>
                    <div className="cipler">
                      {kendiPlayeriApiBekleyenler.map(({ kaynak, sira }) => (
                        <span className="cip" key={kaynak[2]} title="Bu kaynağı test etmek için akış API’si çalışır olmalı.">
                          ◷ {playerAd(kaynak[0])} · #{sira + 1} · API bekleniyor
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}
                <section className="site-player-grup">
                  <h4>Henüz denenmeyen ({kendiPlayeriBilinmeyenler.length})</h4>
                  {kendiPlayeriBilinmeyenler.length ? (
                    <div className="cipler">
                      {kendiPlayeriBilinmeyenler.map(({ kaynak, sira }) => (
                        <button className="cip" key={kaynak[2]} onClick={() => kaynakCozumunuDene(sira)}>
                          ? {playerAd(kaynak[0])} · #{sira + 1} · Dene
                        </button>
                      ))}
                    </div>
                  ) : <p className="site-player-bos">Denenmemiş kaynak yok.</p>}
                </section>
                <section className="site-player-grup">
                  <h4>Sitenin playerında çalışmayan ({kendiPlayeriCalismayanlar.length})</h4>
                  {kendiPlayeriCalismayanlar.length ? (
                    <div className="cipler">
                      {kendiPlayeriCalismayanlar.map(({ kaynak, sira, hata }) => (
                        <button className="cip site-player-basarisiz" key={kaynak[2]} title={hata ? akisSorunAciklamasi(hata) : 'Kaynak MP4/WebM olarak çözülemedi'} onClick={() => kaynakCozumunuDene(sira)}>
                          × {playerAd(kaynak[0])} · #{sira + 1} · Yine dene
                        </button>
                      ))}
                    </div>
                  ) : <p className="site-player-bos">Başarısız deneme yok.</p>}
                </section>
              </div>
            ) : null}

            {playerModu === 'kaynak' && (epkGruplari.length > 1 || seciliFansublar.length > 0 ? (
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
            ) : null)}

            {playerModu === 'kaynak' && oynaticiSecenekleri.length > 1 ? (
              <div className="oynatici-secici" aria-label="Oynatıcıya göre kaynakları süz">
                <div className="oynatici-secici-basi">2 · Oynatıcı seç</div>
                <div className="oynatici-secici-dugmeleri">
                  <button
                    className={`oynatici-secici-dugme${oynaticiSuzgeci === null ? ' etkin' : ''}`}
                    aria-pressed={oynaticiSuzgeci === null}
                    onClick={() => setOynaticiSuzgeci(null)}
                  >
                    Tümü <span>{oynaticiSecenekleri.reduce((toplam, p) => toplam + p.sayi, 0)}</span>
                  </button>
                  {oynaticiSecenekleri.map((p) => (
                    <button
                      key={p.ad}
                      className={`oynatici-secici-dugme${oynaticiSuzgeci === p.ad ? ' etkin' : ''}`}
                      aria-pressed={oynaticiSuzgeci === p.ad}
                      onClick={() => setOynaticiSuzgeci(p.ad)}
                    >
                      {playerAd(p.ad)} <span>{p.sayi}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {playerModu === 'kaynak' && (gosterilenKaynaklar.length === 0 ? (
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
                        {grupDurumlari.get(g.player) ? (
                          <span
                            className="rozet-kapali"
                            title={`${grupDurumlari.get(g.player)!.sebep} ${durumOzeti(grupDurumlari.get(g.player)!)}`}
                          >
                            {grupDurumlari.get(g.player)!.etiket}
                          </span>
                        ) : null}
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
                      {g.kaynaklar.map(({ k, sira: i }) => {
                        const durum = oynaticiDurumu(k[0]);
                        return (
                          <button
                            key={`${k[2]}-${i}`}
                            className={`cip${i === kaynakSira ? ' etkin' : ''}${durum ? ' kapali' : ''}`}
                            onClick={() => setKaynakSira(i)}
                            title={`${playerAd(k[0])} · ${kaynakEtiketi(k)}${k[1] ? ` · ${k[1]}` : ''}${
                              durum ? ` · ${durum.etiket}: ${durum.sebep}` : ''
                            }`}
                          >
                            {k[3] === 'ok' ? (
                              <span className="ok-isaret" title="Çalıştığı doğrulanmış">
                                ✓
                              </span>
                            ) : (
                              <OynatIkon boyut={11} />
                            )}
                            {gecerliSecim.length > 0 || oynaticiSuzgeci ? (
                              <span className="oynatici-cip-etiket">{playerAd(k[0])}</span>
                            ) : k[1] && k[1] !== k[0] ? (
                              <span className="fansub">{k[1]}</span>
                            ) : null}
                            <span>#{i + 1}</span>
                            {durum ? <span className="cip-durum">{durum.etiket}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ))}

            {playerModu === 'kaynak' && seciliEkip ? (
              <div className="ekip-bilgi">
                <b>{seciliEkip.g}</b>
                {seciliEkip.e ? <div style={{ marginTop: 4 }}>{seciliEkip.e}</div> : null}
              </div>
            ) : null}

            {playerModu === 'kaynak' && guven && guven.kontrol > 0 ? (
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
