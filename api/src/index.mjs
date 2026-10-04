/**
 * index.mjs — GenesisAnime API (Cloudflare Workers + D1)
 * ======================================================
 * Statik siteye dokunmadan hesapları, durum senkronunu ve "kaynak çalışmıyor"
 * bildirimlerini taşır. Bağımlılık yoktur; yalnızca Workers çalışma zamanı ve
 * WebCrypto kullanılır (argon2 yok → PBKDF2-HMAC-SHA256, bkz. ADR-0008).
 *
 * Uçlar:
 *   GET    /                     sürüm bilgisi
 *   GET    /saglik               çalışıyor mu?
 *   POST   /bildirim             kullanıcı bildirimi (oran sınırı + tekilleştirme)
 *   GET    /bildirim             yönetici: kuyruk listesi (ADMIN_TOKEN)
 *   POST   /akis/hata            site playerı: çözülemeyen kaynağı bildir (sınırlı + tekilleştirme)
 *   GET    /akis/hata            yönetici: host bazında hata özeti (ADMIN_TOKEN)
 *   POST   /bildirim/:id         yönetici: durum güncelle (yeni|incelendi|gecersiz)
 *   POST   /auth/kayit           e-posta + parola ile kayıt
 *   POST   /auth/giris           giriş (jeton + yenileme)
 *   POST   /auth/yenile          yenileme jetonu ile yeni erişim jetonu
 *   POST   /auth/cikis           oturumu kapat
 *   GET    /me/durum             senkron blob'u oku        (Bearer)
 *   PUT    /me/durum             senkron blob'u yaz (iyimser kilit)  (Bearer)
 *   GET    /me/veri              KVKK: verilerimi indir    (Bearer)
 *   DELETE /me                   KVKK: hesabımı sil        (Bearer)
 *   GET    /tarama/ayar          yönetici: tarama döngüsü ayarı (ADMIN_TOKEN)
 *   PUT    /tarama/ayar          yönetici: ayarı güncelle      (ADMIN_TOKEN)
 *   GET    /tarama/durum         yönetici: ayar + koşular + kalpler (ADMIN_TOKEN)
 *   POST   /tarama/kosu          yönetici: koşu kaydı ekle     (ADMIN_TOKEN)
 *   POST   /tarama/kalp          yönetici: makine kalp atışı   (ADMIN_TOKEN)
 *
 * ÖNEMLİ (workerd kuralı): Giriş modülü YALNIZCA fonksiyon ya da ExportedHandler
 * biçimli değer dışa aktarabilir. Sabit/pure yardımcı dışa aktarımları workerd'u
 * "Incorrect type for map entry ... not of type 'function or ExportedHandler'"
 * hatasıyla düşürür. Bu yüzden tüm sabitler ve yardımcılar `yardimci.mjs` içinde;
 * burada yalnızca varsayılan fetch işleyicisi dışa aktarılır.
 *
 * Gizlilik: IP adresi asla saklanmaz; yalnızca tuzlu SHA-256 özeti (ip_hash)
 * kullanılır. Parola ve jetonlar da yalnızca özetlenmiş hâlde durur.
 */

import {
  AKIS_GUNLUK_SINIR,
  AKIS_HATA_GUNLUK_SINIR,
  AKIS_KAPSAM_SURUMU,
  BILDIRIM_DURUMLARI,
  BILDIRIM_GUNLUK_SINIR,
  BLOB_GOVDE_SINIRI,
  BLOB_SINIRI,
  GIRIS_SAATLIK_SINIR,
  SURUM,
  adminMi,
  akisHataDogrula,
  akisHataTekrarMi,
  baytUzunlugu,
  bearer,
  bildirimDogrula,
  bildirimTekrarMi,
  corsBasliklari,
  epostaGecerli,
  govdeOku,
  ipTuzla,
  json,
  jetonUret,
  oranAsildi,
  oturumAc,
  oturumCoz,
  ozetle,
  parolaDogrula,
  parolaGecerli,
  parolaOzetle,
  taramaAyarNormalize,
  taramaKosuNormalize,
  TARAMA_KOSU_SINIRI,
  yolCoz,
} from './yardimci.mjs';
import { aktar, akisCoz, cozulemeyenKaynaklar, desteklenenHostlar, kaynakTuru, onbellekAtlaMi } from './akis.mjs';

