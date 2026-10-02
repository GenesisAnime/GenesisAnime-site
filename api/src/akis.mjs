/**
 * akis.mjs — akış çözümleyici + aktarım katmanı (temel)
 *
 * Neden var: ölçüm (docs/olcum/akis-2026-10-02.json) şunu gösterdi — bazı
 * kaynakların doğrudan akış adresi **sunucu tarafında** çıkarılabiliyor ve
 * sunucumuz akışı Range'li olarak çekebiliyor, ama aynı adres tarayıcıdan 403
 * alıyor (örnek: Mail.ru embed → metadataUrl → imzalı mp4; tarayıcı
 * MEDIA_ERR_SRC_NOT_SUPPORTED). Yani videoyu kendi `<video>` elemanımızda
 * oynatmak, aradan geçen bir aktarım katmanı gerektiriyor. Bu modül o katmanın
 * **temelidir**: iki uç, saf ve test edilebilir yardımcılarla.
 *
 *   GET /akis/coz?kaynak=<embed adresi>   → { tur, url, imzaBitis, kaynakAdi }
 *   GET /akis/aktar?u=<akış adresi>       → akışı Range'i koruyarak aktarır
 *
 * İki tasarım kararı:
 *
 * 1. **Açık proxy değil.** `/akis/aktar` yalnızca izin listesindeki medya
 *    host'larına ve yalnız **imzalı** adreslere (`video_key`, `sig`, `tkn`,
 *    `expires` gibi bir imza parametresi taşıyan) istek yapar. Yoksa herkes
 *    bu ucu kendi proxy'si olarak kullanırdı; bu hem kötüye kullanım hem de
 *    bant maliyeti demek.
 * 2. **Adres üretimi önbelleklenir.** İmzalar günlük (`expire_at` gece yarısı),
 *    bu yüzden çözümleme sonucu imza bitişine kadar Cache API'de tutulur;
 *    kaynağı her oynatmada yeniden yormayız.
 */

/* ================================================================ */
/* 1 · Saf yardımcılar (ağ yok — testler bunları doğrular)          */
/* ================================================================ */

/** JSON içinde kaçırılmış eğik çizgiler ve HTML varlıkları geri açılır. */
export function metniCoz(metin) {
  return String(metin ?? '')
    .split('\\/')
    .join('/')
    .split('\\u0026')
    .join('&')
    .split('&quot;')
    .join('"')
    .split('&amp;')
    .join('&')
    .split('&#x2F;')
    .join('/');
}

/**
 * Embed sayfasından video kimliğini çıkarır: `+/video/meta/<id>`.
 * (Mail.ru embed'i bu adresi `metadataUrl` olarak gömüyor.)
 */
export function metaKimligi(html) {
  const temiz = metniCoz(html);
  const m = temiz.match(/\/\+\/video\/meta\/(\d{6,25})/);
  return m ? m[1] : null;
}

/**
 * Meta yanıtından doğrudan akış adresini çıkarır.
 * Adres protokolsüz olabilir (`//cdn62.my.mail.ru/...`) → https'e tamamlanır.
 * İmza bitişi `expire_at` saniye cinsindendir; yoksa null.
 */
