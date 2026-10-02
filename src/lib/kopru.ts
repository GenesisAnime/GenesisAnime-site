/**
 * kopru.ts — gömülü oynatıcılarla postMessage köprüsü
 *
 * Neden var: kaynaklar `<iframe>` ile gömülüyor ve cross-origin olduğu için
 * video elemanına erişemiyoruz. Bazı host'lar ise **resmî postMessage API'si**
 * yayınlıyor; onlarda gerçek oynatma konumunu ve süresini öğrenebiliyor, hatta
 * oynat/duraklat/sar komutu gönderebiliyoruz.
 *
 * Ölçüm (tahmin değil): `tools/kopru-test.html` (olay kanalı) ve
 * `tools/kopru-komut-test.html` (komut kanalı) gerçek embed'lerle çalıştırıldı.
 * Kritik bulgular:
 *   1. VK `js_api=1` parametresi olmadan tek olay bile yayınlamıyor; parametre
 *      eklendiğinde `inited` (süre dahil) ve `timeupdate`/`seeked`/`started`
 *      olayları geliyor. `referrerPolicy="no-referrer"` bu kanalı engellemiyor.
 *   2. Komutlar **nesne** olarak gönderilmeli. `JSON.stringify` ile gönderilen
 *      aynı komutlar cevapsız kaldı; nesne biçiminde `seeked` + `started`
 *      olayları döndü. Bu yüzden `komutlar()` asla metin üretmez.
 *   3. Komut gönderildikten sonra cevap olayı gecikebilir; oynatıcı henüz
 *      dinleyici kurmamışken gönderilen komut sessizce kaybolur. Bu yüzden
 *      çağıran taraf komutu **olay gelene kadar yineler** (`komutDenemesi`).
 *   4. Sibnet (kaynakların ~%42'si) ve Dailymotion hiç cevap vermedi; onlar
 *      "opak" sınıfındadır: iframe kalır, ölü kontrol düğmesi gösterilmez.
 *
 * Veri kaynağı sapması: VK adresleri arşivde `href.li/?https://vk.com/...`
 * sarmalayıcısıyla yazılı. API gerçek origin ile konuşmak zorunda olduğu için
 * sarmalayıcı iframe'e girmeden önce çözülür.
 */

export type KopruAdi = 'vk' | 'ok' | 'mail';

export type KopruEylem = 'oynat' | 'duraklat' | 'sar';

export interface Kopru {
  ad: KopruAdi;
  /** Kullanıcıya gösterilen kısa host adı. */
  etiket: string;
  /** Ölçümle doğrulanmış: komut kanalı çalışıyor (oynat/duraklat/sar). */
  komut: boolean;
  /** Ölçümle doğrulanmış: gerçek saniye/süre geliyor (ilerleme çubuğu kurulabilir). */
  telemetri: boolean;
  /** En az bir "hazır" olayı geliyor — embed'in gerçekten yüklendiğinin kanıtı. */
  hazirSinyali: boolean;
}

export interface KopruOlayi {
  /** hazir: oynatıcı hazır · konum: gerçek saniye/süre · durum: oynuyor/duraklatıldı · yok: anlamsız yük */
  tur: 'hazir' | 'konum' | 'durum' | 'yok';
  /**
   * Oynatıcının bildirdiği ham olay adı (`inited`, `timeupdate`, `seeked`…).
   * Neden gerekli: komut sınaması yalnız `seeked` gibi **komuta özgü** bir olayı
   * kanıt sayar; sürekli akan `timeupdate` komut kanıtı değildir (yanlış pozitif).
   */
  ad?: string;
  saniye?: number;
  sure?: number;
  oynuyor?: boolean;
}

/**
 * **Önsel** yetenek tablosu — 2026-10-02 ölçümü (`tools/kopru-komut-test.html`,
 * 6 denemeli koşu). Artık kararın kaynağı değil, yalnızca **başlangıç varsayımı**:
 * site çalışırken kendi ölçümünü yapar ve `etkinKopru` ikisini birleştirir
 * (aşağıdaki "çalışma anı ölçümü" bölümü). Bir host konuşmaya başlarsa site bunu
 * kendiliğinden fark eder; kanıt olmadan düğme gösterilmez.
 *
 *   VK            → nesne biçiminde komut 1. denemede çalıştı; `seeked`, `started`,
 *                   34× `timeupdate` ve `duration: 1450` geldi.
 *   Odnoklassniki → 6 denemede yalnız `initToParent` + `inited`; saniye/süre yok.
 *   Mail.ru       → 1. denemede `inited` + `autoplay`, sonrası sessiz; süre yok.
 *   Sibnet, Dailymotion → hiç olay yok (köprü listesinde değiller).
 */
