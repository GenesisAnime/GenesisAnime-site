/**
 * yerel.ts — tarayıcı deposu sürücüsü (localStorage)
 *
 * Bu modül, sitenin "kullanıcıya ait" tüm durumunu tutar:
 *   - izlemeye devam et (son bölüm + süre)
 *   - izlenen bölümler
 *   - izleme listesi
 *   - tercihler (kaynak tercihi, otomatik sonraki bölüm…)
 *   - kullanıcının "çalışmıyor" diye işaretlediği kaynaklar
 *
 * Mimari notu (Faz 5): Tüm çağrılar bu tek modülden geçer. Hesaplar geldiğinde
 * aynı arayüzü uygulayan bir `api.ts` sürücüsü yazılacak; arayüz kodu değişmeyecek.
 */
import type { IlerlemeKaydi, ListeKaydi } from '../tipler';
import type { KopruOlcumu } from '../kopru';

const ONEK = 'genesisanime:v1:';
const ANAHTAR = {
  ilerleme: `${ONEK}ilerleme`,
  izlenen: `${ONEK}izlenen`,
  listem: `${ONEK}listem`,
  tercih: `${ONEK}tercih`,
  calismayan: `${ONEK}calismayan`,
  kopru: `${ONEK}kopru-yetenek`,
} as const;

export interface Tercihler {
  /** bölüm bitince sayfa sonraki bölüme geçmeyi önersin mi */
  otomatikSonraki: boolean;
  /** tercih edilen player (varsa kaynak seçiminde önce o denenir) */
  kaynakTercihi: string | null;
  /** doğrulanmış kaynakları her zaman öne al */
  dogrulanmisOncelik: boolean;
  /** /kesfet görünümü */
  gorunum: 'izgara' | 'liste';
  /** oynatıcıda yalnızca bu fansub gruplarının kaynakları gösterilsin (boş = tümü) */
  fansubSuzgeci: string[];
}

export const VARSAYILAN_TERCIH: Tercihler = {
  otomatikSonraki: true,
  kaynakTercihi: null,
  dogrulanmisOncelik: true,
  gorunum: 'izgara',
  fansubSuzgeci: [],
};

/*
 * Köprü destekli kaynaklarda (ölçüm: `tools/kopru-komut-test.html`) oynatıcının
 * bildirdiği **gerçek** saniye burada tutulur. Hesap eşitlemesine dahil edilmez:
 * sunucudaki `IlerlemeKaydi.saniye` alanı "sayfada geçirilen süre" demektir ve
 * gerçek konumla karıştırılırsa "kaldığın yer" yanlış hesaplanır. Ayrı anahtar,
 * ayrı anlam.
 */
const konumAnahtari = (slug: string, bolum: number) => `${ONEK}konum:${slug}:${bolum}`;

/*
 * Köprü yetenek ölçümü (bkz. `kopru.ts` · çalışma anı ölçümü). Cihazda tutulur:
 * bir kullanıcının gözlemi başka bir kullanıcıyı bağlamaz; önsel tablo zaten
 * varsayılanı taşıyor. Yeni bir host konuşmaya başlarsa herkes kendi trafiğinde
 * fark eder ve kendi cihazında hatırlar.
 */
export function kopruOlcumleri(): Record<string, KopruOlcumu> {
  return oku<Record<string, KopruOlcumu>>(ANAHTAR.kopru, {});
}

export function kopruOlcumKaydet(olcum: KopruOlcumu): void {
  if (!olcum?.ad) return;
  yaz(ANAHTAR.kopru, { ...kopruOlcumleri(), [olcum.ad]: olcum });
}

/** Ölçümleri siler: yetenekler yeniden önsele döner. */
export function kopruOlcumleriniSil(): void {
  if (!tarayiciVar()) return;
  try {
    window.localStorage.removeItem(ANAHTAR.kopru);
  } catch {
    /* yoksay */
  }
}

/* ------------------------------ altyapı ------------------------------ */

function tarayiciVar(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function oku<T>(anahtar: string, varsayilan: T): T {
  if (!tarayiciVar()) return varsayilan;
  try {
    const ham = window.localStorage.getItem(anahtar);
    if (!ham) return varsayilan;
    return JSON.parse(ham) as T;
  } catch {
    return varsayilan;
  }
}

function yaz(anahtar: string, deger: unknown): void {
  if (!tarayiciVar()) return;
  try {
    window.localStorage.setItem(anahtar, JSON.stringify(deger));
  } catch {
    /* kota dolu ya da gizli sekme — sessizce yut */
  }
}

/* ---------------------------- değişiklik yayını ---------------------------- */

type Dinleyici = () => void;
const dinleyiciler = new Set<Dinleyici>();

export function abone(dinleyici: Dinleyici): () => void {
  dinleyiciler.add(dinleyici);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', dinleyici);
  }
  return () => {
    dinleyiciler.delete(dinleyici);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', dinleyici);
    }
  };
}