/* ================================================================ */
/* 1 · İşleyiciler                                                  */
/* ================================================================ */

async function bildirimEkle(istek, env, cors) {
  const govde = await govdeOku(istek);
  if (!govde.ok) return json({ ok: false, hata: govde.hata }, 400, cors);

  const kontrol = bildirimDogrula(govde.veri);
  if (!kontrol.ok) return json({ ok: false, hata: kontrol.hata }, 400, cors);

  const ip = istek.headers.get('CF-Connecting-IP') || 'yok';
  const ipHash = await ipTuzla(ip, env.IP_TUZ || env.JWT_SECRET || 'genesis');
  const gun = new Date().toISOString().slice(0, 10);

  if (await oranAsildi(env.DB, `bildirim:${ipHash}`, gun, BILDIRIM_GUNLUK_SINIR)) {
    return json({ ok: false, hata: 'cok-fazla-istek' }, 429, cors);
  }
  if (await bildirimTekrarMi(env.DB, kontrol.veri.url, ipHash)) {
    return json({ ok: true, tekrar: true }, 200, cors);
  }

  const { url, host, anime, bolum, tur } = kontrol.veri;
  await env.DB.prepare(
    'INSERT INTO bildirim (url, host, anime, bolum, tur, ip_hash, zaman, durum) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(url, host, anime, bolum, tur, ipHash, new Date().toISOString(), 'yeni')
    .run();

  return json({ ok: true }, 201, cors);
}

async function bildirimListe(istek, env, cors) {
  if (!adminMi(istek, env)) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  const url = new URL(istek.url);
  const durum = url.searchParams.get('durum') || 'yeni';
  if (!BILDIRIM_DURUMLARI.includes(durum)) return json({ ok: false, hata: 'durum-gecersiz' }, 400, cors);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 500), 1), 1000);

  const sonuc = await env.DB.prepare(
    'SELECT id, url, host, anime, bolum, tur, zaman, durum FROM bildirim WHERE durum = ? ORDER BY zaman DESC, id DESC LIMIT ?'
  )
    .bind(durum, limit)
    .all();
  return json({ ok: true, adet: (sonuc.results || []).length, kayitlar: sonuc.results || [] }, 200, cors);
}

async function bildirimDurum(istek, env, k, cors) {
  if (!adminMi(istek, env)) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  const govde = await govdeOku(istek);
  if (!govde.ok) return json({ ok: false, hata: govde.hata }, 400, cors);
  const durum = govde.veri.durum;
  if (!BILDIRIM_DURUMLARI.includes(durum) || durum === 'yeni') {
    return json({ ok: false, hata: 'durum-gecersiz' }, 400, cors);
  }
  const sonuc = await env.DB.prepare('UPDATE bildirim SET durum = ? WHERE id = ?').bind(durum, k.id).run();
  if (!sonuc.meta || sonuc.meta.changes === 0) return json({ ok: false, hata: 'kayit-yok' }, 404, cors);
  return json({ ok: true }, 200, cors);
}

async function authKayit(istek, env, cors) {
  const govde = await govdeOku(istek);
  if (!govde.ok) return json({ ok: false, hata: govde.hata }, 400, cors);

  const eposta = String(govde.veri.eposta || '').trim().toLowerCase();
  const parola = govde.veri.parola;
  if (!epostaGecerli(eposta)) return json({ ok: false, hata: 'eposta-gecersiz' }, 400, cors);
  if (!parolaGecerli(parola)) return json({ ok: false, hata: 'parola-gecersiz' }, 400, cors);

  const ip = istek.headers.get('CF-Connecting-IP') || 'yok';
  const ipHash = await ipTuzla(ip, env.IP_TUZ || env.JWT_SECRET || 'genesis');
  const saat = new Date().toISOString().slice(0, 13);
  if (await oranAsildi(env.DB, `kayit:${ipHash}`, saat, GIRIS_SAATLIK_SINIR)) {
    return json({ ok: false, hata: 'cok-fazla-istek' }, 429, cors);
  }

  const varOlan = await env.DB.prepare('SELECT id FROM kullanici WHERE eposta = ? LIMIT 1').bind(eposta).first();
  if (varOlan) return json({ ok: false, hata: 'eposta-kayitli' }, 409, cors);

  const kullaniciId = jetonUret(16);
  await env.DB.prepare('INSERT INTO kullanici (id, eposta, parola_hash, olusturma) VALUES (?, ?, ?, ?)')
    .bind(kullaniciId, eposta, await parolaOzetle(parola), new Date().toISOString())
    .run();

  const oturum = await oturumAc(env.DB, kullaniciId);
  return json({ ok: true, eposta, ...oturum }, 201, cors);
}

