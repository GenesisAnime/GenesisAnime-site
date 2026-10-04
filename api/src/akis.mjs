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
  const m = metin.match(/"(?:url|src|file)"\s*:\s*"([^"]*?\.(?:mp4|webm|m3u8|mpd)[^"]*)"/i);
  if (!m) return null;
  let adres = m[1].split('\\/').join('/');
  if (adres.startsWith('//')) adres = `https:${adres}`;
  if (!/^https:\/\//i.test(adres)) return null;
  const expire = adres.match(/[?&]expire_at=(\d{6,})/) || adres.match(/[?&]expires=(\d{9,})/);
  return {
    url: adres,
    tur: /\.m3u8/i.test(adres) ? 'hls' : /\.mpd/i.test(adres) ? 'dash' : /\.webm/i.test(adres) ? 'webm' : 'mp4',
    imzaBitis: expire ? Number(expire[1]) * 1000 : null,
  };
}

/**
 * Dean Edwards "packer" ile paketlenmiş betiği çözer (uqload/luluvdo/dood
 * ailesi oynatıcı adresini bu biçimde saklıyor).
 *
 * `eval(function(p,a,c,k,e,d){…}('gövde',taban,sayı,'kelimeler'.split('|'),0,{}))`
 * çağrısının gövdesi alınır ve `k` sözlüğü yerine konur. Paket değilse `null`.
 * Uzak JavaScript **çalıştırılmaz**: yalnız bu bilinen, veri taşıyan sarmalayıcı açılır.
 */
