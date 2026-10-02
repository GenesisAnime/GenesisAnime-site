/**
 * yardimci.mjs — GenesisAnime API yardımcı katmanı
 * ==================================================
 * Bu modül bilerek AYRI dosyadır: Workers çalışma zamanı, işçinin GİRİŞ
 * modülünden yalnızca fonksiyon ya da ExportedHandler biçimli dışa aktarımlara
 * izin verir. Sabitler ve saf fonksiyonlar girişte dursaydı workerd şu hatayla
 * açılmazdı:
 *   Uncaught TypeError: Incorrect type for map entry 'BILDIRIM_GUNLUK_SINIR':
 *   the provided value is not of type 'function or ExportedHandler'.
 * Bu yüzden tüm doğrulama/kripto/CORS/D1 yardımcıları burada tutulur; giriş
 * modülü (index.mjs) yalnızca işleyicileri ve varsayılan fetch'i dışa aktarır.
 * Testler (tools/testler/bildirim.test.mjs) doğrudan bu modülü içe alır.
 */

/* ================================================================ */
/* 0 · Sabitler                                                     */
/* ================================================================ */

export const SURUM = '0.1.0';
export const OTURUM_SURESI_MS = 12 * 60 * 60 * 1000; // erişim jetonu: 12 saat
export const YENILEME_SURESI_MS = 90 * 24 * 60 * 60 * 1000; // yenileme: 90 gün
// PBKDF2 iterasyon sayısı. ÜRETİM SINIRI: Cloudflare Workers (workerd) PBKDF2'de
// 100.000'in üzerini reddeder:
//   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported
// Yerel `wrangler dev` bu sınırı UYGULAMAZ; 210.000 ile bütün yerel testler geçerken
// üretimde /auth/kayit ve /auth/giris 500 dönüyordu (H-20, ilk gerçek deploy).
// OWASP'ın PBKDF2-HMAC-SHA256 için önerdiği 600.000 bu platformda mümkün değildir;
// tavan, platformun kabul ettiği en yüksek değerdir (bkz. ADR-0008).
export const PBKDF2_TAVAN = 100_000;
export const PBKDF2_TUR = PBKDF2_TAVAN;
export const BILDIRIM_GUNLUK_SINIR = 30; // IP başına
export const GIRIS_SAATLIK_SINIR = 20; // IP başına
export const GOVDE_SINIRI = 65_536; // 64 KB (genel uçlar)
// /me/durum taşıma sınırı: iç içe JSON dizesi, tırnak kaçışıyla gövdeyi ~2 katına
// şişirebilir; bu yüzden blob sınırının iki katı + pay bırakılır. Blob'un kendisi
// BLOB_SINIRI ile (UTF-8 bayt) ölçülür ve D1'in 2 MB satır sınırının çok altındadır.
export const BLOB_SINIRI = 512 * 1024; // senkron blob'u: 512 KB (UTF-8)
export const BLOB_GOVDE_SINIRI = 2 * BLOB_SINIRI + 64 * 1024;

export const TURLER = ['calismiyor', 'eksik', 'yanlis-bolum', 'donuk'];
export const BILDIRIM_DURUMLARI = ['yeni', 'incelendi', 'gecersiz'];

// Arşivdeki en uzun anime slug'ı 144 karakter; sınır rahat bırakılır (gerçek slug'lar reddedilmesin).
const SLUG_DESENI = /^[a-z0-9][a-z0-9-]{0,199}$/;
const HOST_DESENI = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EPOSTA_DESENI = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

/* ================================================================ */
/* 1 · Saf doğrulama yardımcıları                                   */
/* ================================================================ */

/** E-posta doğru biçimde mi (kayıt/giriş için; 254 karakter sınırı). */
export function epostaGecerli(eposta) {
  return typeof eposta === 'string' && eposta.length <= 254 && EPOSTA_DESENI.test(eposta);
}

/** Parola: en az 10 karakter, en çok 200 (uzunluk PBKDF2 maliyetini sınırlar). */
export function parolaGecerli(parola) {
  return typeof parola === 'string' && parola.length >= 10 && parola.length <= 200;
}

/** Anime slug deseni (public/data/anime dosya adlarıyla aynı). */
export function slugGecerli(slug) {
  return typeof slug === 'string' && SLUG_DESENI.test(slug);
}