async function authGiris(istek, env, cors) {
  const govde = await govdeOku(istek);
  if (!govde.ok) return json({ ok: false, hata: govde.hata }, 400, cors);

  const eposta = String(govde.veri.eposta || '').trim().toLowerCase();
  const parola = govde.veri.parola;

  const ip = istek.headers.get('CF-Connecting-IP') || 'yok';
  const ipHash = await ipTuzla(ip, env.IP_TUZ || env.JWT_SECRET || 'genesis');
  const saat = new Date().toISOString().slice(0, 13);
  if (await oranAsildi(env.DB, `giris:${ipHash}`, saat, GIRIS_SAATLIK_SINIR)) {
    return json({ ok: false, hata: 'cok-fazla-istek' }, 429, cors);
  }

  // Zamanlama sızıntısını azaltmak için kullanıcı yoksa da özet hesaplanır.
  const satir = epostaGecerli(eposta)
    ? await env.DB.prepare('SELECT id, eposta, parola_hash FROM kullanici WHERE eposta = ? LIMIT 1').bind(eposta).first()
    : null;
  const gecerli = await parolaDogrula(
    typeof parola === 'string' ? parola : '',
    satir ? satir.parola_hash : '210000:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
  );
  if (!satir || !gecerli) return json({ ok: false, hata: 'eposta-parola' }, 401, cors);

  const oturum = await oturumAc(env.DB, satir.id);
  return json({ ok: true, eposta: satir.eposta, ...oturum }, 200, cors);
}

async function authYenile(istek, env, cors) {
  const govde = await govdeOku(istek);
  if (!govde.ok) return json({ ok: false, hata: govde.hata }, 400, cors);
  const yenileme = String(govde.veri.yenileme || '');
  if (yenileme.length < 20) return json({ ok: false, hata: 'yenileme-gecersiz' }, 400, cors);

  const hash = await ozetle(yenileme);
  const oturum = await env.DB.prepare('SELECT id, kullanici_id FROM oturum WHERE yenileme_hash = ? LIMIT 1')
    .bind(hash)
    .first();
  if (!oturum) return json({ ok: false, hata: 'oturum-yok' }, 401, cors);

  const kullanici = await env.DB.prepare('SELECT eposta FROM kullanici WHERE id = ? LIMIT 1').bind(oturum.kullanici_id).first();
  if (!kullanici) return json({ ok: false, hata: 'oturum-yok' }, 401, cors);

  // Eski oturumu sil, yenisini aç (yenileme jetonu tek kullanımlık).
  await env.DB.prepare('DELETE FROM oturum WHERE id = ?').bind(oturum.id).run();
  const yeni = await oturumAc(env.DB, oturum.kullanici_id);
  return json({ ok: true, eposta: kullanici.eposta, ...yeni }, 200, cors);
}

async function authCikis(istek, env, cors) {
  const govde = await govdeOku(istek);
  if (govde.ok && govde.veri.yenileme) {
    await env.DB.prepare('DELETE FROM oturum WHERE yenileme_hash = ?').bind(await ozetle(String(govde.veri.yenileme))).run();
  }
  const jeton = bearer(istek);
  if (jeton) {
    await env.DB.prepare('DELETE FROM oturum WHERE jeton_hash = ?').bind(await ozetle(jeton)).run();
  }
  return json({ ok: true }, 200, cors);
}

async function meOku(istek, env, cors) {
  const oturum = await oturumCoz(env.DB, bearer(istek));
  if (!oturum) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  const satir = await env.DB.prepare('SELECT veri, surum, zaman FROM durum WHERE kullanici_id = ?').bind(oturum.kullanici_id).first();
  if (!satir) return json({ ok: true, veri: {}, surum: 0 }, 200, cors);
  let veri = {};
  try {
    veri = JSON.parse(satir.veri);
  } catch {
    veri = {};
  }
  return json({ ok: true, veri, surum: satir.surum, zaman: satir.zaman }, 200, cors);
}