export function packCoz(kod) {
  const metin = String(kod ?? '');
  const es = metin.match(/eval\(function\(p,a,c,k,e,[^)]*\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
  if (!es) return null;
  let [, govde, taban, sayi, sozluk] = es;
  taban = Number(taban);
  let kalan = Number(sayi);
  const kelimeler = sozluk.split('|');
  const anahtar = (n) =>
    (n < taban ? '' : anahtar(Math.floor(n / taban))) +
    ((n %= taban) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  while (kalan--) {
    if (kelimeler[kalan]) govde = govde.replace(new RegExp(`\\b${anahtar(kalan)}\\b`, 'g'), kelimeler[kalan]);
  }
  return govde;
}

/**
 * VK embed'inin gömülü JSON'undan mp4 basamaklarını çıkarır.
 *
 * VK (artık OK CDN üzerinden) sayfaya `"files":{"mp4_144":"…","mp4_1080":"…"}`
 * gömüyor; adresler `expires` ile imzalı ve çağıranın IP'sine bağlı. En iyi
 * kaliteyi değil **720p'ye kadar** olanı seçeriz: 1080p bölümler 1 GB'ı aşabiliyor
 * ve aktarım Worker'dan geçiyor.
 */
export function vkAkisi(html) {
  const temiz = metniCoz(String(html ?? ''));
  const blok = temiz.match(/"files"\s*:\s*\{([^}]*)\}/s);
  if (!blok) return null;
  const dosyalar = {};
  for (const es of blok[1].matchAll(/"([a-z0-9_]+)"\s*:\s*"([^"]+)"/gi)) {
    dosyalar[es[1].toLowerCase()] = es[2].split('\\/').join('/');
  }
  const sira = ['mp4_720', 'mp4_480', 'mp4_360', 'mp4_240', 'mp4_144'];
  for (const ad of sira) {
    const url = dosyalar[ad];
    if (url && /^https:\/\//i.test(url)) {
      /* `expires` saniye cinsindendir; imza bitişi milisaniye olarak döner. */
      const expire = url.match(/[?&]expires=(\d{9,})/);
      return { url, tur: 'mp4', imzaBitis: expire ? Number(expire[1]) * 1000 : null };
    }
  }
  return null;
}

/**
 * OK.ru (Odnoklassniki) embed'inden mp4 basamağını çıkarır. Sayfa JSON'u HTML
 * kaçışlıdır (`&quot;`); `metniCoz` bunu çözer. Sıra: hd → sd → low → lowest →
 * mobile (kalite sırası; `type` numarası küçüldükçe kalite düşer).
 */
export function okAkisi(html) {
  const temiz = metniCoz(String(html ?? ''));
  const blok = temiz.match(/"videos"\s*:\s*\[([\s\S]*?)\]/);
  if (!blok) return null;
  const bulunan = [];
  for (const es of blok[1].matchAll(/"name"\s*:\s*"([^"]+)"\s*,\s*"url"\s*:\s*"([^"]+)"/g)) {
    bulunan.push({ ad: es[1].toLowerCase(), url: es[2].split('\\/').join('/') });
  }
  for (const ad of ['hd', 'sd', 'low', 'lowest', 'mobile']) {
    const kayit = bulunan.find((k) => k.ad === ad);
    if (kayit && /^https:\/\//i.test(kayit.url)) {
      const expire = kayit.url.match(/[?&]expires=(\d{9,})/);
      return { url: kayit.url, tur: 'mp4', imzaBitis: expire ? Number(expire[1]) * 1000 : null };
    }
  }
  return null;
}

/**
 * Google Drive dosya kimliği: `/file/d/<id>/…` ya da `?id=<id>`.
 * Kimlik doğrudan indirme adresine dönüşür (bkz. akisCoz · gdrive).
 */
export function driveKimligi(adres) {
  const m = String(adres ?? '').match(/\/file\/d\/([A-Za-z0-9_-]{20,})/) || String(adres ?? '').match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

/** Drive doğrudan indirme adresi: tarayıcı yerine Worker aktarır (`confirm=t`" uyarı sayfasını atlar). */
export function driveIndirme(kimlik) {
  return `https://drive.usercontent.google.com/download?id=${kimlik}&export=download&confirm=t`;
}

/** Dailymotion embed adresinden video kimliği: `/video/<id>` ya da `/embed/video/<id>`. */
export function dailymotionKimligi(adres) {
  const m = String(adres ?? '').match(/\/video\/([a-zA-Z0-9]{6,24})/) || String(adres ?? '').match(/\/embed\/video\/([a-zA-Z0-9]{6,24})/);
  return m ? m[1] : null;
}

/**
 * Dailymotion oynatıcı metadata'sından akışı çıkarır.
 *
 * Yeni DM yalnız `qualities.auto` (x-mpegURL) veriyor: imzalı `sec` parametreli
 * HLS manifesti. Eski yanıtlarda doğrudan mp4 de olabilir; önce HLS, sonra mp4.
 */
export function dailymotionAkisi(govde) {
  let veri;
  try {
    veri = typeof govde === 'string' ? JSON.parse(govde) : govde;
  } catch {
    return null;
  }
  const nitelikler = veri?.qualities ?? {};
  const adaylar = [];
  for (const liste of Object.values(nitelikler)) {
    if (!Array.isArray(liste)) continue;
    for (const kayit of liste) {
      const url = kayit?.url;
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
        adaylar.push({ url: url.replace(/^http:/i, 'https:'), tur: /mpegurl|\.m3u8/i.test(kayit?.type ?? url) ? 'hls' : 'mp4' });
      }
    }
  }
  return adaylar.find((a) => a.tur === 'hls') ?? adaylar[0] ?? null;
}

/** Yandex Disk public API yanıtındaki indirme adresi (`href`). */
export function yandexIndirme(govde) {
  let veri;
  try {
    veri = typeof govde === 'string' ? JSON.parse(govde) : govde;
  } catch {
    return null;
  }
  const href = veri?.href;
  return typeof href === 'string' && /^https:\/\//i.test(href) ? href : null;
}

/**
 * Katalogdaki kaynak host'ları → çözümleyici adı + **çözülebilirlik**.
 *
 * `cozulebilir: false` olanlar 04.10 canlı ölçümünde sunucudan çözülemedi
 * (nedeni kayda geçer): istemci bu host'ları site playerında **denemez**,
 * doğrudan kendi player'ına/iframe'ine gider. Böylece ne kullanıcı boşa bekler
 * ne de telemetri "çözülemedi" gürültüsüyle dolar. Sağlayıcı açılırsa yalnız bu
 * tablo güncellenir; istemci sürümü gerekmez.
 */
const KAYNAKLAR = [
  { ad: 'mail', hostlar: ['my.mail.ru', 'videoapi.my.mail.ru'], cozulebilir: true },
  { ad: 'vk', hostlar: ['vk.com', 'myvi.tv'], cozulebilir: true },
  { ad: 'odnoklassniki', hostlar: ['ok.ru', 'odnoklassniki.ru'], cozulebilir: true },
  { ad: 'gdrive', hostlar: ['drive.google.com', 'docs.google.com'], cozulebilir: true },
  { ad: 'yadisk', hostlar: ['yadi.sk', 'www.yadi.sk', 'disk.yandex.com.tr', 'disk.yandex.com', 'disk.yandex.ru', 'disk.yandex.net'], cozulebilir: true },
  { ad: 'uqload', hostlar: ['uqload.com', 'uqload.co', 'uqload.vc'], cozulebilir: true },
  { ad: 'luluvdo', hostlar: ['luluvdo.com', 'luluvdoo.com'], cozulebilir: true },
  {
    ad: 'sibnet',
    hostlar: ['video.sibnet.ru'],
    cozulebilir: false,
    neden: 'sağlayıcı veri merkezi adreslerini engelliyor (her istek 403 “administrative rules”)',
  },
  { ad: 'mp4upload', hostlar: ['mp4upload.com'], cozulebilir: false, neden: 'medya sunucusu Cloudflare çıkışını kararsız biçimde 403 ile reddediyor' },
  { ad: 'dailymotion', hostlar: ['dailymotion.com'], cozulebilir: false, neden: 'imzalı manifest veri merkezi çıkışına 403 dönüyor' },
  { ad: 'voe', hostlar: ['voe.sx'], cozulebilir: false, neden: 'oynatıcı adresi yalnız istemci JavaScript’iyle kuruluyor' },
  { ad: 'videa', hostlar: ['videa.hu'], cozulebilir: false, neden: 'player/xml ucu sunucu isteklerine 403 dönüyor' },
  { ad: 'mega', hostlar: ['mega.nz', 'mega.co.nz'], cozulebilir: false, neden: 'dosya uçtan uca şifreli; sunucu çözemez' },
  { ad: 'hdvid', hostlar: ['hdvid.tv'], cozulebilir: false, neden: 'kaynak sunucu 523 (origin erişilemez) dönüyor' },
  { ad: 'doodstream', hostlar: ['dood.watch', 'doodstream.com'], cozulebilir: false, neden: 'embed sayfası bot korumasıyla 403 dönüyor' },
  { ad: 'cyberfile', hostlar: ['cyberfile.me'], cozulebilir: false, neden: 'dosya adı kaçışsız & taşıyor; indirme yolu doğrulanamıyor' },
  { ad: 'streamwish', hostlar: ['ghbrisk.com'], cozulebilir: false, neden: 'oynatıcı adresi yalnız istemci JavaScript’iyle kuruluyor' },
  { ad: 'byse', hostlar: ['byse.sx'], cozulebilir: false, neden: 'oynatıcı adresi yalnız istemci JavaScript’iyle kuruluyor' },
  { ad: 'pixeldrain', hostlar: ['turkanime.tv'], cozulebilir: false, neden: 'aracı sayfa akışı sunucuya bildirmiyor' },
  { ad: 'cda', hostlar: ['ebd.cda.pl'], cozulebilir: false, neden: 'oynatıcı adresi yalnız istemci JavaScript’iyle kuruluyor' },
];

/** Alt alan adlarını etiket sınırıyla eşleştir; benzer alan adları eşleşmez. */
export function hostEslesir(host, taban) {
  const h = String(host || '').toLowerCase();
  const t = String(taban || '').toLowerCase();
  return Boolean(h) && Boolean(t) && (h === t || h.endsWith(`.${t}`));
}

/** Site playerının **denemeye açık** (sunucudan çözülebilen) host'ları. */
export function desteklenenHostlar() {
  return [...new Set(KAYNAKLAR.filter((kaynak) => kaynak.cozulebilir !== false).flatMap((kaynak) => kaynak.hostlar))];
}

/** Katalogda tanınan tüm host'lar (çözülemeyenler dâhil) — kapsam denetimi için. */
export function bilinenHostlar() {
  return [...new Set(KAYNAKLAR.flatMap((kaynak) => kaynak.hostlar))];
}

/** Çözülemeyen sağlayıcılar ve gerekçeleri (istemciye bilgi olarak duyurulur). */
export function cozulemeyenKaynaklar() {
  return KAYNAKLAR.filter((kaynak) => kaynak.cozulebilir === false).map(({ ad, hostlar, neden }) => ({ ad, hostlar, neden }));
}

/** Kaynak adresi çözümlenebilir mi? */
export function kaynakTuru(embedAdresi) {
  let host;
  try {
    host = new URL(String(embedAdresi)).hostname;
  } catch {
    return null;
  }
  const bulunan = KAYNAKLAR.find((k) => k.hostlar.some((taban) => hostEslesir(host, taban)));
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
  /(^|\.)googleusercontent\.com$/i,
  /* Drive indirme ucu: drive.usercontent.google.com */
  /(^|\.)usercontent\.google\.com$/i,
  /* HLS CDN'leri (uqload/luluvdo ailesi) — imza parametreleri `t`+`s` taşır. */
  /(^|\.)uqload\.vc$/i,
  /(^|\.)cdn-tnmr\.org$/i,
  /* Dailymotion imzalı manifest/mp4 CDN'i (`sec` parametresi). */
  /(^|\.)dailymotion\.com$/i,
  /(^|\.)dmcdn\.net$/i,
  /* Sibnet doğrudan mp4 yolu: /v/<32 hex>/<id>.mp4 (yol hash'i imza yerine geçer). */
  /(^|\.)sibnet\.ru$/i,
  /* Yandex Disk indirme sunucusu (`hash` parametresi). */
  /(^|\.)disk\.yandex\.[a-z.]+$/i,
  /(^|\.)mp4upload\.com$/i,
  /(^|\.)hdvid\.tv$/i,
  /(^|\.)cyberfile\.me$/i,
  /(^|\.)disk\.yandex\.(?:ru|net|com)(?:\.[a-z]{2})?$/i,
];

/** Uzantıdan akış türü: mp4/webm doğrudan oynar, m3u8 HLS listesidir. */
function turBul(yol) {
  if (/\.m3u8$/i.test(yol)) return 'hls';
  if (/\.webm$/i.test(yol)) return 'webm';
  if (/\.mp4$/i.test(yol)) return 'mp4';
  return null;
}

/**
 * Statik HTML içinde beyan edilen ve güvenli aktarılabilir MP4/WebM/HLS akışlarını
 * bulur. Oynatıcı adresi paketlenmişse (`packer`) paket de çözülüp taranır:
 * uqload/luluvdo adresi yalnız paketin içinde durur.
 */
export function akisAdaylari(html, embedAdresi) {
  const temiz = metniCoz(String(html ?? '')).replace(/\\u0026/gi, '&').replace(/&amp;/gi, '&').replace(/\\\//g, '/');
  const cozulmus = packCoz(temiz);
  const metin = cozulmus ? `${temiz}\n${cozulmus}` : temiz;
  const kaliplar = [
    /(?:file|src|source|url|video_url|videoUrl)["']?\s*[:=]\s*["']([^"'<>\s]{8,4096})["']/gi,
    /<source[^>]+src=["']([^"']{8,4096})["']/gi,
    /https?:\/\/[^\s"'<>\\]+?\.(?:mp4|webm|m3u8)(?:\?[^\s"'<>\\]*)?/gi,
  ];
  const adaylar = new Map();
  for (const kalip of kaliplar) {
    for (const eslesme of metin.matchAll(kalip)) {
      const ham = (eslesme[1] ?? eslesme[0]).trim().replace(/[),;\]}]+$/, '');
      try {
        const url = new URL(ham, embedAdresi);
        const tur = turBul(url.pathname);
        if (!tur || url.protocol !== 'https:' || !aktarimIzni(url.href).ok) continue;
        adaylar.set(url.href, { url: url.href, tur });
      } catch {
        /* Bozuk adres, yanlış şema veya imzasız kaynak oynatıcıya verilmez. */
      }
    }
  }
  /* HLS listeleri mp4'lere göre öne alınır: sağlayıcı ikisini de sunuyorsa
     liste daha yüksek kalite verir. */
  const liste = [...adaylar.values()];
  return [...liste.filter((a) => a.tur === 'hls'), ...liste.filter((a) => a.tur !== 'hls')];
}

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

