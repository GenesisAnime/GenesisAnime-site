/**
 * akis.ts — akış köprüsünün **istemci** tarafı
 *
 * Neden var: ölçüm (docs/olcum/akis-2026-10-02.json) iki şeyi gösterdi —
 * (1) bazı kaynakların embed sayfası Workers tarafında doğrudan akışa
 * çevrilebiliyor, (2) tarayıcı aynı imzalı CDN adresine doğrudan 403 alıyor.
 * Yani videoyu kendi `<video>` elemanımızda oynatmanın şartı, baytların
 * sunucumuzdaki aktarım ucundan geçmesi (`docs/12-akis-koprusu.md`).
 *
 *   GET {API}/akis/coz?kaynak=<embed>       → { ok, kaynakAdi, tur, url, imzaBitis, aktarim }
 *   GET {API}/akis/aktar?u=<imzalı akış>    → akışın kendisi (Range korunur)
 *
 * Bu modül bilerek **saf ve React'sizdir**: karar kuralları (konum eki, taze
 * çözümleme, medya hatası sınıflandırması) tarayıcıya girmeden test edilebilsin
 * diye. Bileşen (`IzleIstemci.tsx`) yalnızca buradaki fonksiyonları çağırır.
 *
 * Üç kural:
 *   1. **Konum korunur.** Kaynak değişince oynatma adresine `#t=<saniye>` eklenir
 *      (OpenAnime analizinde ölçülen davranış: `dosya + "#t=" + floor(currentTime)`;
 *      bkz. docs/13). Tarayıcı konum ekini yok sayarsa bileşen `loadedmetadata`
 *      sonrası konumu açıkça kurar — sözleşme iki yollu sabitlenir.
 *   2. **Taze çözümleme bir kez.** İmzalar günlük; gece yarısını geçen adres
 *      403/502 verir. İstemci bunu 2 baytlık yoklamayla ayırt eder ve kaynak
 *      seçimi başına **en çok bir kez** `?t=` ile önbelleği atlayıp yeniden
 *      çözümler. Sonsuz döngü yok.
 *   3. **Çözülemeyen kaynak iframe'de kalır.** Çözümleme (veya taze deneme)
 *      başarısızsa hiçbir şey değişmez; kaynak bugünkü gömülü oynatıcıyla açılır.
 */

/** `/akis/coz` yanıtının istemcinin kullandığı alanları. */
export interface AkisCozumu {
  kaynakAdi: string;
  /** 'mp4' | 'hls' | 'dash' — bugün yalnız mp4 kendi `<video>`'muzda oynar. */
  tur: string;
  /** İmzanın bitiş anı (epoch ms) — bilinmiyorsa null. */
  imzaBitis: number | null;
  /** Aktarım ucundan geçen oynatma adresi (`<video src>` olacak). */
  aktarim: string;
}

export type AkisSonucu = { ok: true; akis: AkisCozumu } | { ok: false; hata: string };

/**
 * Köprünün tabanı. Derleme anında gömülür (Next `NEXT_PUBLIC_*` değerini metne
 * çevirir); tanımsızsa istemci hiç denemez — API'siz derlemede Mail.ru kaynakları
 * eskisi gibi iframe'de oynar.
 *
 * Fonksiyon biçimi bilinçli: testler modülü içe aktardıktan sonra da bu değeri
 * değiştirebilsin (derlemede yine sabit metne dönüşür).
 */
export function akisTabani(): string {
  return (process.env.NEXT_PUBLIC_API || '').replace(/\/$/, '');
}

/** Çözümleme isteğinin üst sınırı (ölçüm: edge'de ~2,8 sn). */
export const AKIS_ZAMAN_ASIMI_MS = 12_000;

/** Kendi `<video>` elemanımıza alınabilecek player'lar (sunucudaki çözümleyiciyle aynı kapsam). */
export const AKIS_PLAYERLARI = ['MAIL'];

/** Köprü bu derlemede var mı? */
export function akisVarMi(): boolean {
  return akisTabani().length > 0;
}

/** Adres Mail.ru embed'i mi? (sunucudaki `kaynakTuru` ile aynı kapsam) */
export function mailAdresiMi(adres: string): boolean {
  try {
    return /(^|\.)my\.mail\.ru$/i.test(new URL(adres).hostname);
  } catch {
    return false;
  }
}

/**
 * Bu kaynak kendi oynatıcımıza alınmalı mı? Karar **dar** tutulur: player damgası
 * MAIL ve adres gerçekten my.mail.ru olmalı; yanlış damgalanmış bir kaynak için
 * boşa sunucu isteği yapılmaz (çözümleme zaten `desteklenmiyor` dönerdi).
 */
export function akisAdayi(player: string, adres: string): boolean {
  return AKIS_PLAYERLARI.includes(player) && mailAdresiMi(adres);
}

/**
 * Çözümleme adresi. `taze` ise `t` parametresi eklenir: uç bunu görünce
 * önbelleği atlar (imzası düşmüş adresi tazelemek için tek yol).
 */
export function cozAdresi(kaynak: string, taze = false, simdi = Date.now()): string {
  const temel = `${akisTabani()}/akis/coz?kaynak=${encodeURIComponent(kaynak)}`;
  return taze ? `${temel}&t=${Math.floor(simdi)}` : temel;
}

/**
 * Embed adresini akışa çevirir. **Asla fırlatmaz**: ağ hatası, zaman aşımı ve
 * bozuk gövde sınıflandırılmış `{ ok:false, hata }` olarak döner ki oynatıcı
 * sessizce iframe yoluna düşebilsin.
 */