async function meYaz(istek, env, cors) {
  const oturum = await oturumCoz(env.DB, bearer(istek));
  if (!oturum) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);

  // Taşıma sınırı, blob sınırından büyüktür; 413 veri-buyuk yolunun erişilebilir
  // kalması için buraya özel sınır verilir (yoksa 64 KB gövde sınırı önce keser).
  const govde = await govdeOku(istek, BLOB_GOVDE_SINIRI);
  if (!govde.ok) return json({ ok: false, hata: govde.hata }, 400, cors);
  const veri = govde.veri.veri;
  const istemciSurum = Number(govde.veri.surum || 0);
  if (!veri || typeof veri !== 'object' || Array.isArray(veri)) {
    return json({ ok: false, hata: 'veri-gecersiz' }, 400, cors);
  }
  if (!Number.isInteger(istemciSurum) || istemciSurum < 0) {
    return json({ ok: false, hata: 'surum-gecersiz' }, 400, cors);
  }
  // D1 satır sınırı bayt cinsindendir; ölçüyü UTF-8 baytıyla yap (aksanlı/çok
  // baytlı başlıklar dize uzunluğundan büyük yer kaplar).
  const metin = JSON.stringify(veri);
  if (baytUzunlugu(metin) > BLOB_SINIRI) return json({ ok: false, hata: 'veri-buyuk' }, 413, cors);

  const mevcut = await env.DB.prepare('SELECT surum FROM durum WHERE kullanici_id = ?').bind(oturum.kullanici_id).first();
  const sunucuSurum = mevcut ? Number(mevcut.surum) : 0;
  if (istemciSurum !== sunucuSurum) {
    return json({ ok: false, hata: 'cakisma', surum: sunucuSurum }, 409, cors);
  }

  const yeniSurum = sunucuSurum + 1;
  const zaman = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO durum (kullanici_id, veri, surum, zaman) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(kullanici_id) DO UPDATE SET veri = excluded.veri, surum = excluded.surum, zaman = excluded.zaman'
  )
    .bind(oturum.kullanici_id, metin, yeniSurum, zaman)
    .run();
  return json({ ok: true, surum: yeniSurum, zaman }, 200, cors);
}

async function meVeri(istek, env, cors) {
  const oturum = await oturumCoz(env.DB, bearer(istek));
  if (!oturum) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  const satir = await env.DB.prepare('SELECT veri, surum, zaman FROM durum WHERE kullanici_id = ?').bind(oturum.kullanici_id).first();
  let veri = {};
  if (satir) {
    try {
      veri = JSON.parse(satir.veri);
    } catch {
      veri = {};
    }
  }
  return json(
    {
      ok: true,
      eposta: oturum.eposta,
      indirme: new Date().toISOString(),
      surum: satir ? satir.surum : 0,
      durum: veri,
    },
    200,
    cors
  );
}

async function meSil(istek, env, cors) {
  const oturum = await oturumCoz(env.DB, bearer(istek));
  if (!oturum) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  await env.DB.prepare('DELETE FROM oturum WHERE kullanici_id = ?').bind(oturum.kullanici_id).run();
  await env.DB.prepare('DELETE FROM durum WHERE kullanici_id = ?').bind(oturum.kullanici_id).run();
  await env.DB.prepare('DELETE FROM kullanici WHERE id = ?').bind(oturum.kullanici_id).run();
  return json({ ok: true, silindi: true }, 200, cors);
}

/* --- link tarama döngüsü (yönetici paneli) --- */

/** Ayar satırını okur; ilk çağrıda varsayılan satırı oluşturur. */
async function taramaAyarOku(env) {
  await env.DB.prepare('INSERT INTO tarama_ayar (id, guncelleme) VALUES (1, ?) ON CONFLICT(id) DO NOTHING')
    .bind(new Date().toISOString())
    .run();
  const satir = await env.DB.prepare(
    'SELECT aktif, dilim, saat, yayinla, push, hemen, guncelleme FROM tarama_ayar WHERE id = 1'
  ).first();
  return satir || { aktif: 1, dilim: 1500, saat: 4, yayinla: 0, push: 0, hemen: 0, guncelleme: null };
}