/**
 * Kaynak URL'i: http(s), kimlik bilgisi yok, aşırı uzun değil.
 * Bildirimde URL kullanıcıdan gelir; burada şema doğrulanır.
 */
export function urlGecerli(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  return hostIzinli(u.hostname);
}

/**
 * Host izin listesi: gerçek alan adı olmalı. IP adresi, localhost ve tek
 * etiketli adlar reddedilir — bunlar ya spam ya da iç ağ sızma denemesidir.
 */
export function hostIzinli(host) {
  if (typeof host !== 'string' || host.length === 0 || host.length > 253) return false;
  const temiz = host.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(temiz)) return false; // IPv4
  if (temiz.includes(':')) return false; // IPv6 / port kalıntısı
  if (temiz === 'localhost' || temiz.endsWith('.local')) return false;
  return HOST_DESENI.test(temiz);
}

/**
 * Bildirim gövdesini doğrular ve veritabanına yazılacak kaydı üretir.
 * `host` daima URL'den türetilir; istemcinin gönderdiği host'a güvenilmez.
 */
export function bildirimDogrula(govde) {
  if (!govde || typeof govde !== 'object') return { ok: false, hata: 'govde-yok' };
  const { url, anime, bolum, tur } = govde;
  if (!urlGecerli(url)) return { ok: false, hata: 'url-gecersiz' };

  let animeSlug = null;
  if (anime !== undefined && anime !== null && anime !== '') {
    if (!slugGecerli(anime)) return { ok: false, hata: 'anime-gecersiz' };
    animeSlug = anime;
  }

  let bolumNo = null;
  if (bolum !== undefined && bolum !== null && bolum !== '') {
    const n = Number(bolum);
    if (!Number.isInteger(n) || n <= 0 || n > 100_000) return { ok: false, hata: 'bolum-gecersiz' };
    bolumNo = n;
  }

  const turu = tur === undefined || tur === null || tur === '' ? 'calismiyor' : String(tur);
  if (!TURLER.includes(turu)) return { ok: false, hata: 'tur-gecersiz' };

  return {
    ok: true,
    veri: { url: String(url), host: new URL(String(url)).hostname.toLowerCase(), anime: animeSlug, bolum: bolumNo, tur: turu },
  };
}

/**
 * Yol → işlem eşlemesi. Yöntem uyuşmazlığı 'yontem-yok', bilinmeyen yol 'yok'.
 * Sıra önemlidir: /me/durum PUT ile GET farklı işler.
 */
export function yolCoz(yol, yontem) {
  const y = yol.length > 1 && yol.endsWith('/') ? yol.slice(0, -1) : yol;
  const m = (yontem || 'GET').toUpperCase();

  if (y === '/' && m === 'GET') return { islem: 'kok' };
  if (y === '/saglik' && m === 'GET') return { islem: 'saglik' };
  if (y === '/bildirim' && m === 'POST') return { islem: 'bildirim-ekle' };
  if (y === '/bildirim' && m === 'GET') return { islem: 'bildirim-liste' };
  const bd = y.match(/^\/bildirim\/(\d{1,12})$/);
  if (bd && m === 'POST') return { islem: 'bildirim-durum', id: Number(bd[1]) };

  if (y === '/auth/kayit' && m === 'POST') return { islem: 'auth-kayit' };
  if (y === '/auth/giris' && m === 'POST') return { islem: 'auth-giris' };
  if (y === '/auth/yenile' && m === 'POST') return { islem: 'auth-yenile' };
  if (y === '/auth/cikis' && m === 'POST') return { islem: 'auth-cikis' };

  if (y === '/me/durum' && m === 'GET') return { islem: 'me-okuma' };
  if (y === '/me/durum' && m === 'PUT') return { islem: 'me-yazma' };
  if (y === '/me/veri' && m === 'GET') return { islem: 'me-veri' };
  if (y === '/me' && m === 'DELETE') return { islem: 'me-sil' };

  // Akış çözümleyici + aktarım (bkz. src/akis.mjs, docs/12).
  if (y === '/akis/coz' && m === 'GET') return { islem: 'akis-coz' };
  if ((y === '/akis/aktar' || y === '/akis/akis') && (m === 'GET' || m === 'HEAD')) return { islem: 'akis-aktar' };

  // Link tarama döngüsü (hepsi yönetici jetonu ister).
  if (y === '/tarama/ayar' && m === 'GET') return { islem: 'tarama-ayar' };
  if (y === '/tarama/ayar' && m === 'PUT') return { islem: 'tarama-ayar-yaz' };
  if (y === '/tarama/durum' && m === 'GET') return { islem: 'tarama-durum' };
  if (y === '/tarama/kosu' && m === 'POST') return { islem: 'tarama-kosu' };
  if (y === '/tarama/kalp' && m === 'POST') return { islem: 'tarama-kalp' };

  // Bilinen yolda yanlış yöntem mi, gerçekten bilinmeyen yol mu?
  const bilinen = [
    '/saglik',
    '/akis/coz',
    '/akis/aktar',
    '/bildirim',
    '/auth/kayit',
    '/auth/giris',
    '/auth/yenile',
    '/auth/cikis',
    '/me/durum',
    '/me/veri',
    '/me',
    '/tarama/ayar',
    '/tarama/durum',
    '/tarama/kosu',
    '/tarama/kalp',
  ];
  if (bilinen.includes(y)) return { islem: 'yontem-yok' };
  if (/^\/bildirim\/\d+$/.test(y)) return { islem: 'yontem-yok' };
  return { islem: 'yok' };
}