/** Adreste imza parametresi veya sağlayıcıya özgü imzalı yol biçimi var mı? */
export function imzaliMi(adres) {
  let u;
  try {
    u = new URL(String(adres));
  } catch {
    return false;
  }
  for (const anahtar of ['video_key', 'sig', 'sign', 'tkn', 'token', 'signature', 'expires', 'expire_at', 'hdnts', 'download_token']) {
    if (u.searchParams.has(anahtar)) return true;
  }
  const parcalar = u.pathname.split('/');
  if (hostEslesir(u.hostname, 'mp4upload.com')) {
    return parcalar.length === 4 && parcalar[1] === 'd' && /^[a-z0-9_-]{40,}$/i.test(parcalar[2]) && parcalar[3] === 'video.mp4';
  }
  if (hostEslesir(u.hostname, 'hdvid.tv')) {
    return parcalar.length === 3 && /^[a-z0-9_-]{40,}$/i.test(parcalar[1]) && parcalar[2] === 'v.mp4';
  }
  if (['disk.yandex.net', 'disk.yandex.com.tr', 'disk.yandex.com', 'disk.yandex.ru'].some((host) => hostEslesir(u.hostname, host))) {
    /* Önizleme akışı: /preview/<64 hex>/<8 hex>/<jeton>… */
    if (parcalar.length >= 5 && parcalar[1] === 'preview' && /^[a-f0-9]{64}$/i.test(parcalar[2]) && /^[a-f0-9]{8}$/i.test(parcalar[3])) {
      return true;
    }
    /* İndirme akışı (public API'nin verdiği adres): /disk/<64 hex>/<8 hex>/<jeton> + `hash`. */
    return /^\/disk\/[a-f0-9]{64}\/[a-f0-9]{8}\//i.test(u.pathname) && u.searchParams.has('hash');
  }
  /* Google Drive: dosya kimliği bir yetenek jetonu gibi davranır; yalnız
     indirme yolunda ve `id` ile kabul edilir (açık proxy yasağı korunur). */
  if (
    hostEslesir(u.hostname, 'googleusercontent.com') ||
    hostEslesir(u.hostname, 'usercontent.google.com') ||
    hostEslesir(u.hostname, 'drive.google.com')
  ) {
    return u.pathname === '/download' && u.searchParams.has('id') && u.searchParams.has('export');
  }
  /* Sibnet: /v/<32 hex>/<sayı>.mp4 — yol hash'i erişim jetonudur. */
  if (hostEslesir(u.hostname, 'sibnet.ru')) {
    return /^\/v\/[a-f0-9]{32}\/\d{3,12}\.mp4$/i.test(u.pathname);
  }
  /* HLS CDN'leri (uqload/luluvdo): /hls2/ yolunda `t` (jeton) + `s` (zaman) taşır. */
  if (hostEslesir(u.hostname, 'uqload.vc') || hostEslesir(u.hostname, 'cdn-tnmr.org')) {
    return /\/hls2\//i.test(u.pathname) && u.searchParams.has('t') && u.searchParams.has('s');
  }
  /* Dailymotion: imzalı `sec` parametresi manifest ve parça adreslerinde bulunur. */
  if (hostEslesir(u.hostname, 'dailymotion.com') || hostEslesir(u.hostname, 'dmcdn.net')) {
    return u.searchParams.has('sec') || u.searchParams.has('auth');
  }
  return false;
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
 * Embed sayfasını çözümle.
 *
 * Sağlayıcıya göre: Mail.ru/VK/OK gömülü JSON'dan, Dailymotion/Yandex Disk
 * herkese açık API'den, Google Drive kimlikten; kalan katalog player'larında
 * sayfada (paketlenmişse paketi açılarak) beyan edilmiş MP4/WebM/HLS adresi
 * aranır. Uzak JavaScript **çalıştırılmaz** — yalnız paket sarmalayıcısı çözülür.
 */
export async function akisCoz(embedAdresi, { fetchImpl = fetch, siteOrigin = '' } = {}) {
  const tur = kaynakTuru(embedAdresi);
  if (!tur) return { ok: false, hata: 'desteklenmiyor' };
  /* Çözülemeyen sağlayıcı: boşuna yukarı akış yok. İstemci zaten denemez
     (kapsam dışı); doğrudan çağrılırsa da niyet açık olsun. */
  if (!KAYNAKLAR.find((k) => k.ad === tur)?.cozulebilir) {
    return { ok: false, hata: 'desteklenmiyor', neden: 'saglayici-cozulemiyor' };
  }

  /* HTML'i akış taşımayan sağlayıcılar: adres kimlikten ya da API'den üretilir,
     embed sayfası boşuna çekilmez. */
  if (tur === 'gdrive') {
    const kimlik = driveKimligi(embedAdresi);
    if (!kimlik) return { ok: false, hata: 'kimlik-bulunamadi' };
    const url = driveIndirme(kimlik);
    if (!aktarimIzni(url).ok) return { ok: false, hata: 'hedef-izinli-degil' };
    return { ok: true, kaynakAdi: tur, tur: 'mp4', url, imzaBitis: null };
  }

  /* Dailymotion: embed HTML'i akış taşımaz; oynatıcı metadata API'si imzalı
     manifesti (HLS) verir. */
  if (tur === 'dailymotion') {
    const kimlik = dailymotionKimligi(embedAdresi);
    if (!kimlik) return { ok: false, hata: 'kimlik-bulunamadi' };
    const meta = await cek(`https://www.dailymotion.com/player/metadata/video/${kimlik}`, {
      fetchImpl,
      basliklar: { Referer: embedAdresi, Accept: 'application/json' },
    });
    if (!meta.ok) return { ok: false, hata: 'meta-alinamadi', durum: meta.durum };
    const akis = dailymotionAkisi(meta.govde);
    if (!akis) return { ok: false, hata: 'akis-bulunamadi' };
    if (!aktarimIzni(akis.url).ok) return { ok: false, hata: 'hedef-izinli-degil' };
    return { ok: true, kaynakAdi: tur, tur: akis.tur, url: akis.url, imzaBitis: null };
  }

  /* Yandex Disk: dosya sayfası medya taşımaz; herkese açık API indirme adresi
     (imzalı `hash`) verir. */
  if (tur === 'yadisk') {
    const api = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(embedAdresi)}`;
    const yanit = await cek(api, { fetchImpl, basliklar: { Accept: 'application/json' } });
    if (!yanit.ok) return { ok: false, hata: 'meta-alinamadi', durum: yanit.durum };
    const url = yandexIndirme(yanit.govde);
    if (!url) return { ok: false, hata: 'akis-bulunamadi' };
    if (!aktarimIzni(url).ok) return { ok: false, hata: 'hedef-izinli-degil' };
    return { ok: true, kaynakAdi: tur, tur: 'mp4', url, imzaBitis: null };
  }

  const embed = await cek(embedAdresi, { fetchImpl, basliklar: siteOrigin ? { Referer: siteOrigin } : {} });
  if (!embed.ok) return { ok: false, hata: 'embed-alinamadi', durum: embed.durum };

  if (tur === 'mail') {
    const kimlik = metaKimligi(embed.govde);
    if (!kimlik) return { ok: false, hata: 'kimlik-bulunamadi' };
    const meta = await cek(`https://my.mail.ru/+/video/meta/${kimlik}`, {
      fetchImpl,
      basliklar: { Referer: 'https://my.mail.ru/' },
    });
    if (!meta.ok) return { ok: false, hata: 'meta-alinamadi', durum: meta.durum };
    const akis = metaAkisi(meta.govde);
    if (!akis) return { ok: false, hata: 'akis-bulunamadi' };
    if (!aktarimIzni(akis.url).ok) return { ok: false, hata: 'hedef-izinli-degil' };
    return { ok: true, kaynakAdi: tur, kimlik, tur: akis.tur, url: akis.url, imzaBitis: akis.imzaBitis };
  }

  if (tur === 'vk' || tur === 'odnoklassniki') {
    const akis = tur === 'vk' ? vkAkisi(embed.govde) : okAkisi(embed.govde);
    if (!akis) return { ok: false, hata: 'akis-bulunamadi' };
    if (!aktarimIzni(akis.url).ok) return { ok: false, hata: 'hedef-izinli-degil' };
    return { ok: true, kaynakAdi: tur, tur: akis.tur, url: akis.url, imzaBitis: akis.imzaBitis };
  }

  const aday = akisAdaylari(embed.govde, embedAdresi)[0];
  if (!aday) return { ok: false, hata: 'akis-bulunamadi' };
  const expire = aday.url.match(/[?&](?:expire_at|expires)=(\d{9,})/i);
  return { ok: true, kaynakAdi: tur, tur: aday.tur, url: aday.url, imzaBitis: expire ? Number(expire[1]) * 1000 : null };
}