async function taramaKalpYaz(env, makine, sonKarar) {
  await env.DB.prepare(
    'INSERT INTO tarama_kalp (makine, zaman, surum, son_karar) VALUES (?, ?, ?, ?) ON CONFLICT(makine) DO UPDATE SET zaman = excluded.zaman, surum = excluded.surum, son_karar = excluded.son_karar'
  )
    .bind(makine, new Date().toISOString(), SURUM, sonKarar)
    .run();
}

async function taramaAyar(istek, env, cors) {
  if (!adminMi(istek, env)) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  return json({ ok: true, ayar: await taramaAyarOku(env) }, 200, cors);
}

async function taramaAyarYaz(istek, env, cors) {
  if (!adminMi(istek, env)) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  const govde = await govdeOku(istek);
  if (!govde.ok) return json({ ok: false, hata: govde.hata }, 400, cors);
  const mevcut = await taramaAyarOku(env);
  // Gönderilmeyen alanlar korunur: panel tek bir bayrak değiştirebilir (ör. "hemen çalıştır").
  const yeni = taramaAyarNormalize({ ...mevcut, ...govde.veri });
  await env.DB.prepare(
    'UPDATE tarama_ayar SET aktif = ?, dilim = ?, saat = ?, yayinla = ?, push = ?, hemen = ?, guncelleme = ? WHERE id = 1'
  )
    .bind(yeni.aktif, yeni.dilim, yeni.saat, yeni.yayinla, yeni.push, yeni.hemen, new Date().toISOString())
    .run();
  return json({ ok: true, ayar: yeni }, 200, cors);
}

async function taramaDurum(istek, env, cors) {
  if (!adminMi(istek, env)) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  const ayar = await taramaAyarOku(env);
  const kosular = await env.DB.prepare(
    'SELECT id, zaman, makine, dilim, sure_sn, sonuc, kapsam, not_metni FROM tarama_kosu ORDER BY id DESC LIMIT 50'
  ).all();
  const kalpler = await env.DB.prepare('SELECT makine, zaman, surum, son_karar FROM tarama_kalp ORDER BY zaman DESC LIMIT 5').all();
  return json(
    {
      ok: true,
      ayar,
      kosular: kosular.results || [],
      kalpler: kalpler.results || [],
      sunucu_zaman: new Date().toISOString(),
      surum: SURUM,
      kosu_siniri: TARAMA_KOSU_SINIRI,
    },
    200,
    cors
  );
}

async function taramaKosu(istek, env, cors) {
  if (!adminMi(istek, env)) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  const govde = await govdeOku(istek);
  if (!govde.ok) return json({ ok: false, hata: govde.hata }, 400, cors);
  const k = taramaKosuNormalize(govde.veri);
  const zaman = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO tarama_kosu (zaman, makine, dilim, sure_sn, sonuc, kapsam, not_metni) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(zaman, k.makine, k.dilim, k.sure_sn, k.sonuc, k.kapsam, k.not_metni)
    .run();
  // Geçmiş sınırsız büyümesin: son TARAMA_KOSU_SINIRI kayıt tutulur.
  await env.DB.prepare('DELETE FROM tarama_kosu WHERE id <= (SELECT MAX(id) FROM tarama_kosu) - ?')
    .bind(TARAMA_KOSU_SINIRI)
    .run();
  await taramaKalpYaz(env, k.makine, k.sonuc === 'ok' ? 'kosu-ok' : 'kosu-hata');
  return json({ ok: true, kayitli: zaman }, 201, cors);
}

async function taramaKalp(istek, env, cors) {
  if (!adminMi(istek, env)) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  const govde = await govdeOku(istek);
  if (!govde.ok) return json({ ok: false, hata: govde.hata }, 400, cors);
  const makine = typeof govde.veri.makine === 'string' ? govde.veri.makine.trim().slice(0, 60) : '';
  const karar = typeof govde.veri.karar === 'string' ? govde.veri.karar.trim().slice(0, 40) : '';
  await taramaKalpYaz(env, makine || 'bilinmiyor', karar);
  return json({ ok: true }, 200, cors);
}

/* ================================================================ */
/* 1.9 · Akış köprüsü (çözümleyici + aktarım)                       */
/* ================================================================ */

/**
 * `/akis/coz` için günlük IP sınırı (ölçüm: docs/12 risk listesi #5).
 *
 * Önbellek **vuruşları sayılmaz**: sınır, yukarı akışa çıkan gerçek
 * çözümlemeleri hedefler — uç her çözümlemede kaynağa iki istek yapıyor
 * (embed + meta). Aynı kaynağı yeniden izlemek önbellekten döner, sayaca
 * dokunmaz. D1 bağlı değilse (ör. yerel dev) sınır uygulanmaz.
 */