const KOPRU_ONOLERI: Record<KopruAdi, Kopru> = {
  vk: { ad: 'vk', etiket: 'VK', komut: true, telemetri: true, hazirSinyali: true },
  ok: { ad: 'ok', etiket: 'Odnoklassniki', komut: false, telemetri: false, hazirSinyali: true },
  mail: { ad: 'mail', etiket: 'Mail.ru', komut: false, telemetri: false, hazirSinyali: true },
};

/** Host → köprü eşlemesi. Ölçümde cevap veren host'lar; alt alan adları da kapsanır. */
const ESLESME: { desen: RegExp; ad: KopruAdi }[] = [
  { desen: /(^|\.)(vk\.com|vk\.video|vk\.ru)$/i, ad: 'vk' },
  { desen: /(^|\.)(ok\.ru|odnoklassniki\.ru|m\.ok\.ru)$/i, ad: 'ok' },
  { desen: /(^|\.)(my\.mail\.ru|mail\.ru)$/i, ad: 'mail' },
];

/**
 * Arşivdeki sarmalayıcıyı çözer: `https://href.li/?https://vk.com/...` →
 * `https://vk.com/...`. Yüzde kodlanmış biçimi de destekler. Çözülemezse girdi
 * aynen döner (toplam fonksiyon; asla throw etmez).
 */
export function sarmalayiciCoz(adres: string): string {
  if (!adres) return adres;
  const m = /^https?:\/\/href\.li\/\?(.+)$/i.exec(adres.trim());
  if (!m) return adres;
  const ham = m[1];
  if (/^https?%3a/i.test(ham)) {
    try {
      return decodeURIComponent(ham);
    } catch {
      return ham;
    }
  }
  return ham;
}

/** VK embed'i API için `js_api=1` ister; diğer parametreleri korur. */
function vkApiAc(adres: string): string {
  try {
    const u = new URL(adres);
    if (u.searchParams.get('js_api') === '1') return adres;
    u.searchParams.set('js_api', '1');
    return u.toString();
  } catch {
    return adres;
  }
}

/**
 * iframe'e verilecek gerçek adres: sarmalayıcı çözülür, köprü varsa oynatıcı
 * API'si etkinleştirilir. Sarmalayıcısız ve köprüsüz adresler dokunulmadan döner.
 */
export function kaynakAdresi(adres: string): string {
  const cozulmus = sarmalayiciCoz(adres);
  if (kopruBul(cozulmus) === 'vk') return vkApiAc(cozulmus);
  return cozulmus;
}

/**
 * Adresteki host **köprü listesinde mi**? Yalnızca eşleme yapar; yetenek kararı
 * `etkinKopru` içinde (önsel + bu cihazdaki ölçüm) verilir.
 */
export function kopruBul(adres: string): KopruAdi | null {
  if (!adres) return null;
  let host: string;
  try {
    host = new URL(sarmalayiciCoz(adres)).hostname;
  } catch {
    return null;
  }
  for (const { desen, ad } of ESLESME) {
    if (desen.test(host)) return ad;
  }
  return null;
}

/**
 * Eşleme + ölçüm birleşimi: oynatıcının tek çağrıda ihtiyacı olan şey.
 *
 * `simdi` **zorunlu**: varsayılan 0 verilirse "yaş negatif" çıkar ve ölçüm
 * bayat sayılırdı — yani okuyan her çağrı sessizce önsele düşerdi (02.10'da
 * tarayıcı doğrulamasında tam bu yaşandı: kayıt yazılıyordu ama görünmüyordu).
 * Tip sistemi artık saat unutmayı derleme hatasına çevirir.
 */
export function kopruCoz(adres: string, olcum: KopruOlcumu | null, simdi: number): EtkinKopru | null {
  const ad = kopruBul(adres);
  return ad ? etkinKopru(ad, olcum, simdi) : null;
}