export function metaAkisi(govde) {
  const metin = typeof govde === 'string' ? metniCoz(govde) : JSON.stringify(govde ?? {});
  const m = metin.match(/"(?:url|src|file)"\s*:\s*"([^"]*?\.(?:mp4|m3u8|mpd)[^"]*)"/i);
  if (!m) return null;
  let adres = m[1].split('\\/').join('/');
  if (adres.startsWith('//')) adres = `https:${adres}`;
  if (!/^https:\/\//i.test(adres)) return null;
  const expire = adres.match(/[?&]expire_at=(\d{6,})/) || adres.match(/[?&]expires=(\d{9,})/);
  return {
    url: adres,
    tur: /\.m3u8/i.test(adres) ? 'hls' : /\.mpd/i.test(adres) ? 'dash' : 'mp4',
    imzaBitis: expire ? Number(expire[1]) * 1000 : null,
  };
}

/** Desteklenen kaynak host'ları → çözümleyici adı. */
const KAYNAKLAR = [
  { desen: /(^|\.)(?:videoapi\.)?my\.mail\.ru$/i, ad: 'mail' },
];

/** Kaynak adresi çözümlenebilir mi? */
export function kaynakTuru(embedAdresi) {
  let host;
  try {
    host = new URL(String(embedAdresi)).hostname;
  } catch {
    return null;
  }
  const bulunan = KAYNAKLAR.find((k) => k.desen.test(host));
  return bulunan ? bulunan.ad : null;
}

/**
 * Aktarım yapılabilecek medya host'ları. Yalnız bu host'lar aktarılır; medya
 * CDN'leri buraya eklenir, keyfi adres kabul edilmez (açık proxy yasağı).
 */
export const MEDYA_HOSTLARI = [
  /(^|\.)my\.mail\.ru$/i,
  /(^|\.)mycdn\.me$/i,
  /(^|\.)cloud\.mail\.ru$/i,
  /(^|\.)imgsmail\.ru$/i,
  /(^|\.)okcdn\.ru$/i,
];

/**
 * İstemci **taze çözümleme** istedi mi? (`?t=<rastgele>`)
 *
 * Neden: imzalar günlük; gece yarısını geçen önbellek girdisi 403/502 verir.
 * İstemci bunu görünce `t` gönderir ve önbellek **atlanır**. Değerin içeriği
 * önemsizdir (önbellek kırıcı), varlığı yeterlidir. Karar burada saf bir
 * fonksiyonda durur ki uç ve testler aynı sözleşmeyi okusun.
 */
export function onbellekAtlaMi(aramaParametreleri) {
  return Boolean(aramaParametreleri && typeof aramaParametreleri.has === 'function' && aramaParametreleri.has('t'));
}

/** Adreste imza parametresi var mı (yalnız imzalı adresler aktarılır). */
export function imzaliMi(adres) {
  return /[?&](?:video_key|sig|sign|tkn|token|signature|expires|expire_at|hdnts)=/i.test(String(adres));
}

/**
 * Aktarım hedefi güvenli mi? Şartlar: https, izin listesindeki host, imzalı adres.
 * Yanıt: `{ ok: true, host }` veya `{ ok: false, hata }`.
 */
export function aktarimIzni(adres) {
  let u;
  try {
    u = new URL(String(adres));
  } catch {
    return { ok: false, hata: 'adres-gecersiz' };
  }
  if (u.protocol !== 'https:') return { ok: false, hata: 'yalniz-https' };
  if (!MEDYA_HOSTLARI.some((d) => d.test(u.hostname))) return { ok: false, hata: 'host-izinli-degil' };
  if (!imzaliMi(adres)) return { ok: false, hata: 'imzasiz-adres' };
  return { ok: true, host: u.hostname };
}

/* ================================================================ */
/* 2 · Çözümleme (ağ)                                               */
/* ================================================================ */

const TARAYICI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Bir adresi getirir; hata durumunda `{ ok: false }` döner (fırlatmaz). */
async function cek(adres, { fetchImpl = fetch, basliklar = {}, yontem = 'GET' } = {}) {
  try {
    const yanit = await fetchImpl(adres, {
      method: yontem,
      headers: { 'User-Agent': TARAYICI_UA, Accept: '*/*', ...basliklar },
      redirect: 'follow',
    });
    if (!yanit.ok) return { ok: false, durum: yanit.status };
    return { ok: true, durum: yanit.status, govde: await yanit.text() };
  } catch (hata) {
    return { ok: false, durum: 0, hata: hata?.message ?? 'ag-hatasi' };
  }
}

/**
 * Kaynak embed adresini doğrudan akışa çevirir.
 * Bugün desteklenen: Mail.ru (embed → metadataUrl → meta JSON → imzalı mp4).
 * Diğer host'lar `{ ok: false, hata: 'desteklenmiyor' }` döner; çağıran taraf
 * iframe'e düşer.
 */
export async function akisCoz(embedAdresi, { fetchImpl = fetch, siteOrigin = '' } = {}) {
  const tur = kaynakTuru(embedAdresi);
  if (!tur) return { ok: false, hata: 'desteklenmiyor' };

  const embed = await cek(embedAdresi, { fetchImpl, basliklar: siteOrigin ? { Referer: siteOrigin } : {} });
  if (!embed.ok) return { ok: false, hata: 'embed-alinamadi', durum: embed.durum };

  const kimlik = metaKimligi(embed.govde);
  if (!kimlik) return { ok: false, hata: 'kimlik-bulunamadi' };

  const meta = await cek(`https://my.mail.ru/+/video/meta/${kimlik}`, {
    fetchImpl,
    basliklar: { Referer: 'https://my.mail.ru/' },
  });
  if (!meta.ok) return { ok: false, hata: 'meta-alinamadi', durum: meta.durum };

  const akis = metaAkisi(meta.govde);
  if (!akis) return { ok: false, hata: 'akis-bulunamadi' };

  return {
    ok: true,
    kaynakAdi: tur,
    kimlik,
    tur: akis.tur,
    url: akis.url,
    imzaBitis: akis.imzaBitis,
  };
}

/* ================================================================ */
/* 3 · Aktarım (Range geçiren)                                      */
/* ================================================================ */

/**
 * Akışı Range'i koruyarak aktarır.
 *
 * Neden Range şart: tarayıcı video için `Range: bytes=0-` gönderir ve ileri
 * sarmada aralık ister. Aralık isteğini iletmezsek hem oynatma başlamaz
 * (ölçümde açık uçlu aralık isteği zaman aşımına uğradı) hem de sarma çalışmaz.
 *
 * `If-Range` de iletilir: tarayıcı önbelleğiyle sunucu kopyası tutarlı kalsın.
 */
export async function aktar(istek, hedef, { fetchImpl = fetch, cors = {} } = {}) {
  const izin = aktarimIzni(hedef);
  if (!izin.ok) return { durum: 400, hata: izin.hata };

  const ileri = { 'User-Agent': TARAYICI_UA, Accept: '*/*' };
  const aralik = istek.headers.get('Range');
  if (aralik) ileri.Range = aralik;
  const ifRange = istek.headers.get('If-Range');
  if (ifRange) ileri['If-Range'] = ifRange;

  let yanit;
  try {
    yanit = await fetchImpl(hedef, {
      method: istek.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: ileri,
      redirect: 'follow',
    });
  } catch (hata) {
    return { durum: 502, hata: 'kaynak-erisilemedi', ayrinti: hata?.message ?? '' };
  }

  /* Yalnız medya yanıtlarını geçir: HTML hata sayfası video sanılmasın. */
  const tip = (yanit.headers.get('content-type') ?? '').toLowerCase();
  const medya =
    tip.startsWith('video/') || tip.startsWith('audio/') || tip.includes('mpegurl') || tip.includes('octet-stream') || tip.startsWith('application/vnd.apple');
  if (!medya) return { durum: 502, hata: 'medya-degil', tip };

  const basliklar = {
    ...cors,
    'Content-Type': yanit.headers.get('content-type') ?? 'application/octet-stream',
    'Accept-Ranges': yanit.headers.get('accept-ranges') ?? 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Aktarim': izin.host,
    /* Oynatıcı aralık bilgisini JS'ten okuyabilsin: CORS altında bu başlıklar
       varsayılan olarak gizlidir (yalnız saf liste açıktır). */
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  };
  /* Başlık adları HTTP kanonik biçimiyle yazılır: döndürülen nesne çağıran
     tarafından okunabilir kalsın (Response zaten küçük harfe çevirir). */
  for (const [kaynak, hedefAd] of [
    ['content-length', 'Content-Length'],
    ['content-range', 'Content-Range'],
    ['etag', 'ETag'],
    ['last-modified', 'Last-Modified'],
  ]) {
    const deger = yanit.headers.get(kaynak);
    if (deger) basliklar[hedefAd] = deger;
  }

  return { durum: yanit.status, govde: yanit.body, basliklar };
}
