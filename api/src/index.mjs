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
 *   POST   /bildirim/:id         yönetici: durum güncelle (yeni|incelendi|gecersiz)
 *   POST   /auth/kayit           e-posta + parola ile kayıt
 *   POST   /auth/giris           giriş (jeton + yenileme)
 *   POST   /auth/yenile          yenileme jetonu ile yeni erişim jetonu
 *   POST   /auth/cikis           oturumu kapat
 *   GET    /me/durum             senkron blob'u oku        (Bearer)
 *   PUT    /me/durum             senkron blob'u yaz (iyimser kilit)  (Bearer)
 *   GET    /me/veri              KVKK: verilerimi indir    (Bearer)
 *   DELETE /me                   KVKK: hesabımı sil        (Bearer)
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
  BILDIRIM_DURUMLARI,
  BILDIRIM_GUNLUK_SINIR,
  BLOB_GOVDE_SINIRI,
  BLOB_SINIRI,
  GIRIS_SAATLIK_SINIR,
  SURUM,
  adminMi,
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
  yolCoz,
} from './yardimci.mjs';

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
  fetch(istek, env) {
    return istekIsle(istek, env);
  },
};