/** Önsel satır (ölçüm olmadan beklenen yetenekler) — panel ve testler için. */
export function onselKopru(ad: KopruAdi): Kopru {
  return KOPRU_ONOLERI[ad];
}

/** Köprünün olay gönderdiği origin (mesaj filtrelemesi için). */
export function kopruOrigin(ad: KopruAdi): string {
  if (ad === 'vk') return 'https://vk.com';
  if (ad === 'ok') return 'https://ok.ru';
  return 'https://my.mail.ru';
}

/**
 * Komut gövde adayları. **Nesne** döner — ölçümde metin biçimi cevapsız kaldı.
 * Birden fazla biçim denenir çünkü aynı ailenin host'ları farklı alan adı
 * kullanabiliyor; sıra, en olası biçim önce gelecek şekilde.
 */
export function komutlar(ad: KopruAdi, eylem: KopruEylem, saniye = 0): unknown[] {
  if (eylem === 'oynat') return [{ method: 'play' }];
  if (eylem === 'duraklat') return [{ method: 'pause' }];
  /* `time` ölçümde çalışan alan adı; `seconds` değil (o biçim hedefi
     değiştirmedi). Yine de ikinci aday olarak duruyor, zararsız. */
  if (ad === 'vk') return [{ method: 'seek', time: saniye }];
  return [
    { method: 'seek', time: saniye },
    { method: 'seek', seconds: saniye },
  ];
}

function sayi(deger: unknown): number | undefined {
  return typeof deger === 'number' && Number.isFinite(deger) ? deger : undefined;
}