/* ================================================================ */
/* 2 · Kriptografi (WebCrypto)                                      */
/* ================================================================ */

const kodlayici = new TextEncoder();

function b64(tampon) {
  const baytlar = new Uint8Array(tampon);
  let metin = '';
  for (const b of baytlar) metin += String.fromCharCode(b);
  return btoa(metin);
}

function b64Coz(metin) {
  const ham = atob(metin);
  const baytlar = new Uint8Array(ham.length);
  for (let i = 0; i < ham.length; i++) baytlar[i] = ham.charCodeAt(i);
  return baytlar;
}

/** Rastgele base64url jeton (tarayıcı ve Workers'ta aynı). */
export function jetonUret(bayt = 32) {
  const dizi = new Uint8Array(bayt);
  crypto.getRandomValues(dizi);
  return b64(dizi).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 hex özeti — jeton ve IP özetlemede kullanılır. */
export async function ozetle(metin) {
  const ozet = await crypto.subtle.digest('SHA-256', kodlayici.encode(metin));
  return [...new Uint8Array(ozet)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Sabit süreli karşılaştırma (jeton/parola özetleri için). */
export function sabitSureliEsit(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let fark = 0;
  for (let i = 0; i < a.length; i++) fark |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return fark === 0;
}

/**
 * PBKDF2-HMAC-SHA256 parola özeti. Dönen değer `iterasyon:base64(tuz):base64(özet)`.
 * Workers'ta argon2 bulunmadığı için OWASP'ın PBKDF2 önerisi uygulanır (ADR-0008).
 */
export async function parolaOzetle(parola, tuz = null, tur = PBKDF2_TUR) {
  const tuzBayt = tuz ? b64Coz(tuz) : crypto.getRandomValues(new Uint8Array(16));
  const anahtar = await crypto.subtle.importKey('raw', kodlayici.encode(parola), 'PBKDF2', false, ['deriveBits']);
  const ozet = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: tuzBayt, iterations: tur, hash: 'SHA-256' },
    anahtar,
    256
  );
  return `${tur}:${b64(tuzBayt)}:${b64(ozet)}`;
}

/** Saklanan parola özetiyle karşılaştırır (sabit süreli). */
export async function parolaDogrula(parola, saklanan) {
  if (typeof saklanan !== 'string') return false;
  const [turMetin, tuz] = saklanan.split(':');
  const tur = Number(turMetin);
  if (!Number.isInteger(tur) || tur <= 0 || !tuz) return false;
  // Tavanın üzerindeki kayıtlar üretimde yeniden hesaplanamaz (workerd reddeder);
  // 500 yerine temiz bir red döner. Yeni kayıtlar zaten PBKDF2_TUR ile üretilir.
  if (tur > PBKDF2_TAVAN) return false;
  const yeni = await parolaOzetle(parola, tuz, tur);
  return sabitSureliEsit(yeni, saklanan);
}

/** IP adresini tuzla özetler; ham IP hiçbir yerde tutulmaz (KVKK). */
export async function ipTuzla(ip, tuz) {
  return ozetle(`${tuz}|${ip}`);
}

/** Metnin UTF-8 bayt uzunluğu (D1 satır sınırı bayt cinsindendir). */
export function baytUzunlugu(metin) {
  return kodlayici.encode(String(metin)).length;
}

/* ================================================================ */
/* 3 · CORS                                                         */
/* ================================================================ */

/** İzinli kaynak listesi: SITE_ORIGIN + CORS_EXTRA (virgülle). */
export function izinliKaynaklar(env) {
  const liste = [env.SITE_ORIGIN, ...(env.CORS_EXTRA || '').split(',')]
    .map((k) => (k || '').trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...new Set(liste)];
}

/** Tarayıcı kaynağı izinli mi? (Yerel geliştirme CORS_EXTRA ile açılır.) */
export function kaynakIzinli(origin, env) {
  if (!origin) return false;
  return izinliKaynaklar(env).includes(origin.replace(/\/$/, ''));
}

export function corsBasliklari(origin, env) {
  const basliklar = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    /* `Range` listede: oynatıcı, video hatasının nedenini 2 baytlık yoklamayla
       öğreniyor (`Range: bytes=0-1`) ve bu istek tarayıcıya göre ön uçuş ister. */
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (kaynakIzinli(origin, env)) basliklar['Access-Control-Allow-Origin'] = origin;
  return basliklar;
}

/* ================================================================ */
/* 4 · D1 yardımcıları                                              */
/* ================================================================ */

/**
 * Pencere sayaçlı oran sınırı. `pencere` değişince sayaç sıfırlanır
 * (ör. "bildirim:2026-10-01", "giris:2026-10-01T05").
 */
export async function oranAsildi(db, anahtar, pencere, sinir) {
  // Pencereyi tazele: aynı pencerede sayacı koru, yeni pencerede sıfırla (tek ifade).
  await db
    .prepare(
      'INSERT INTO oran (anahtar, pencere, sayi) VALUES (?, ?, 0) ON CONFLICT(anahtar) DO UPDATE SET sayi = CASE WHEN oran.pencere = excluded.pencere THEN oran.sayi ELSE 0 END, pencere = excluded.pencere'
    )
    .bind(anahtar, pencere)
    .run();
  // Sayacı YALNIZCA sınırın altındaysa artır. Karar ve artırma tek ifadede olduğu için
  // eşzamanlı istekler sınırı aşamaz (eski SELECT + UPDATE sürümünde yarış koşulu vardı).
  const sonuc = await db
    .prepare('UPDATE oran SET sayi = sayi + 1 WHERE anahtar = ? AND pencere = ? AND sayi < ?')
    .bind(anahtar, pencere, sinir)
    .run();
  return Number(sonuc?.meta?.changes ?? 0) === 0;
}

/** Aynı IP aynı URL'i 24 saat içinde bildirdiyse tekrar yazma. */
export async function bildirimTekrarMi(db, url, ipHash) {
  const esik = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const satir = await db
    .prepare('SELECT id FROM bildirim WHERE url = ? AND ip_hash = ? AND zaman > ? LIMIT 1')
    .bind(url, ipHash, esik)
    .first();
  return Boolean(satir);
}

/** Bearer jetonundan oturum + kullanıcı çözer; yoksa null. */
export async function oturumCoz(db, jeton) {
  if (!jeton) return null;
  const hash = await ozetle(jeton);
  const satir = await db
    .prepare(
      'SELECT o.id AS oturum_id, o.kullanici_id AS kullanici_id, o.son_kullanma AS son_kullanma, k.eposta AS eposta ' +
        'FROM oturum o JOIN kullanici k ON k.id = o.kullanici_id WHERE o.jeton_hash = ? LIMIT 1'
    )
    .bind(hash)
    .first();
  if (!satir) return null;
  if (Date.parse(satir.son_kullanma) < Date.now()) return null;
  return satir;
}

/** Yeni oturum satırı: erişim jetonu + yenileme jetonu (ikisi de özetli saklanır). */
export async function oturumAc(db, kullaniciId) {
  const jeton = jetonUret();
  const yenileme = jetonUret(48);
  const simdi = new Date().toISOString();
  await db
    .prepare('INSERT INTO oturum (id, kullanici_id, jeton_hash, yenileme_hash, son_kullanma, olusturma) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(
      jetonUret(16),
      kullaniciId,
      await ozetle(jeton),
      await ozetle(yenileme),
      new Date(Date.now() + OTURUM_SURESI_MS).toISOString(),
      simdi
    )
    .run();
  return { jeton, yenileme };
}

/* ================================================================ */
/* 5 · Yanıt yardımcıları                                           */
/* ================================================================ */

export function json(govde, durum, ekBasliklar = {}) {
  return new Response(JSON.stringify(govde), {
    status: durum,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...ekBasliklar },
  });
}