async function akisOraniUygun(istek, env) {
  if (!env.DB) return true;
  const ip = istek.headers.get('CF-Connecting-IP') || 'yok';
  const ipHash = await ipTuzla(ip, env.IP_TUZ || env.JWT_SECRET || 'genesis');
  const gun = new Date().toISOString().slice(0, 10);
  return !(await oranAsildi(env.DB, `akis:${ipHash}`, gun, AKIS_GUNLUK_SINIR));
}

/**
 * `GET /akis/coz?kaynak=<embed adresi>`
 *
 * Embed adresini doğrudan akışa çevirir. İmzalar günlük olduğu için sonuç
 * imza bitişine kadar Cache API'de tutulur — kaynağı her oynatmada yeniden
 * yormayız. Yanıt, oynatıcının kullanacağı `aktarim` adresini de içerir.
 *
 * `?t=<rastgele>` önbelleği atlar (taze çözümleme): istemci video hatasında
 * ucu bu şekilde tazeler; eski imza gece yarısını geçmişse başka çare yoktur.
 */
async function akisCozUc(istek, env, cors) {
  const u = new URL(istek.url);
  const kaynak = (u.searchParams.get('kaynak') || '').trim();
  if (!kaynak) return json({ ok: false, hata: 'kaynak-yok' }, 400, cors);
  if (!kaynakTuru(kaynak)) return json({ ok: false, hata: 'desteklenmiyor' }, 400, cors);

  const onbellek = caches.default;
  /* Önbellek anahtarı origin'den bağımsız: CORS başlıkları yanıt üretilirken eklenir.
     SÜRÜM NOTU (v2, 03.10): Cache API aynı zone'daki worker'lar arasında PAYLAŞILIYOR —
     test Worker'ının ölçüm sırasında yazdığı girdiler üretimde servis edildi ve
     `aktarim` adresi test Worker'ına işaret etti (canlı doğrulamada yakalandı, H-35).
     Anahtarı sürümlemek o girdileri görünmez kılar; yeni girdiyi sunan worker yazar.
     SÜRÜM NOTU (v3, 04.10): çözümleme genişledi (VK/OK/Drive/Dailymotion/Yandex/HLS):
     eski girdiler "desteklenmiyor"u önbelleğe almış olabilir; v3 onları görünmez kılar. */
  const anahtar = new Request(`https://akis-onbellek.local/coz?v=3&k=${encodeURIComponent(kaynak)}`);
  /* `?t=` → istemci taze çözümleme istiyor (imzası düşmüş adres 403/502 verdi).
     Önbelleği atlarız ama sonucu yine yazarız: **tazeleme** budur. */
  const taze = onbellekAtlaMi(u.searchParams);
  const vurulan = taze ? null : await onbellek.match(anahtar);
  if (vurulan) {
    const veri = await vurulan.json();
    return json(veri, 200, { ...cors, 'X-Akis-Onbellek': 'vuruldu' });
  }

  /* Sınır burada: yalnızca gerçek çözümleme (önbellek vuruşu ücretsiz).
     Aşılırsa istemci iframe yoluna düşer — sessiz bir gerileme değil. */
  if (!(await akisOraniUygun(istek, env))) {
    return json({ ok: false, hata: 'cok-fazla-istek' }, 429, cors);
  }

  const sonuc = await akisCoz(kaynak, { siteOrigin: env.SITE_ORIGIN });
  if (!sonuc.ok) {
    /* Sızıntı yok: yalnız sınıflandırma döner, upstream gövdesi değil. */
    return json({ ok: false, hata: sonuc.hata, durum: sonuc.durum ?? null }, 404, cors);
  }

  const veri = {
    ok: true,
    kaynakAdi: sonuc.kaynakAdi,
    tur: sonuc.tur,
    url: sonuc.url,
    imzaBitis: sonuc.imzaBitis,
    aktarim: `${u.origin}/akis/aktar?u=${encodeURIComponent(sonuc.url)}`,
  };

  const saniye = sonuc.imzaBitis ? Math.floor((sonuc.imzaBitis - Date.now()) / 1000) : 3600;
  const ttl = Math.max(60, Math.min(6 * 60 * 60, saniye));
  await onbellek.put(
    anahtar,
    new Response(JSON.stringify(veri), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `max-age=${ttl}` },
    })
  );

  return json(veri, 200, taze ? { ...cors, 'X-Akis-Onbellek': 'atlandi' } : cors);
}