function yayinla(): void {
  onbellekler.gecersiz();
  for (const d of dinleyiciler) d();
}

/** useSyncExternalStore için kararlı referans önbelleği */
const onbellekler = {
  ilerleme: null as Record<string, IlerlemeKaydi> | null,
  ilerlemeSirali: null as IlerlemeKaydi[] | null,
  izlenen: null as Record<string, number> | null,
  listem: null as ListeKaydi[] | null,
  tercih: null as Tercihler | null,
  calismayan: null as string[] | null,
  gecersiz(): void {
    this.ilerleme = null;
    this.ilerlemeSirali = null;
    this.izlenen = null;
    this.listem = null;
    this.tercih = null;
    this.calismayan = null;
  },
};

/* ------------------------------- ilerleme ------------------------------- */

export function ilerlemeHaritasi(): Record<string, IlerlemeKaydi> {
  if (!onbellekler.ilerleme) onbellekler.ilerleme = oku<Record<string, IlerlemeKaydi>>(ANAHTAR.ilerleme, {});
  return onbellekler.ilerleme;
}

/**
 * Son izlenenler, en yeni önce.
 * useSyncExternalStore `getSnapshot`'ı referans karşılaştırdığı için bu fonksiyon
 * her çağrıda yeni dizi üretmemelidir; aksi halde React sonsuz render döngüsüne girer.
 */
/** Köprü telemetrisinden öğrenilen gerçek konumu cihazda saklar. */
export function konumKaydet(slug: string, bolum: number, saniye: number): void {
  if (!tarayiciVar() || !slug || !Number.isFinite(saniye) || saniye <= 0) return;
  try {
    window.localStorage.setItem(konumAnahtari(slug, bolum), String(Math.floor(saniye)));
  } catch {
    /* kota dolu olabilir; konum kritik veri değil, sessizce geç */
  }
}

/** Saklanan gerçek konumu döner; yoksa 0. */
export function konumOku(slug: string, bolum: number): number {
  if (!tarayiciVar() || !slug) return 0;
  try {
    const ham = window.localStorage.getItem(konumAnahtari(slug, bolum));
    const sayi = ham ? Number(ham) : 0;
    return Number.isFinite(sayi) && sayi > 0 ? Math.floor(sayi) : 0;
  } catch {
    return 0;
  }
}

export function ilerlemeListesi(): IlerlemeKaydi[] {
  if (!onbellekler.ilerlemeSirali) {
    onbellekler.ilerlemeSirali = Object.values(ilerlemeHaritasi()).sort((a, b) => b.zaman - a.zaman);
  }
  return onbellekler.ilerlemeSirali;
}

export function ilerlemeAl(slug: string): IlerlemeKaydi | undefined {
  return ilerlemeHaritasi()[slug];
}

export function ilerlemeKaydet(kayit: Omit<IlerlemeKaydi, 'zaman'>, izlendi = false): void {
  const harita = { ...ilerlemeHaritasi() };
  const onceki = harita[kayit.slug];
  harita[kayit.slug] = {
    ...kayit,
    saniye: Math.max(kayit.saniye, onceki?.bolum === kayit.bolum ? onceki.saniye : 0),
    zaman: Date.now(),
  };
  yaz(ANAHTAR.ilerleme, harita);
  if (izlendi) izlenenEkle(kayit.slug, kayit.bolum);
  yayinla();
}

export function ilerlemeSil(slug: string): void {
  const harita = { ...ilerlemeHaritasi() };
  delete harita[slug];
  yaz(ANAHTAR.ilerleme, harita);
  yayinla();
}

export function ilerlemeTemizle(): void {
  yaz(ANAHTAR.ilerleme, {});
  yaz(ANAHTAR.izlenen, {});
  yayinla();
}

/* --------------------------- izlenen bölümler --------------------------- */

export function izlenenHaritasi(): Record<string, number> {
  if (!onbellekler.izlenen) onbellekler.izlenen = oku<Record<string, number>>(ANAHTAR.izlenen, {});
  return onbellekler.izlenen;
}

