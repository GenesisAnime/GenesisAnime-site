/**
 * akis-kayit.ts — site playerının kaynak kaydı
 * ============================================
 * İki işi tek yerde yapar:
 *
 *  1. **Cihaz hafızası:** hangi host bu cihazda gerçekten oynadı? Zincir bir
 *     sonraki bölümde ilk denemeyi kanıtlı host'la yapar; kullanıcı sekiz
 *     bilinmeyen host'u boşa denemez. Veri yalnızca bu cihazda (localStorage)
 *     durur ve 30 gün sonra kendiliğinden düşer.
 *  2. **Hata bildirimi:** çözülemeyen kaynak Worker'a bildirilir; yönetici
 *     panelinde host bazında toplanır ve kapsam listesi gerçek sonuçla beslenir.
 *     Kayıt önce kuyruğa yazılır: ağ yoksa kaybolmaz, `online` olayında gider.
 *     Gönderilen kayıt bir saatliğine “gönderildi defteri”ne işlenir; zincir aynı
 *     kaynağı yeniden denese bile ikinci istek çıkmaz.
 *     Gönderilen yalnızca kaynak URL'i, hata kodu, anime/bölüm; IP sunucuda
 *     tuzlanır, ham hâli saklanmaz (bkz. api/src/index.mjs · akisHataEkle).
 *
 * API adresi tanımlı değilse (NEXT_PUBLIC_API boş) bildirim tamamen no-op'tur;
 * cihaz hafızası yine çalışır — zincir API'siz derlemede de anlamlıdır.
 */

/**
 * Köprünün tabanı — `akis.ts` · `akisTabani()` ile aynı kural.
 * Kopya bilinçli: modül böylece Node'da tip silmeyle doğrudan yüklenebiliyor
 * (uzantısız `@/` içe aktarımı testte çözülemez) ve değeri **çağrı anında**
 * okuduğu için testler ayarı içe aktarma sonrası değiştirebiliyor.
 */
function akisTabani(): string {
  return (process.env.NEXT_PUBLIC_API || '').replace(/\/$/, '');
}

function akisVarMi(): boolean {
  return akisTabani().length > 0;
}

const HOST_ANAHTARI = 'genesisanime:v1:akis-hostlar';
const KUYRUK_ANAHTARI = 'genesisanime:v1:akis-hata-kuyruk';
const GONDERILDI_ANAHTARI = 'genesisanime:v1:akis-hata-gonderilen';
const HOST_SINIRI = 60;
const HOST_OMRU_MS = 30 * 24 * 60 * 60 * 1000;
const KUYRUK_SINIRI = 60;
const KUYRUK_OMRU_MS = 24 * 60 * 60 * 1000;
const GONDERILDI_SINIRI = 120;
/** Aynı kaynak + hata kodu bu süre içinde ikinci kez gönderilmez. */
const HATA_TEKRAR_MS = 60 * 60 * 1000;

export type AkisHataKodu =
  | 'cozulemedi'
  | 'tur-desteklenmiyor'
  | 'akis-durdu'
  | 'akis-erisilemedi'
  | 'medya-desteklemiyor';

export interface HostKaydi {
  ok: number;
  hata: number;
  son: number;
}

export interface AkisHataGirdisi {
  url: string;
  hata: AkisHataKodu;
  anime?: string | null;
  bolum?: number | null;
}

interface KuyrukKaydi extends AkisHataGirdisi {
  zaman: number;
}