/**
 * `POST /akis/hata` — site playerının çözümleme hatası bildirimi.
 *
 * Topluluk ölçümü: hangi host, hangi bölümde çözülemedi. Kullanıcı bildirimi
 * (`/bildirim`) gibi karar değil, öncelik/ölçüm girdisidir; yönetici panelinde
 * host bazında toplanır. Gövde küçüktür: kaynak URL'i, hata kodu, anime/bölüm.
 * IP tuzlanır (ham hâli saklanmaz), aynı kaynak+hata 1 saat içinde tekrar yazılmaz.
 */
async function akisHataEkle(istek, env, cors) {
  const govde = await govdeOku(istek);
  if (!govde.ok) return json({ ok: false, hata: govde.hata }, 400, cors);
  const kontrol = akisHataDogrula(govde.veri);
  if (!kontrol.ok) return json({ ok: false, hata: kontrol.hata }, 400, cors);

  const ip = istek.headers.get('CF-Connecting-IP') || 'yok';
  const ipHash = await ipTuzla(ip, env.IP_TUZ || env.JWT_SECRET || 'genesis');
  const gun = new Date().toISOString().slice(0, 10);

  if (await oranAsildi(env.DB, `akis-hata:${ipHash}`, gun, AKIS_HATA_GUNLUK_SINIR)) {
    return json({ ok: false, hata: 'cok-fazla-istek' }, 429, cors);
  }
  const { url, host, anime, bolum, hata } = kontrol.veri;
  if (await akisHataTekrarMi(env.DB, url, hata, ipHash)) {
    return json({ ok: true, tekrar: true }, 200, cors);
  }

  await env.DB.prepare(
    'INSERT INTO akis_hata (url, host, anime, bolum, hata, ip_hash, zaman) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(url, host, anime, bolum, hata, ipHash, new Date().toISOString())
    .run();

  return json({ ok: true }, 201, cors);
}

/**
 * `GET /akis/hata?gun=7&limit=40` — yönetici özeti (ADMIN_TOKEN).
 * Host bazında toplam + son kayıtlar; panel “hangi host çözülemiyor” sorusunu
 * buradan yanıtlar. Sorgu parametreleri NaN'a düşse bile güvenli varsayılana döner.
 */
async function akisHataListe(istek, env, cors) {
  if (!adminMi(istek, env)) return json({ ok: false, hata: 'yetkisiz' }, 401, cors);
  const url = new URL(istek.url);
  const istenenGun = Number(url.searchParams.get('gun'));
  const istenenLimit = Number(url.searchParams.get('limit'));
  const gun = Number.isFinite(istenenGun) && istenenGun > 0 ? Math.min(Math.floor(istenenGun), 90) : 7;
  const limit = Number.isFinite(istenenLimit) && istenenLimit > 0 ? Math.min(Math.floor(istenenLimit), 200) : 40;
  const esik = new Date(Date.now() - gun * 24 * 60 * 60 * 1000).toISOString();

  const ozet = await env.DB.prepare(
    'SELECT host, COUNT(*) AS adet, MAX(zaman) AS son FROM akis_hata WHERE zaman >= ? GROUP BY host ORDER BY adet DESC LIMIT ?'
  )
    .bind(esik, limit)
    .all();
  const son = await env.DB.prepare(
    'SELECT url, host, anime, bolum, hata, zaman FROM akis_hata WHERE zaman >= ? ORDER BY zaman DESC, id DESC LIMIT ?'
  )
    .bind(esik, limit)
    .all();

  return json({ ok: true, gun, hostlar: ozet.results || [], son: son.results || [] }, 200, cors);
}

/**
 * Sunucunun denemeye açık resolver host'larını duyur.
 * `kapsamDisi`: çözülemeyen sağlayıcılar ve gerekçeleri — istemci bunları
 * site playerında **denemez**, doğrudan kendi oynatıcısına düşer.
 */
function akisKapsamUc(cors) {
  return json(
    { ok: true, surum: AKIS_KAPSAM_SURUMU, hostlar: desteklenenHostlar(), kapsamDisi: cozulemeyenKaynaklar() },
    200,
    { ...cors, 'Cache-Control': 'public, max-age=600' }
  );
}

/**
 * `GET|HEAD /akis/aktar?u=<imzalı akış adresi>`
 *
 * Medya baytlarını Range'i koruyarak aktarır. Yalnızca izin listesindeki
 * host'lar ve yalnız imzalı adresler geçer (bkz. akis.mjs · aktarimIzni) —
 * uç bir açık proxy değildir.
 */
async function akisAktarUc(istek, env, cors) {
  const u = new URL(istek.url);
  const hedef = u.searchParams.get('u') || '';
  if (!hedef) return json({ ok: false, hata: 'adres-yok' }, 400, cors);

  const sonuc = await aktar(istek, hedef, { cors });
  if (sonuc.hata) {
    return json({ ok: false, hata: sonuc.hata, ayrinti: sonuc.ayrinti ?? null }, sonuc.durum, cors);
  }
  return new Response(sonuc.govde, { status: sonuc.durum, headers: sonuc.basliklar });
}

/* ================================================================ */
/* 2 · Ana yönlendirici                                             */
/* ================================================================ */

async function istekIsle(istek, env) {
  const origin = istek.headers.get('Origin');
  const cors = corsBasliklari(origin, env);
  const yol = new URL(istek.url).pathname;
  const k = yolCoz(yol, istek.method);

  if (istek.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    switch (k.islem) {
      case 'kok':
        return json({ ok: true, ad: 'genesisanime-api', surum: SURUM }, 200, cors);
      case 'saglik':
        return json({ ok: true, zaman: new Date().toISOString() }, 200, cors);
      case 'bildirim-ekle':
        return await bildirimEkle(istek, env, cors);
      case 'bildirim-liste':
        return await bildirimListe(istek, env, cors);
      case 'bildirim-durum':
        return await bildirimDurum(istek, env, k, cors);
      case 'auth-kayit':
        return await authKayit(istek, env, cors);
      case 'auth-giris':
        return await authGiris(istek, env, cors);
      case 'auth-yenile':
        return await authYenile(istek, env, cors);
      case 'auth-cikis':
        return await authCikis(istek, env, cors);
      case 'me-okuma':
        return await meOku(istek, env, cors);
      case 'me-yazma':
        return await meYaz(istek, env, cors);
      case 'me-veri':
        return await meVeri(istek, env, cors);
      case 'me-sil':
        return await meSil(istek, env, cors);
      case 'tarama-ayar':
        return await taramaAyar(istek, env, cors);
      case 'tarama-ayar-yaz':
        return await taramaAyarYaz(istek, env, cors);
      case 'tarama-durum':
        return await taramaDurum(istek, env, cors);
      case 'tarama-kosu':
        return await taramaKosu(istek, env, cors);
      case 'tarama-kalp':
        return await taramaKalp(istek, env, cors);
      case 'akis-hata-ekle':
        return akisHataEkle(istek, env, cors);
      case 'akis-hata-liste':
        return akisHataListe(istek, env, cors);
      case 'akis-kapsam':
        return akisKapsamUc(cors);
      case 'akis-coz':
        return await akisCozUc(istek, env, cors);
      case 'akis-aktar':
        return await akisAktarUc(istek, env, cors);
      case 'yontem-yok':
        return json({ ok: false, hata: 'yontem-yok' }, 405, cors);
      default:
        return json({ ok: false, hata: 'yol-yok' }, 404, cors);
    }
  } catch (hata) {
    // Beklenmeyen hata: ayrıntıyı sızdırma, log'a bırak.
    console.error('api-hatasi', hata && hata.stack ? hata.stack : hata);
    return json({ ok: false, hata: 'sunucu-hatasi' }, 500, cors);
  }
}

export default {
  /**
   * `ctx` (ExecutionContext) yalnızca `waitUntil` için hazır tutulur: bugün
   * kullanılmıyor, ama uzun süren aktarımlarda önbellek yazımını isteğin
   * dışına taşımak gerektiğinde imzayı değiştirmek yeterli olsun.
   */
  fetch(istek, env, ctx) {
    return istekIsekSar(istek, env, ctx);
  },
};

function istekIsekSar(istek, env, ctx) {
  void ctx;
  return istekIsle(istek, env);
}
