/**
 * akis-kayit.ts — site playerının kaynak kaydı
 * ============================================
 * İki işi tek yerde yapar:
 *
 *  1. **Cihaz hafızası:** hangi host bu cihazda gerçekten oynadı? Zincir bir
 *     sonraki bölümde ilk denemeyi kanıtlı host'la yapar; kullanıcı sekiz
 *     bilinmeyen host'u boşa denemez. Veri yalnızca bu cihazda (localStorage)
 *     durur ve 30 gün sonra kendiliğinden düşer.
 *     Kanıt **zamanla azalır**: son 14 günde oynamayan host kanıtını yitirir
 *     (`sonOk` penceresi) ve ölü URL tekrarları iyi bir host'u hemen düşürmez
 *     (hata sayısı başarıların kat kat üstüne çıkınca düşer).
 *  2. **Çözüm önbelleği:** başarıyla çözülen kaynağın imzalı adresi cihazda
 *     saklanır; aynı bölüm ikinci kez açıldığında kaynak yeniden taranmaz,
 *     oynatma doğrudan başlar.
 *  3. **Hata bildirimi:** çözülemeyen kaynak Worker'a bildirilir; yönetici
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
/** Kanıt penceresi: son başarı bu süreden eskiyse host kanıtlı sayılmaz. */
const KANIT_PENCERESI_MS = 14 * 24 * 60 * 60 * 1000;
/** Hoşgörü: ölü URL tekrarları kanıtı hemen silmesin (hata < ok × kat + taban). */
const HATA_HOSGORU_KATI = 3;
const HATA_HOSGORU_TABANI = 3;
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
  /** Son **başarılı** oynatma zamanı. Eski kayıtta yoktur → `son` yerine geçer. */
  sonOk?: number;
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
  const simdi = Date.now();
  kayitlar[host] = {
    ok: kayit.ok + (basarili ? 1 : 0),
    hata: kayit.hata + (basarili ? 0 : 1),
    son: simdi,
    sonOk: basarili ? simdi : kayit.sonOk,
  };
  depoYaz(HOST_ANAHTARI, kayitlar);
}

/**
 * Cihazda kanıtlı host mu?
 *
 * Şartlar: en az bir başarı, **son 14 günde** bir başarı (kanıt penceresi) ve
 * hata sayısı başarıları ezmemiş olması (hoşgörü). Böylece ölü URL tekrarları
 * iyi bir host'u hemen düşürmez; oynamayan host ise iki hafta sonra kanıtını
 * yitirir ve zincir yeniden gerçek sonuca bakar.
 */
export function hostKanitli(kayit: HostKaydi | undefined, simdi = Date.now()): boolean {
  if (!kayit || kayit.ok <= 0) return false;
  const sonOk = kayit.sonOk ?? kayit.son ?? 0;
  if (simdi - sonOk > KANIT_PENCERESI_MS) return false;
  return kayit.hata < kayit.ok * HATA_HOSGORU_KATI + HATA_HOSGORU_TABANI;
}

/**
 * Kanıtlı host'un puanı (0–1): başarı oranı × tazelik.
 * Tazelik her 14 günde yarıya iner; zincir sıralaması bayat kanıta yaslanmaz.
 */