/* ================================================================ */
/* 3 · Aktarım (Range geçiren)                                      */
/* ================================================================ */

/** Yanıt bir HLS listesi mi? İçerik türü ya da adres uzantısı söyler. */
export function hlsMi(tip, adres) {
  if (String(tip ?? '').toLowerCase().includes('mpegurl')) return true;
  try {
    return /\.m3u8$/i.test(new URL(String(adres)).pathname);
  } catch {
    return false;
  }
}

/**
 * HLS listesini aktarım ucundan geçecek biçimde yeniden yazar.
 *
 * Neden şart: liste içindeki parça/anahtar adresleri tarayıcıya doğrudan
 * verilseydi CORS ya da imza/Referer denetimine takılırlardı. Bu yüzden her
 * URI **kendi aktarım ucumuza** çevrilir; oynatıcı tek bir kaynaktan (bizden)
 * beslenir. Düz satırlar adres, `#…URI="…"` etiketleri ise öznitelik olarak
 * yeniden yazılır (EXT-X-KEY, EXT-X-MAP, EXT-X-I-FRAME-STREAM-INF dâhil).
 */
export function hlsListeYaz(metin, temel, vekil) {
  const mutlak = (adres) => {
    try {
      return new URL(adres, temel).href;
    } catch {
      return null;
    }
  };
  return String(metin ?? '')
    .split('\n')
    .map((satir) => {
      const kirp = satir.trim();
      if (!kirp) return satir;
      if (kirp.startsWith('#')) {
        return satir.replace(/URI="([^"]+)"/g, (tam, adres) => {
          const m = mutlak(adres);
          return m ? `URI="${vekil(m)}"` : tam;
        });
      }
      const m = mutlak(kirp);
      return m ? vekil(m) : satir;
    })
    .join('\n');
}

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

  const tip = (yanit.headers.get('content-type') ?? '').toLowerCase();

  /* Yukarı akış reddetti mi? Yanıtı medya sanıp geçirmeyiz; durum **görünür**
     olur (teşhis: `ayrinti` alanı upstream kodunu taşır). 502, istemcinin taze
     çözümleme yolunu tetikler — süresi geçmiş imzanın belirtisi budur. */
  if (!yanit.ok) return { durum: 502, hata: 'kaynak-reddetti', tip, ayrinti: `upstream-${yanit.status}` };

  /* HLS: liste metni aktarım ucundan geçecek biçimde yeniden yazılır; parçalar
     normal medya akışı gibi geçer (imzalı CDN + CORS engeli böyle aşılır). */
  if (istek.method !== 'HEAD' && hlsMi(tip, hedef)) {
    const ham = await yanit.text();
    const temel = yanit.url || hedef;
    const kok = new URL(String(istek.url)).origin;
    const vekil = (adres) => `${kok}/akis/aktar?u=${encodeURIComponent(adres)}`;
    const yazilmis = hlsListeYaz(ham, temel, vekil);
    return {
      durum: 200,
      govde: yazilmis,
      basliklar: {
        ...cors,
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'private, max-age=60',
        'X-Aktarim': izin.host,
      },
    };
  }

  /* Yalnız medya yanıtlarını geçir: HTML hata sayfası video sanılmasın. */
  const medya =
    tip.startsWith('video/') || tip.startsWith('audio/') || tip.includes('mpegurl') || tip.includes('octet-stream') || tip.startsWith('application/vnd.apple');
  if (!medya) return { durum: 502, hata: 'medya-degil', tip, ayrinti: `upstream-${yanit.status}` };

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