export async function govdeOku(istek, sinir = GOVDE_SINIRI) {
  const boyut = Number(istek.headers.get('content-length') || 0);
  if (boyut > sinir) return { ok: false, hata: 'govde-buyuk' };
  let metin;
  try {
    metin = await istek.text();
  } catch {
    return { ok: false, hata: 'govde-okunamadi' };
  }
  if (metin.length > sinir) return { ok: false, hata: 'govde-buyuk' };
  if (!metin) return { ok: true, veri: {} };
  try {
    const veri = JSON.parse(metin);
    if (!veri || typeof veri !== 'object' || Array.isArray(veri)) return { ok: false, hata: 'govde-bicim' };
    return { ok: true, veri };
  } catch {
    return { ok: false, hata: 'govde-bicim' };
  }
}

export function bearer(istek) {
  const baslik = istek.headers.get('Authorization') || '';
  const m = baslik.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Admin isteği mi? ADMIN_TOKEN tanımlıysa ve zamanlama-güvenli eşitse. */
export function adminMi(istek, env) {
  const jeton = bearer(istek);
  if (!jeton || !env.ADMIN_TOKEN) return false;
  return sabitSureliEsit(jeton, env.ADMIN_TOKEN);
}

/* ================================================================ */
/* 5 · Link tarama döngüsü ayarları (yönetici paneli)               */
/* ================================================================ */

/** Dilim sınırları: çok küçük dilim anlamsız, çok büyüğü tek geceye sığmaz. */
export const TARAMA_DILIM_EN_AZ = 25;
export const TARAMA_DILIM_EN_COK = 20000;
export const TARAMA_KOSU_SINIRI = 500;

function tamsayi(x, enAz, enCok, varsayilan) {
  const s = Number(x);
  if (!Number.isFinite(s)) return varsayilan;
  return Math.min(Math.max(Math.round(s), enAz), enCok);
}

function bayrak(x, varsayilan) {
  if (x === undefined || x === null) return varsayilan;
  return x === true || x === 1 || x === '1' ? 1 : 0;
}

function metin(x, uzunluk) {
  return typeof x === 'string' ? x.trim().slice(0, uzunluk) : '';
}

/**
 * Panelden gelen ayarı güvenli aralığa indirger (eksik alan varsayılana döner).
 * Kırpma sessizdir ve bilinçlidir: panel bir gün farklı bir sınır gönderirse
 * döngü yine de makul bir dilimle koşar, istek 400 ile düşmez.
 */
export function taramaAyarNormalize(ham) {
  const d = ham && typeof ham === 'object' && !Array.isArray(ham) ? ham : {};
  return {
    aktif: bayrak(d.aktif, 1),
    dilim: tamsayi(d.dilim, TARAMA_DILIM_EN_AZ, TARAMA_DILIM_EN_COK, 1500),
    saat: tamsayi(d.saat, 0, 23, 4),
    yayinla: bayrak(d.yayinla, 0),
    push: bayrak(d.push, 0),
    hemen: bayrak(d.hemen, 0),
  };
}

/**
 * Koşu kaydının metin alanlarını budar. `not_metni` paneldе görünen log kuyruğudur
 * (dosya yolu ya da hata satırları sızmasın diye uzunluk sınırı vardır).
 */
export function taramaKosuNormalize(ham) {
  const d = ham && typeof ham === 'object' && !Array.isArray(ham) ? ham : {};
  return {
    makine: metin(d.makine, 60) || 'bilinmiyor',
    dilim: tamsayi(d.dilim, 0, TARAMA_DILIM_EN_COK, 0),
    sure_sn: tamsayi(d.sure_sn, 0, 86400, 0),
    sonuc: d.sonuc === 'hata' ? 'hata' : 'ok',
    kapsam: metin(d.kapsam, 200),
    not_metni: metin(d.not_metni, 4000),
  };
}