export async function akisCoz(
  kaynak: string,
  secenekler: {
    taze?: boolean;
    simdi?: number;
    fetchImpl?: typeof fetch;
    zamanAsimiMs?: number;
  } = {}
): Promise<AkisSonucu> {
  const {
    taze = false,
    simdi = Date.now(),
    fetchImpl = fetch,
    zamanAsimiMs = AKIS_ZAMAN_ASIMI_MS,
  } = secenekler;
  if (!akisVarMi()) return { ok: false, hata: 'kopru-yok' };

  const denetleyici = new AbortController();
  const zamanlayici = setTimeout(() => denetleyici.abort(), zamanAsimiMs);
  try {
    const yanit = await fetchImpl(cozAdresi(kaynak, taze, simdi), {
      signal: denetleyici.signal,
      headers: { Accept: 'application/json' },
    });
    let govde: unknown = null;
    try {
      govde = await yanit.json();
    } catch {
      return { ok: false, hata: 'yanit-bozuk' };
    }
    const v = (govde ?? null) as Record<string, unknown> | null;
    if (!yanit.ok || !v || v.ok !== true) {
      const hata = v && typeof v.hata === 'string' ? v.hata : `durum-${yanit.status}`;
      return { ok: false, hata };
    }
    const aktarim = typeof v.aktarim === 'string' ? v.aktarim : '';
    if (!aktarim) return { ok: false, hata: 'aktarim-yok' };
    return {
      ok: true,
      akis: {
        kaynakAdi: typeof v.kaynakAdi === 'string' ? v.kaynakAdi : '',
        tur: typeof v.tur === 'string' ? v.tur : '',
        imzaBitis: typeof v.imzaBitis === 'number' ? v.imzaBitis : null,
        aktarim,
      },
    };
  } catch (hata) {
    const ad = (hata as { name?: string } | null)?.name;
    return { ok: false, hata: ad === 'AbortError' ? 'zaman-asimi' : 'ag-hatasi' };
  } finally {
    clearTimeout(zamanlayici);
  }
}

/**
 * Aktarım ucunun durumu: video elemanı HTTP kodunu göremediği için gerçek neden
 * **2 baytlık yoklamayla** öğrenilir. `cache: 'no-store'` şart — yoksa tarayıcı
 * baytları önbellekten verip yenilenen bağlantıyı eski sanabilir.
 * Ağ hatasında 0 döner (durum bilinmiyor).
 */
export async function aktarimDurumu(aktarim: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  try {
    const yanit = await fetchImpl(aktarim, {
      headers: { Range: 'bytes=0-1' },
      cache: 'no-store',
    });
    return yanit.status;
  } catch {
    return 0;
  }
}

/**
 * Bu durum taze çözümleme nedenidir mi?
 *   403 → imza düştü (Mail.ru süresi geçmiş adresi reddediyor)
 *   502 → aktarım ucu yukarı akışta medya olmayan yanıt gördü (expired imzada
 *         Mail.ru HTML 403 döndürür; uç bunu 502 `medya-degil` diye sınıflar)
 */
export function akisYenilenmeliMi(durum: number): boolean {
  return durum === 403 || durum === 502;
}

/**
 * `MediaError.code` taze çözümlemeye değer mi? (1 abort: kullanıcı iptal etti,
 * 3 decode: baytlar geldi ama çözülemedi — yeni adres bir şeyi değiştirmez.)
 */
export function medyaHatasiTazeGerektirir(kod: number | null | undefined): boolean {
  return kod === 2 || kod === 4;
}

/** Konum eki: `#t=<tam saniye>`; 1 sn altı ve geçersiz değerler ek üretmez. */
export function konumEki(saniye: number): string {
  const t = Math.floor(saniye);
  return Number.isFinite(t) && t >= 1 ? `#t=${t}` : '';
}

/** Oynatma adresine konum ekini uygular (varsa eski ek atılır). */
export function aktarimAdresi(akis: AkisCozumu, baslangic = 0): string {
  return `${akis.aktarim.split('#')[0]}${konumEki(baslangic)}`;
}

/** Kendi `<video>` elemanımızın oynatabildiği biçimler (HLS/DASH ayrı iş). */
export function akisOynatilirMi(tur: string): boolean {
  return tur === 'mp4';
}

/** Kullanıcıya gösterilen durum notları (tek kaynaktan; bileşen metin yazmaz). */
export type AkisNotu =
  | 'cozulemedi'
  | 'tur-desteklenmiyor'
  | 'akis-durdu'
  | 'akis-erisilemedi'
  | 'medya-desteklemiyor'
  | 'akis-tazelendi';

const NOTLAR: Record<AkisNotu, string> = {
  cozulemedi: 'Akış çözümlenemedi; kaynak kendi oynatıcısıyla açıldı.',
  'tur-desteklenmiyor':
    'Kaynak mp4 dışı bir biçimde (HLS/DASH) sunuluyor; kendi oynatıcımız şimdilik yalnız mp4 oynatıyor.',
  'akis-durdu': 'Akış oynatılamadı; kaynak kendi oynatıcısıyla açıldı.',
  'akis-erisilemedi': 'Aktarım ucuna ulaşılamadı; kaynak kendi oynatıcısıyla açıldı.',
  'medya-desteklemiyor': 'Bu yayın kendi oynatıcımızda çözülemedi; kaynak kendi oynatıcısıyla açıldı.',
  'akis-tazelendi': 'Akış bağlantısı tazelendi; kaldığın yerden devam ediliyor.',
};

export function akisNotuMetni(not: AkisNotu): string {
  return NOTLAR[not];
}