function nesneCoz(veri: unknown): Record<string, unknown> | null {
  if (veri && typeof veri === 'object') return veri as Record<string, unknown>;
  if (typeof veri !== 'string') return null;
  const kirp = veri.trim();
  if (!kirp.startsWith('{')) return null;
  try {
    const v = JSON.parse(kirp);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Gelen postMessage yükünü tek biçime indirger. Host'ların yük şemaları
 * birbirinden farklı (VK düz olay nesnesi, OK `data` içinde, Mail.ru bazen
 * düz metin "inited") — hepsi burada normalleştirilir. Tanınmayan yük `yok`.
 */
export function olayCoz(veri: unknown): KopruOlayi {
  /* Mail.ru hazır işaretini bazen düz metin (`inited`), bazen JSON ile
     kodlanmış tırnaklı metin (`"inited"`) olarak gönderiyor — ikisi de kabul. */
  if (typeof veri === 'string') {
    let metin = veri.trim();
    if (metin.startsWith('"') && metin.endsWith('"')) {
      try {
        const parsed = JSON.parse(metin);
        if (typeof parsed === 'string') metin = parsed.trim();
      } catch {
        /* tırnaklı ama bozuk: metin olarak denenir */
      }
    }
    if (metin.toLowerCase() === 'inited') return { tur: 'hazir' };
  }

  let v = nesneCoz(veri);
  if (!v) return { tur: 'yok' };

  /* OK: { data: { type: 'initToParent', ... } } */
  if (v.data && typeof v.data === 'object') {
    const ic = v.data as Record<string, unknown>;
    if (ic.type === 'initToParent') return { tur: 'hazir' };
    v = { ...ic, ...v };
  }

  const olayAdi = typeof v.event === 'string' ? v.event.toLowerCase() : '';
  const durum = typeof v.state === 'string' ? v.state.toLowerCase() : '';
  const saniye = sayi(v.time) ?? sayi(v.currentTime);
  const sure = sayi(v.duration);
  const oynuyor =
    durum === 'playing' || olayAdi === 'started' || olayAdi === 'playing'
      ? true
      : durum === 'paused' || olayAdi === 'paused'
        ? false
        : undefined;

  const ad = olayAdi || durum || undefined;

  if (olayAdi === 'inited' || durum === 'inited') {
    return { tur: 'hazir', ad: 'inited', saniye, sure };
  }
  if (saniye !== undefined || sure !== undefined) {
    return { tur: 'konum', ad, saniye, sure, oynuyor };
  }
  if (oynuyor !== undefined) return { tur: 'durum', ad, saniye, sure, oynuyor };
  return { tur: 'yok' };
}

/**
 * Aynı komutu kaç kez yineleyeceğimiz. Ölçümde komut, oynatıcı dinleyiciyi
 * kurmadan gönderildiğinde sessizce kayboluyordu; bu yüzden komut, onay olayı
 * gelene kadar (en fazla bu kadar) yinelenir.
 */
export const KOMUT_DENEME_SAYISI = 6;

/** Denemeler arası bekleme (ms). Oynatıcının dinleyici kurması zaman alıyor. */
export const KOMUT_DENEME_ARASI_MS = 4000;

/** `n`. denemenin gönderileceği an (ms). 0 tabanlı. */
export function komutZamanlamasi(n: number, arasi = KOMUT_DENEME_ARASI_MS): number {
  return Math.max(0, Math.trunc(n)) * arasi;
}

/** Sar komutunun onayında kabul edilen sapma (oynatıcı örneklemesi kayabilir). */
export const SAR_TOLERANS_SANIYE = 8;

/**
 * Gelen olay, gönderdiğimiz komutun **etki ettiğini** kanıtlıyor mu?
 *
 * Neden gerekli: ölçümde komut, oynatıcı dinleyiciyi kurmadan gönderildiğinde
 * sessizce kayboldu. Bu yüzden komut yinelenir ve ancak bu fonksiyon true
 * döndüğünde tekrar durdurulur — "gönderdim, oldu sayılır" varsayımı yok.
 */
export function komutOnaylandi(eylem: KopruEylem, hedef: number, olay: KopruOlayi): boolean {
  if (olay.tur === 'yok') return false;
  if (eylem === 'oynat') return olay.oynuyor === true;
  if (eylem === 'duraklat') return olay.oynuyor === false;
  /* Sar: hedef saniyeye yakın bir konum bildirimi geldiyse uygulanmıştır. */
  return (
    olay.tur === 'konum' &&
    typeof olay.saniye === 'number' &&
    Math.abs(olay.saniye - hedef) <= SAR_TOLERANS_SANIYE
  );
}

/* ================================================================ */
/* Çalışma anı ölçümü                                               */
/* ================================================================ */
/**
 * Neden: koda gömülü yetenek tablosu, ölçüm yapıldığı günün fotoğrafıdır.
 * Host'lar kendi API'lerini değiştiriyor (bir gün susan bir kaynak ertesi gün
 * konuşabilir), ama gömülü tabloyla site bunu asla fark etmez. Bu bölüm o
 * fotoğrafı **önsel**e indirir: site kendi kullanıcı trafiğinde yetenek ölçer,
 * sonucu cihazda hatırlar ve önselin önüne koyar.
 *
 * Kural: ölçüm yalnızca **kanıt toplar**, yokluktan yetenek uydurmaz. Bir
 * yeteneği kapatmak için ayrıca başarısız sınama sayacı gerekir — "bugün
 * göremedim" ile "yok" aynı şey değildir.
 */

export const OLCUM_SURUMU = 1;

/** Ölçüm bu yaştan sonra güvenilmez sayılır ve önsele dönülür. */
export const OLCUM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Aynı host için komut sınaması en sık bu aralıkla yapılır. */
export const SINA_ARASI_MS = 7 * 24 * 60 * 60 * 1000;

/** Aynı host için bu kadar başarısız sınama, varsayımı geçersiz kılar. */
export const SINA_BASARISIZ_SINIRI = 2;

/** İki olay arası bu süreden uzunsa yeni bir oturum sayılır (gözlem sayacı). */
export const OTURUM_ARASI_MS = 60 * 60 * 1000;

/**
 * Sınama penceresi: no-op sar komutundan sonra bu süre içinde `seeked`
 * gelmezse sınama başarısız sayılır.
 */
export const SINA_PENCERESI_MS = 20000;

export interface KopruOlcumu {
  ad: KopruAdi;
  /** En az bir hazır olayı görüldü. */
  hazirSinyali: boolean;
  /** Gerçek saniye/süre bildirimi görüldü. */
  telemetri: boolean;
  /** Komut kanalı kanıtlandı (kullanıcı komutu veya no-op sar sınaması). */
  komut: boolean;
  /** Kaç ayrı oturumda olay geldi. */
  gozlem: number;
  /** Son olayın zamanı (epoch ms). */
  sonGorulme: number;
  /** Son komut sınaması (epoch ms); 0 = hiç sınanmadı. */
  sonSina: number;
  /** Ardışık başarısız sınama sayısı. */
  basarisizSina: number;
  /** Şema sürümü: alanlar değişirse eski kayıt yok sayılır. */
  surum: number;
}

export interface EtkinKopru extends Kopru {
  /** Yeteneğin kaynağı: bu cihazda ölçüldü mü, önsel varsayım mı. */
  kaynak: 'olcum' | 'onsel';
  /** Bu cihazda biriken ölçüm (yoksa null). */
  olcum: KopruOlcumu | null;
}

/** Boş kayıt. Zaman alanları 0'dır; "hiç görülmedi" demektir. */
export function yeniOlcum(ad: KopruAdi): KopruOlcumu {
  return {
    ad,
    hazirSinyali: false,
    telemetri: false,
    komut: false,
    gozlem: 0,
    sonGorulme: 0,
    sonSina: 0,
    basarisizSina: 0,
    surum: OLCUM_SURUMU,
  };
}

/**
 * Kayıt taze ve aynı şemada mı? `simdi` zorunlu — 0 ile çağırmak her kaydı
 * bayat gösterirdi (bkz. `kopruCoz` başındaki not).
 */
export function olcumGecerliMi(olcum: KopruOlcumu | null, simdi: number): boolean {
  if (!olcum) return false;
  if (olcum.surum !== OLCUM_SURUMU) return false;
  if (!olcum.sonGorulme) return false;
  const yas = simdi - olcum.sonGorulme;
  return yas >= 0 && yas <= OLCUM_TTL_MS;
}

/**
 * Gelen olayla ölçümü günceller. Saf fonksiyon: yeni nesne döner, girdiyi
 * değiştirmez. Yalnızca pozitif kanıt ekler.
 */
export function olcumGuncelle(
  onceki: KopruOlcumu | null,
  ad: KopruAdi,
  olay: KopruOlayi,
  simdi: number
): KopruOlcumu {
  const temel = onceki && onceki.surum === OLCUM_SURUMU ? { ...onceki } : yeniOlcum(ad);
  if (olay.tur === 'yok') return temel;

  /* Yeni oturum mu: uzun bir sessizlikten sonra gelen olay sayacı artırır. */
  const yeniOturum = !temel.sonGorulme || simdi - temel.sonGorulme > OTURUM_ARASI_MS;
  if (yeniOturum) temel.gozlem += 1;

  if (olay.tur === 'hazir') temel.hazirSinyali = true;
  if (olay.tur === 'konum' || olay.tur === 'hazir') {
    if (typeof olay.sure === 'number' && olay.sure > 0) temel.telemetri = true;
    if (typeof olay.saniye === 'number' && olay.saniye > 0) temel.telemetri = true;
  }
  temel.sonGorulme = simdi;
  return temel;
}

/** Komut kanıtı kaydeder (başarılı sınama veya kullanıcı komutunun onayı). */
export function olcumKomutOnayla(onceki: KopruOlcumu | null, ad: KopruAdi, simdi: number): KopruOlcumu {
  const temel = onceki && onceki.surum === OLCUM_SURUMU ? { ...onceki } : yeniOlcum(ad);
  temel.komut = true;
  temel.basarisizSina = 0;
  temel.sonSina = simdi;
  if (!temel.sonGorulme) temel.sonGorulme = simdi;
  return temel;
}

/** Sınama denendi ama kanıt gelmedi. */
export function olcumSinaBasarisiz(onceki: KopruOlcumu | null, ad: KopruAdi, simdi: number): KopruOlcumu {
  const temel = onceki && onceki.surum === OLCUM_SURUMU ? { ...onceki } : yeniOlcum(ad);
  temel.basarisizSina += 1;
  temel.sonSina = simdi;
  /* Başarısız sınama da host'la **taze temastır**: kayıt "bugün baktım" sayılır,
     yoksa bayat sayılıp önsele dönülürdü ve demote kararı hiç uygulanmazdı. */
  if (!temel.sonGorulme) temel.sonGorulme = simdi;
  if (temel.basarisizSina >= SINA_BASARISIZ_SINIRI) temel.komut = false;
  return temel;
}

/**
 * Önsel ile bu cihazdaki ölçümü birleştirir.
 *   · Yetenek eklerken: ikisinden biri yeter (pozitif kanıt birikir).
 *   · Yeteneği kaldırırken: yalnız **ardışık başarısız sınama** önseli geçersiz kılar.
 */
export function etkinKopru(ad: KopruAdi, olcum: KopruOlcumu | null, simdi: number): EtkinKopru {
  const onsel = KOPRU_ONOLERI[ad];
  const gecerli = olcumGecerliMi(olcum, simdi) ? olcum : null;
  if (!gecerli) return { ...onsel, kaynak: 'onsel', olcum: null };

  const komutKapali = gecerli.basarisizSina >= SINA_BASARISIZ_SINIRI;
  return {
    ...onsel,
    komut: !komutKapali && (onsel.komut || gecerli.komut),
    telemetri: onsel.telemetri || gecerli.telemetri,
    hazirSinyali: onsel.hazirSinyali || gecerli.hazirSinyali,
    kaynak: gecerli.gozlem > 0 ? 'olcum' : 'onsel',
    olcum: gecerli,
  };
}

/**
 * Sınama penceresinde gelen olay, komut kanalını kanıtlıyor mu?
 * Yalnız komuta özgü olaylar (`seeked`, `seek`) kanıt sayılır: sürekli akan
 * `timeupdate` bir sınama için **yanlış pozitif** üretirdi.
 */
export const SINA_KANIT_OLAYLARI = ['seeked', 'seek'];

export function sinaOnaylandi(olay: KopruOlayi): boolean {
  if (olay.tur !== 'konum' && olay.tur !== 'durum') return false;
  return Boolean(olay.ad && SINA_KANIT_OLAYLARI.includes(olay.ad));
}

/**
 * Şimdi komut kanalını sınamalı mıyız?
 * Sınama **görünmez** olmalı: hedef, oynatıcının zaten bulunduğu saniyedir, yani
 * no-op bir sar isteği. Oynatıcı komutu dinliyorsa `seeked` yayınlar; dinlemiyorsa
 * hiçbir şey olmaz (kullanıcı fark etmez).
 */
export function komutSinamasi(
  kopru: Kopru,
  olcum: KopruOlcumu | null,
  simdi: number
): { sina: boolean; sebep: 'sina' | 'zaten-kanitli' | 'olay-yok' | 'konum-yok' | 'yeni-denendi' } {
  if (kopru.komut) return { sina: false, sebep: 'zaten-kanitli' };
  if (!kopru.hazirSinyali) return { sina: false, sebep: 'olay-yok' };
  /*
   * Telemetri şart. Sebep: sınama, oynatıcının **bulunduğu** saniyeye sararak
   * görünmez olur. Konumu bilmiyorsak hedef 0 olur ve oynatılan bir videoyu
   * başa sarabiliriz — kullanıcıya fark ettirmeden öğrenmek adına bu kabul
   * edilemez; ölçüm yoksa sınama da yok.
   */
  if (!kopru.telemetri) return { sina: false, sebep: 'konum-yok' };
  if (olcum?.sonSina && simdi - olcum.sonSina < SINA_ARASI_MS) return { sina: false, sebep: 'yeni-denendi' };
  return { sina: true, sebep: 'sina' };
}

/**
 * Saniyeyi oynatıcı saatine çevirir: `1450 → 24:10`, `3725 → 1:02:05`.
 * Köprünün telemetrisi yalnızca burada üretildiği için biçimleyici de burada:
 * gerçek süre bilgisi başka hiçbir modülden gelmiyor.
 */
export function medyaSaati(saniye: number): string {
  if (!Number.isFinite(saniye) || saniye <= 0) return '0:00';
  const t = Math.floor(saniye);
  const iki = (n: number) => String(n).padStart(2, '0');
  const saat = Math.floor(t / 3600);
  const dakika = Math.floor(t / 60) % 60;
  const saniyeKalan = t % 60;
  return saat ? `${saat}:${iki(dakika)}:${iki(saniyeKalan)}` : `${dakika}:${iki(saniyeKalan)}`;
}