export function hostPuani(kayit: HostKaydi | undefined, simdi = Date.now()): number {
  if (!kayit || kayit.ok + kayit.hata === 0) return 0;
  const temel = kayit.ok / (kayit.ok + kayit.hata);
  const sonOk = kayit.sonOk ?? kayit.son ?? 0;
  if (!sonOk) return 0;
  const tazelik = Math.pow(0.5, Math.max(0, simdi - sonOk) / KANIT_PENCERESI_MS);
  return temel * tazelik;
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

/* --------------------------- 2 · çözüm önbelleği --------------------------- */

/**
 * Cihazdaki çözüm önbelleği: "bu kaynak bir kez başarıyla çözüldü".
 *
 * Neden var: kullanıcı aynı bölümü ikinci kez açtığında zincir kaynağı yeniden
 * taramak zorunda kalıyordu (`/akis/coz` + upstream). Oysa başarılı çözüm
 * elimizde: imzalı akış adresini saklayıp doğrudan oynatmak yeterli. Böylece
 * "daha önce taranmış ve olumlu sonuç alınmış" kaynak bir daha taranmaz.
 *
 * Bayatlama: imza bitişi biliniyorsa kayıt o anda (`COZUM_IMZA_PAYI_MS` güvenlik
 * payıyla) düşer; bilinmiyorsa `COZUM_OMRU_MS` sonunda. Adres bayatlarsa `<video>`
 * 403/502 verir ve mevcut **taze çözümleme** yolu devreye girer — yani yanlış
 * giden önbelleğin bedeli en fazla bir yenileme turudur, kalıcı bozulma değil.
 */
const COZUM_ANAHTARI = 'genesisanime:v1:akis-cozum';
const COZUM_SINIRI = 80;
/** İmza bitişi bilinmeyen çözümün azami ömrü. */
export const COZUM_OMRU_MS = 6 * 60 * 60 * 1000;
/**
 * İmza bitiminden önce bırakılan güvenlik payı.
 * 30 sn: oynatıcının akışı açıp başlaması için yeterli, ama kullanılabilir ömrün
 * büyük kısmını yemez. (İlk sürümde 2 dakikaydı ve ömrü 2 dakikadan kısa kalan
 * her imza "süresi geçmiş" sayılıyordu — sınır testte yakalandı.)
 */
const COZUM_IMZA_PAYI_MS = 30 * 1000;

export interface CozumKaydi {
  /** Aktarım ucundan geçen oynatma adresi. */
  aktarim: string;
  tur: string;
  imzaBitis: number | null;
  /** Kayıt zamanı (epoch ms). */
  zaman: number;
}

function cozumGecerli(kayit: CozumKaydi | undefined, simdi: number): kayit is CozumKaydi {
  if (!kayit || typeof kayit.aktarim !== 'string' || !kayit.aktarim) return false;
  if (typeof kayit.imzaBitis === 'number' && kayit.imzaBitis > 0) {
    return simdi < kayit.imzaBitis - COZUM_IMZA_PAYI_MS;
  }
  return simdi - (kayit.zaman || 0) < COZUM_OMRU_MS;
}

function cozumleriOku(simdi = Date.now()): Record<string, CozumKaydi> {
  const ham = depoOku<Record<string, CozumKaydi>>(COZUM_ANAHTARI, {});
  const gecerliler: [string, CozumKaydi][] = [];
  for (const [adres, kayit] of Object.entries(ham)) {
    if (cozumGecerli(kayit, simdi)) gecerliler.push([adres, kayit]);
  }
  gecerliler.sort((a, b) => (b[1].zaman || 0) - (a[1].zaman || 0));
  return Object.fromEntries(gecerliler.slice(0, COZUM_SINIRI));
}

/** Bu kaynağın taze çözümü var mı? Varsa doğrudan oynatılır — tarama yok. */
export function cozumOku(adres: string, simdi = Date.now()): CozumKaydi | null {
  if (!adres) return null;
  const kayit = cozumleriOku(simdi)[adres];
  return cozumGecerli(kayit, simdi) ? kayit : null;
}

/** Başarılı çözümlemeyi cihaza yaz (sonraki ziyaret taramasız başlasın). */
export function cozumKaydet(
  adres: string,
  cozum: { aktarim: string; tur: string; imzaBitis?: number | null }
): void {
  if (!adres || !cozum.aktarim) return;
  const kayitlar = cozumleriOku();
  /* Aynı adres zaten kayıtlıysa yazma: `onCanPlay` bir oynatma sırasında birden
     çok kez tetiklenebiliyor, gereksiz localStorage yazımı yapmayalım. */
  const eski = kayitlar[adres];
  if (eski && eski.aktarim === cozum.aktarim && eski.tur === cozum.tur) return;
  /* Zaman damgası **kesin artan** tutulur: aynı milisaniyede yazılan kayıtlar
     sıralamada birbirini ezmesin (sınır düşürmesi en yeni kayıtları korusun). */
  const enYeni = Object.values(kayitlar).reduce((enBuyuk, k) => Math.max(enBuyuk, k.zaman || 0), 0);
  kayitlar[adres] = {
    aktarim: cozum.aktarim,
    tur: cozum.tur,
    imzaBitis: typeof cozum.imzaBitis === 'number' ? cozum.imzaBitis : null,
    zaman: Math.max(Date.now(), enYeni + 1),
  };
  const sirali = Object.entries(kayitlar)
    .sort((a, b) => (b[1].zaman || 0) - (a[1].zaman || 0))
    .slice(0, COZUM_SINIRI);
  depoYaz(COZUM_ANAHTARI, Object.fromEntries(sirali));
}

/** Taze çözümü olan kaynak adresleri — zincir bu kaynakları öne alır. */
export function cozumluAdresler(simdi = Date.now()): Set<string> {
  return new Set(Object.keys(cozumleriOku(simdi)));
}

/* ----------------------------- 3 · hata bildirimi ----------------------------- */

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
