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
  /** Akış türü: mp4, webm, hls veya dash. */
  tur: string;
  /** İmzanın bitiş anı (epoch ms) — bilinmiyorsa null. */
  imzaBitis: number | null;
  /** Aktarım ucundan geçen oynatma adresi (`<video src>` olacak). */
  aktarim: string;
}

export type AkisSonucu = { ok: true; akis: AkisCozumu } | { ok: false; hata: string };

export type AkisKaynakSinifi = 'calisiyor' | 'calismiyor' | 'cozuluyor' | 'denenmedi' | 'kapsam-disi' | 'gumulmez' | 'api-yok';

/** Çalışma durumu yalnız gerçek çözümleme sonucundan türetilir; tahmin rozeti vermez. */
export function akisKaynakSinifla(
  adres: string,
  secenekler: {
    embed: boolean;
    apiVar: boolean;
    kapsam: readonly string[] | null | undefined;
    hata?: string;
    sonuc?: { durum: 'bekliyor' | 'basarisiz' | 'calisiyor' };
  }
): AkisKaynakSinifi {
  if (secenekler.sonuc?.durum === 'basarisiz') return 'calismiyor';
  if (secenekler.sonuc?.durum === 'calisiyor') return 'calisiyor';
  if (secenekler.sonuc?.durum === 'bekliyor') return 'cozuluyor';
  if (!secenekler.embed) return 'gumulmez';
  if (!secenekler.apiVar || secenekler.hata === 'kopru-yok') return 'api-yok';
  if (secenekler.kapsam != null && !kapsamdaMi(secenekler.kapsam, adres)) return 'kapsam-disi';
  return 'denenmedi';
}

/** Çözümleyiciden dönen somut hatayı kullanıcı için okunur hâle getirir. */
export function akisSorunAciklamasi(hata: string): string {
  switch (hata) {
    case 'yol-yok': return 'Akış API’si bu sürümde yok; API dağıtımı güncellenmeli.';
    case 'desteklenmiyor': return 'Bu sağlayıcı için çözümleyici bulunmuyor; kaynak playerı kullanılabilir.';
    case 'embed-alinamadi': return 'Sağlayıcı sayfasına sunucu erişemedi; iframe playerı yine çalışabilir.';
    case 'kimlik-bulunamadi': return 'Player içinden video kimliği çıkarılamadı.';
    case 'akis-bulunamadi': return 'Açık ve güvenli MP4/WebM akışı bulunamadı; player JavaScript/API veya HLS kullanıyor olabilir.';
    case 'hedef-izinli-degil':
    case 'host-izinli-degil': return 'Bulunan medya sunucusu güvenli aktarım listesinde değil.';
    case 'tur-desteklenmiyor': return 'Kaynak MP4/WebM dışında bir biçim döndürdü.';
    case 'cok-fazla-istek': return 'Akış çözümleme sınırına ulaşıldı; sonra yeniden deneyin.';
    case 'ag-hatasi':
    case 'zaman-asimi': return 'Akış API’sine ulaşılamadı (ağ veya zaman aşımı).';
    default:
      if (hata.startsWith('tur-desteklenmiyor:')) return `Kaynak ${hata.slice('tur-desteklenmiyor:'.length).toUpperCase()} biçiminde akış döndürdü; kendi playerımız yalnız MP4/WebM oynatıyor.`;
      if (/^durum-\d+$/.test(hata)) return `Akış API’si HTTP ${hata.slice('durum-'.length)} döndürdü; API ve CORS ayarlarını kontrol edin.`;
      return `Akış çözümlenemedi (${hata}); kaynak playerı kullanılabilir.`;
  }
}

export function akisKapsamSorunuMetni(hata?: string): string {
  if (hata === 'kopru-yok') return 'Sitenin bu derlemesinde akış API adresi tanımlı değil; yerel başlatıcı API’yi de çalıştırmalı.';
  if (hata === 'durum-404') return 'API’de kapsam uç noktası bulunamadı; Mail.ru dışı sağlayıcılar için Worker güncellenmeli.';
  if (hata === 'ag-hatasi' || hata === 'zaman-asimi') return 'API kapsamı okunamadı; kaynak desteği ilk denemeye göre belli olacak.';
  return hata ? `Kaynak desteği bilgisi okunamadı (${hata}).` : '';
}

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
export const AKIS_VARSAYILAN_KAPSAM = ['my.mail.ru'];
export const AKIS_KAPSAM_OMRU_MS = 10 * 60 * 1000;
export const AKIS_KAPSAM_ZAMAN_ASIMI_MS = 8_000;

/** Köprü bu derlemede var mı? */
export function akisVarMi(): boolean {
  return akisTabani().length > 0;
}

export function hostEslesir(host: string, taban: string): boolean {
  const h = String(host || '').toLowerCase();
  const t = String(taban || '').toLowerCase();
  return h.length > 0 && t.length > 0 && (h === t || h.endsWith(`.${t}`));
}

/** Adres sunucunun ilan ettiği host kapsamıyla eşleşiyor mu? */
export function kapsamdaMi(kapsam: readonly string[] | null | undefined, adres: string): boolean {
  let host: string;
  try {
    host = new URL(adres).hostname;
  } catch {
    return false;
  }
  return (kapsam ?? AKIS_VARSAYILAN_KAPSAM).some((taban) => hostEslesir(host, taban));
}