/** anahtar: `${slug}|${bolumSira}` */
export function izlenenEkle(slug: string, bolum: number): void {
  const harita = { ...izlenenHaritasi(), [`${slug}|${bolum}`]: Date.now() };
  yaz(ANAHTAR.izlenen, harita);
  yayinla();
}

export function izlenenMi(slug: string, bolum: number): boolean {
  return Boolean(izlenenHaritasi()[`${slug}|${bolum}`]);
}

export function izlenenCikar(slug: string, bolum: number): void {
  const harita = { ...izlenenHaritasi() };
  delete harita[`${slug}|${bolum}`];
  yaz(ANAHTAR.izlenen, harita);
  yayinla();
}

/* ------------------------------ izleme listesi ------------------------------ */

export function liste(): ListeKaydi[] {
  if (!onbellekler.listem) onbellekler.listem = oku<ListeKaydi[]>(ANAHTAR.listem, []);
  return onbellekler.listem;
}

export function listede(slug: string): boolean {
  return liste().some((k) => k.slug === slug);
}

export function listeEkle(kayit: ListeKaydi): void {
  if (listede(kayit.slug)) return;
  yaz(ANAHTAR.listem, [kayit, ...liste()]);
  yayinla();
}

export function listeCikar(slug: string): void {
  yaz(ANAHTAR.listem, liste().filter((k) => k.slug !== slug));
  yayinla();
}

export function listeDegistir(kayit: ListeKaydi): void {
  if (listede(kayit.slug)) listeCikar(kayit.slug);
  else listeEkle(kayit);
}

/* -------------------------------- tercihler -------------------------------- */

export function tercihler(): Tercihler {
  if (!onbellekler.tercih) {
    onbellekler.tercih = { ...VARSAYILAN_TERCIH, ...oku<Partial<Tercihler>>(ANAHTAR.tercih, {}) };
  }
  return onbellekler.tercih;
}

export function tercihKaydet(degisiklik: Partial<Tercihler>): void {
  yaz(ANAHTAR.tercih, { ...tercihler(), ...degisiklik });
  yayinla();
}

/* --------------------------- çalışmayan kaynaklar --------------------------- */

export function calismayanlar(): string[] {
  if (!onbellekler.calismayan) onbellekler.calismayan = oku<string[]>(ANAHTAR.calismayan, []);
  return onbellekler.calismayan;
}

/** Kullanıcı "bu kaynak çalışmıyor" dediğinde url eklenir; bir daha önerilmez. */
export function calismayanIsaretle(url: string): void {
  const dizi = calismayanlar();
  if (dizi.includes(url)) return;
  yaz(ANAHTAR.calismayan, [url, ...dizi].slice(0, 500));
  yayinla();
}

export function calismayanMi(url: string): boolean {
  return calismayanlar().includes(url);
}

/** Veri ihracı/temizliği için tüm kullanıcı durumu. */
export function tumDurum(): Record<string, unknown> {
  return {
    ilerleme: ilerlemeHaritasi(),
    izlenen: izlenenHaritasi(),
    listem: liste(),
    tercih: tercihler(),
    calismayan: calismayanlar(),
  };
}

/**
 * Birleştirilmiş (yerel + sunucu) durumu yazar; hesap senkronu bunu kullanır.
 * Bilinmeyen alanlar yok sayılır; eksik alanlar olduğu gibi bırakılır.
 */
export function durumYaz(
  veri: Partial<Record<'ilerleme' | 'izlenen' | 'listem' | 'tercih' | 'calismayan', unknown>>
): void {
  const harita = veri.ilerleme;
  if (harita && typeof harita === 'object') yaz(ANAHTAR.ilerleme, harita);
  const iz = veri.izlenen;
  if (iz && typeof iz === 'object') yaz(ANAHTAR.izlenen, iz);
  if (Array.isArray(veri.listem)) yaz(ANAHTAR.listem, veri.listem);
  const t = veri.tercih;
  if (t && typeof t === 'object') yaz(ANAHTAR.tercih, { ...tercihler(), ...(t as Partial<Tercihler>) });
  if (Array.isArray(veri.calismayan)) yaz(ANAHTAR.calismayan, veri.calismayan);
  yayinla();
}

/** Tüm yerel kullanıcı durumunu siler (KVKK: hesabımı sil). */
export function durumTemizle(): void {
  if (!tarayiciVar()) return;
  for (const anahtar of Object.values(ANAHTAR)) window.localStorage.removeItem(anahtar);
  yayinla();
}