/** Kaynak/embed adresinden host çıkarır — cihaz hafızasının anahtarı. */
export function kaynakHostu(adres: string): string {
  try {
    return new URL(adres).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function depoOku<T>(anahtar: string, varsayilan: T): T {
  if (typeof window === 'undefined') return varsayilan;
  try {
    const ham = window.localStorage.getItem(anahtar);
    if (!ham) return varsayilan;
    const veri = JSON.parse(ham);
    return veri && typeof veri === 'object' ? (veri as T) : varsayilan;
  } catch {
    return varsayilan;
  }
}

function depoYaz(anahtar: string, veri: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(anahtar, JSON.stringify(veri));
  } catch {
    /* kota dolu ya da gizli sekme — o an kaybolur, işlevi engellemez */
  }
}

/* ------------------------------ 1 · cihaz hafızası ------------------------------ */

/**
 * Bu cihazda görülen host kayıtları: `ok` = akış gerçekten oynadı,
 * `hata` = çözülemedi/oynamadı. Süresi geçenler ve fazlalıklar burada elenir.
 */
export function hostBasarilari(): Record<string, HostKaydi> {
  const ham = depoOku<Record<string, HostKaydi>>(HOST_ANAHTARI, {});
  const simdi = Date.now();
  const gecerliler: [string, HostKaydi][] = [];
  for (const [host, kayit] of Object.entries(ham)) {
    if (!kayit || typeof kayit.ok !== 'number' || typeof kayit.hata !== 'number') continue;
    if (simdi - (kayit.son || 0) > HOST_OMRU_MS) continue;
    gecerliler.push([host, kayit]);
  }
  gecerliler.sort((a, b) => (b[1].son || 0) - (a[1].son || 0));
  return Object.fromEntries(gecerliler.slice(0, HOST_SINIRI));
}

/** Kaynağın host'u için başarı/başarısızlık sayacını işler. */
export function hostBasarisiKaydet(adres: string, basarili: boolean): void {
  const host = kaynakHostu(adres);
  if (!host) return;
  const kayitlar = hostBasarilari();
  const kayit = kayitlar[host] ?? { ok: 0, hata: 0, son: 0 };
  kayitlar[host] = {
    ok: kayit.ok + (basarili ? 1 : 0),
    hata: kayit.hata + (basarili ? 0 : 1),
    son: Date.now(),
  };
  depoYaz(HOST_ANAHTARI, kayitlar);
}

/** Cihazda kanıtlı host: en az bir başarı var ve başarılar geride değil. */
export function hostKanitli(kayit: HostKaydi | undefined): boolean {
  return Boolean(kayit && kayit.ok > 0 && kayit.ok >= kayit.hata);
}

/** Kanıtlı host'un puanı (0–1): zincir sıralamasında öne almak için. */
export function hostPuani(kayit: HostKaydi | undefined): number {
  if (!kayit || kayit.ok + kayit.hata === 0) return 0;
  return kayit.ok / (kayit.ok + kayit.hata);
}

/**
 * Verilen kaynak adresleri arasında cihazda kanıtlı en iyi host'un sırası.
 * `null` → kanıtlı host yok; varsayılan seçim değişmemeli.
 */
export function kanitliSira(adresler: string[]): number | null {
  const kayitlar = hostBasarilari();
  let enIyiSira: number | null = null;
  let enIyiPuan = 0;
  adresler.forEach((adres, sira) => {
    const kayit = kayitlar[kaynakHostu(adres)];
    if (!hostKanitli(kayit)) return;
    const puan = hostPuani(kayit);
    if (enIyiSira === null || puan > enIyiPuan) {
      enIyiPuan = puan;
      enIyiSira = sira;
    }
  });
  return enIyiSira;
}

/* ----------------------------- 2 · hata bildirimi ----------------------------- */

function kuyrukOku(): KuyrukKaydi[] {
  const kuyruk = depoOku<KuyrukKaydi[]>(KUYRUK_ANAHTARI, []);
  return Array.isArray(kuyruk) ? kuyruk : [];
}

let dinleyiciKuruldu = false;

/** Çevrimiçi olunca kuyruğu boşaltmayı dene (yalnızca bir kez kurulur). */
function cevrimiciDinle(): void {
  if (dinleyiciKuruldu || typeof window === 'undefined') return;
  dinleyiciKuruldu = true;
  window.addEventListener('online', () => {
    void hataKuyruguGonder();
  });
}

/** Kimlik: kaynak URL'i + hata kodu — kuyruk ve gönderim defteri aynı anahtarı kullanır. */
function hataKimligi(kayit: { url: string; hata: string }): string {
  return `${kayit.url}|${kayit.hata}`;
}

/**
 * Gönderildi defteri: başarıyla (ya da kalıcı 400 ile) işlenen kayıtlar bir saat
 * burada durur. Kuyruktan zaten düşmüş bir kaydın yeniden gönderilmesini bu
 * engeller; süresi geçenler okuma sırasında elenir, defter 120 kayıtla sınırlıdır.
 */
function gonderildiOku(): Record<string, number> {
  const ham = depoOku<Record<string, number>>(GONDERILDI_ANAHTARI, {});
  const simdi = Date.now();
  const gecerliler: [string, number][] = [];
  for (const [kimlik, zaman] of Object.entries(ham)) {
    if (typeof zaman === 'number' && simdi - zaman < HATA_TEKRAR_MS) gecerliler.push([kimlik, zaman]);
  }
  gecerliler.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(gecerliler.slice(0, GONDERILDI_SINIRI));
}

function gonderildiKaydet(kimlik: string): void {
  const kayitlar = gonderildiOku();
  kayitlar[kimlik] = Date.now();
  const gecerliler = Object.entries(kayitlar).sort((a, b) => b[1] - a[1]).slice(0, GONDERILDI_SINIRI);
  depoYaz(GONDERILDI_ANAHTARI, Object.fromEntries(gecerliler));
}

/**
 * Kuyruğu sırayla gönderir; başarılıları düşer, ağ/429/5xx hatasında kalanı
 * korur (sıradakiler de büyük olasılıkla düşer, boşa denemez).
 */
export async function hataKuyruguGonder(): Promise<void> {
  if (!akisVarMi()) return;
  const kuyruk = kuyrukOku();
  if (!kuyruk.length) return;

  const kalanlar: KuyrukKaydi[] = [];
  for (let i = 0; i < kuyruk.length; i++) {
    const kayit = kuyruk[i];
    try {
      const yanit = await fetch(`${akisTabani()}/akis/hata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: kayit.url,
          hata: kayit.hata,
          anime: kayit.anime ?? undefined,
          bolum: kayit.bolum ?? undefined,
        }),
        keepalive: true,
      });
      // 400: kalıcı geçersiz kayıt — kuyrukta tutmanın anlamı yok.
      if (yanit.ok || yanit.status === 400) {
        gonderildiKaydet(hataKimligi(kayit));
        continue;
      }
      if (yanit.status === 429 || yanit.status >= 500) {
        kalanlar.push(kayit, ...kuyruk.slice(i + 1));
        break;
      }
      kalanlar.push(kayit);
    } catch {
      kalanlar.push(kayit, ...kuyruk.slice(i + 1));
      break;
    }
  }
  depoYaz(KUYRUK_ANAHTARI, kalanlar.slice(-KUYRUK_SINIRI));
}

/**
 * Çözülemeyen kaynağı bildirir: kuyruğa yazar ve hemen göndermeyi dener.
 * Aynı kaynak + hata kodu bir saat içinde tekrar gönderilmez; zincir aynı
 * kaynağı yeniden denese bile sunucu tarafı şişmez.
 */
export function akisHatasiBildir(girdi: AkisHataGirdisi): void {
  if (!akisVarMi() || typeof window === 'undefined') return;
  if (!girdi.url || !/^https?:/i.test(girdi.url)) return;

  const simdi = Date.now();
  const kayit: KuyrukKaydi = {
    url: girdi.url,
    hata: girdi.hata,
    anime: girdi.anime ?? null,
    bolum: girdi.bolum ?? null,
    zaman: simdi,
  };
  const kimlik = hataKimligi(kayit);
  if (kimlik in gonderildiOku()) return;

  const kuyruk = kuyrukOku().filter((k) => simdi - k.zaman < KUYRUK_OMRU_MS);
  const eski = kuyruk.find((k) => hataKimligi(k) === kimlik);
  if (eski && simdi - eski.zaman < HATA_TEKRAR_MS) return;

  depoYaz(KUYRUK_ANAHTARI, [...kuyruk.filter((k) => hataKimligi(k) !== kimlik), kayit].slice(-KUYRUK_SINIRI));
  cevrimiciDinle();
  void hataKuyruguGonder();
}