export interface AkisKapsamSonucu {
  hostlar: string[] | null;
  surum: number | null;
  kaynak: 'sunucu' | 'varsayilan';
  hata?: string;
}

let kapsamOnbellek: { hostlar: string[]; surum: number | null; zaman: number } | null = null;

/** Kapsamı 10 dakika önbellekle; bozuk/eski API'de eski sürüm geriye uyumlu kalsın. */
export async function akisKapsami(
  secenekler: { fetchImpl?: typeof fetch; zamanAsimiMs?: number; simdi?: number; zorla?: boolean } = {}
): Promise<AkisKapsamSonucu> {
  const { fetchImpl = fetch, zamanAsimiMs = AKIS_KAPSAM_ZAMAN_ASIMI_MS, simdi = Date.now(), zorla = false } = secenekler;
  if (!akisVarMi()) return { hostlar: null, surum: null, kaynak: 'varsayilan', hata: 'kopru-yok' };
  if (!zorla && kapsamOnbellek && simdi - kapsamOnbellek.zaman < AKIS_KAPSAM_OMRU_MS) {
    return { hostlar: [...kapsamOnbellek.hostlar], surum: kapsamOnbellek.surum, kaynak: 'sunucu' };
  }

  const denetleyici = new AbortController();
  const zamanlayici = setTimeout(() => denetleyici.abort(), zamanAsimiMs);
  try {
    const yanit = await fetchImpl(`${akisTabani()}/akis/kapsam`, {
      signal: denetleyici.signal,
      headers: { Accept: 'application/json' },
    });
    let govde: unknown = null;
    try {
      govde = await yanit.json();
    } catch {
      return { hostlar: null, surum: null, kaynak: 'varsayilan', hata: 'yanit-bozuk' };
    }
    const v = (govde ?? null) as Record<string, unknown> | null;
    if (!yanit.ok || !v || v.ok !== true) {
      return { hostlar: null, surum: null, kaynak: 'varsayilan', hata: `durum-${yanit.status}` };
    }
    if (
      !Array.isArray(v.hostlar) ||
      v.hostlar.length > 64 ||
      !v.hostlar.every(
        (host) =>
          typeof host === 'string' &&
          host.length > 0 &&
          host.length <= 253 &&
          /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)
      )
    ) {
      return { hostlar: null, surum: null, kaynak: 'varsayilan', hata: 'govde-gecersiz' };
    }
    const hostlar = (v.hostlar as string[]).map((host) => host.toLowerCase());
    const surum = typeof v.surum === 'number' ? v.surum : null;
    kapsamOnbellek = { hostlar, surum, zaman: simdi };
    return { hostlar: [...hostlar], surum, kaynak: 'sunucu' };
  } catch (hata) {
    const ad = (hata as { name?: string } | null)?.name;
    return { hostlar: null, surum: null, kaynak: 'varsayilan', hata: ad === 'AbortError' ? 'zaman-asimi' : 'ag-hatasi' };
  } finally {
    clearTimeout(zamanlayici);
  }
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

/**
 * Kendi `<video>` elemanımızın oynatabildiği biçimler.
 * HLS: Safari yerel oynatır; diğer tarayıcılarda `hls.js` köprüsü takılır
 * (bileşen, `tur === 'hls'` görünce dinamik yükler). DASH desteklenmez.
 */
export function akisOynatilirMi(tur: string): boolean {
  return tur === 'mp4' || tur === 'webm' || tur === 'hls';
}

/** Kullanıcıya gösterilen durum notları (tek kaynaktan; bileşen metin yazmaz). */
export type AkisNotu =
  | 'cozulemedi'
  | 'akis-yogun'
  | 'tur-desteklenmiyor'
  | 'akis-durdu'
  | 'akis-erisilemedi'
  | 'medya-desteklemiyor'
  | 'akis-tazelendi';

const NOTLAR: Record<AkisNotu, string> = {
  cozulemedi: 'Akış çözümlenemedi; kaynağın playerını kullanabilir veya başka bir kaynak deneyebilirsin.',
  'akis-yogun': 'Akış servisi şu an yoğun (günlük istek sınırı); kaynağın playerını kullanabilir veya daha sonra yeniden deneyebilirsin.',
  'tur-desteklenmiyor':
    'Kaynak kendi oynatıcımızın çözemediği bir yayın biçiminde (ör. DASH) sunuluyor; kaynağın oynatıcısında açılabilir.',
  'akis-durdu': 'Akış oynatılamadı; kaynağın playerını kullanabilir veya başka bir kaynak deneyebilirsin.',
  'akis-erisilemedi': 'Aktarım ucuna ulaşılamadı; kaynağın playerını kullanabilir veya daha sonra yeniden deneyebilirsin.',
  'medya-desteklemiyor': 'Bu yayın kendi oynatıcımızda çözülemedi; kaynağın playerına geçebilir veya başka bir kaynak deneyebilirsin.',
  'akis-tazelendi': 'Akış bağlantısı tazelendi; kaldığın yerden devam ediliyor.',
};

export function akisNotuMetni(not: AkisNotu): string {
  return NOTLAR[not];
}
