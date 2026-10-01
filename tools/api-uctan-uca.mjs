/**
 * api-uctan-uca.mjs — API uçtan uca duman testi (gerçek Worker + gerçek D1)
 * ========================================================================
 * `npm test` ağsız/sahte D1 ile koşar; bu araç ise ÇALIŞAN bir API'ye (yerelde
 * `wrangler dev`, uzakta deploy edilmiş Worker) gerçek istekler atarak tüm
 * zinciri doğrular: sağlık → bildirim (tekrar süzme + yönetici kuyruğu) →
 * kayıt → giriş → senkron (iyimser kilit/409) → yenileme rotasyonu → çıkış →
 * KVKK (veri indirme + hesap silme) → CORS.
 *
 * Kullanım (yerel):
 *   cd api && npx wrangler dev --port 8789 --var CORS_EXTRA:http://127.0.0.1:8000
 *   GENESIS_ADMIN_TOKEN=<yerel jeton> npm run api:test
 *
 * Kullanım (uzak deneme):
 *   GENESIS_API_URL=https://genesisanime-api.<hesap>.workers.dev \
 *   GENESIS_ADMIN_TOKEN=... npm run api:test
 *
 * Bayraklar:
 *   --api=URL      Worker adresi            (GENESIS_API_URL, varsayılan http://127.0.0.1:8789)
 *   --token=JETON  yönetici jetonu          (GENESIS_ADMIN_TOKEN; yoksa yönetici adımları atlanır)
 *   --origin=URL   CORS denetiminde izinli kaynak (GENESIS_ORIGIN, varsayılan http://127.0.0.1:8000)
 *   --oran         oran sınırını 31 bildirimle gerçekten zorla (30+ kayıt ekler)
 *   --yardim       bu metin
 *
 * Not: Betik hesabı sonunda SİLER (DELETE /me) ve açtığı bildirimi yönetici
 * olarak "gecersiz" işaretler; uzak ortamda yine de birkaç geçici satır bırakır.
 */
import { baslik, log } from './lib/ortak.mjs';

/* ================================================================ */
/* 0 · Ayarlar                                                       */
/* ================================================================ */

export const AYAR = {
  api: process.env.GENESIS_API_URL || 'http://127.0.0.1:8789',
  token: process.env.GENESIS_ADMIN_TOKEN || '',
  origin: process.env.GENESIS_ORIGIN || 'http://127.0.0.1:8000',
  oran: false,
};

const YARDIM = `
api-uctan-uca.mjs — çalışan API'ye gerçek isteklerle uçtan uca duman testi

  --api=URL      Worker adresi             (GENESIS_API_URL, varsayılan http://127.0.0.1:8789)
  --token=JETON  yönetici jetonu           (GENESIS_ADMIN_TOKEN; yoksa yönetici adımları atlanır)
  --origin=URL   CORS için izinli kaynak   (GENESIS_ORIGIN, varsayılan http://127.0.0.1:8000)
  --oran         oran sınırını gerçekten zorla (30+ bildirim yazar)
`;

if (process.argv[1] && process.argv[1].endsWith('api-uctan-uca.mjs')) {
  for (const arg of process.argv.slice(2)) {
    const [anahtar, deger] = arg.replace(/^--/, '').split('=');
    switch (anahtar) {
      case 'yardim':
      case 'help':
        console.log(YARDIM);
        process.exit(0);
      case 'api':
        AYAR.api = (deger || '').replace(/\/$/, '');
        break;
      case 'token':
        AYAR.token = deger || '';
        break;
      case 'origin':
        AYAR.origin = deger || AYAR.origin;
        break;
      case 'oran':
        AYAR.oran = true;
        break;
      default:
        log(`   [i] bilinmeyen bayrak yok sayıldı: --${anahtar}=${deger ?? ''}`);
    }
  }
}

/* ================================================================ */
/* 1 · İstek ve rapor altyapısı                                      */
/* ================================================================ */

const sayac = { gecti: 0, kaldi: 0, atlandi: 0 };
const basarisizlar = [];

/** Tek bir adımı raporlar; başarısızlıkta ayrıntıyı biriktirir. */
function kontrol(ad, kosul, ayrinti = '') {
  if (kosul) {
    sayac.gecti++;
    log(`   [✓] ${ad}`);
  } else {
    sayac.kaldi++;
    basarisizlar.push(`${ad}${ayrinti ? ` — ${ayrinti}` : ''}`);
    log(`   [x] ${ad}${ayrinti ? `  (${ayrinti})` : ''}`);
  }
}

function atla(ad, neden) {
  sayac.atlandi++;
  log(`   [-] ${ad} — atlandı (${neden})`);
}

async function istek(yol, secenekler = {}) {
  const yanit = await fetch(AYAR.api + yol, secenekler);
  const metin = await yanit.text();
  let govde = null;
  try {
    govde = metin ? JSON.parse(metin) : null;
  } catch {
    govde = metin;
  }
  return { durum: yanit.status, govde, basliklar: yanit.headers };
}

const json = (yol, yontem, veri, basliklar = {}) =>
  istek(yol, {
    method: yontem,
    headers: { 'Content-Type': 'application/json', ...basliklar },
    body: JSON.stringify(veri),
  });

/* ================================================================ */
/* 2 · Akış                                                          */
/* ================================================================ */

export async function kostur() {
  const damga = Date.now().toString(36);
  const eposta = `e2e-${damga}@example.com`;
  const parola = `parola-e2e-${damga}-uzun`;
  const bildirimUrl = `https://video.sibnet.ru/shell.php?videoid=${damga}`;
  let yonetici = Boolean(AYAR.token);
  let bildirimId = null;
  let jeton = null;
  let yenileme = null;

  baslik(`api-uctan-uca — ${AYAR.api}`);
  log(`   yönetici jetonu: ${yonetici ? 'var' : 'YOK (yönetici adımları atlanır)'}`);

  /* --- 0: sağlık --- */
  log('\n0) sağlık ve yönlendirme');
  const kok = await istek('/');
  kontrol('GET / sürüm bilgisi döndürür', kok.durum === 200 && kok.govde?.ad === 'genesisanime-api', `durum=${kok.durum}`);
  const saglik = await istek('/saglik');
  kontrol('GET /saglik 200 ve ok=true', saglik.durum === 200 && saglik.govde?.ok === true, `durum=${saglik.durum}`);
  const yok = await istek('/olmayan-yol');
  kontrol('bilinmeyen yol 404 yol-yok', yok.durum === 404 && yok.govde?.hata === 'yol-yok', `durum=${yok.durum} hata=${yok.govde?.hata}`);
  const yontem = await istek('/auth/kayit', { method: 'GET' });
  kontrol('GET /auth/kayit 405 yontem-yok', yontem.durum === 405 && yontem.govde?.hata === 'yontem-yok', `durum=${yontem.durum}`);

  /* --- 1: CORS --- */
  log('\n1) CORS');
  const on = await istek('/auth/kayit', { method: 'OPTIONS', headers: { Origin: AYAR.origin } });
  kontrol(
    `OPTIONS izinli kaynak 204 + ACAO=${AYAR.origin}`,
    on.durum === 204 && on.basliklar.get('access-control-allow-origin') === AYAR.origin,
    `durum=${on.durum} acao=${on.basliklar.get('access-control-allow-origin')}`
  );
  const dis = await istek('/auth/kayit', { method: 'OPTIONS', headers: { Origin: 'https://kotu-ornek.example' } });
  kontrol('OPTIONS izinsiz kaynak ACAO başlığı almaz', dis.durum === 204 && !dis.basliklar.get('access-control-allow-origin'));

  /* --- 2: bildirim --- */
  log('\n2) bildirim hattı');
  const bos = await json('/bildirim', 'POST', { url: '' });
  kontrol('boş URL 400 url-gecersiz', bos.durum === 400 && bos.govde?.hata === 'url-gecersiz', `durum=${bos.durum} hata=${bos.govde?.hata}`);
  const ic = await json('/bildirim', 'POST', { url: 'http://127.0.0.1:9999/video' });
  kontrol('iç adres (IP) 400 url-gecersiz', ic.durum === 400 && ic.govde?.hata === 'url-gecersiz', `durum=${ic.durum}`);
  const tur = await json('/bildirim', 'POST', { url: bildirimUrl, tur: 'sacma' });
  kontrol('bilinmeyen tür 400 tur-gecersiz', tur.durum === 400 && tur.govde?.hata === 'tur-gecersiz', `durum=${tur.durum}`);

  const eklendi = await json('/bildirim', 'POST', { url: bildirimUrl, anime: 'naruto', bolum: 1, tur: 'calismiyor', host: 'kotu.example' });
  kontrol('geçerli bildirim 201 ok', eklendi.durum === 201 && eklendi.govde?.ok === true, `durum=${eklendi.durum}`);
  const tekrar = await json('/bildirim', 'POST', { url: bildirimUrl, anime: 'naruto', bolum: 1 });
  kontrol('aynı bildirim 200 tekrar=true', tekrar.durum === 200 && tekrar.govde?.tekrar === true, `durum=${tekrar.durum} govde=${JSON.stringify(tekrar.govde)}`);

  if (yonetici) {
    const yetkisiz = await istek('/bildirim?durum=yeni');
    kontrol('jetonsuz kuyruk 401 yetkisiz', yetkisiz.durum === 401 && yetkisiz.govde?.hata === 'yetkisiz', `durum=${yetkisiz.durum}`);
    const liste = await istek('/bildirim?durum=yeni&limit=1000', { headers: { Authorization: `Bearer ${AYAR.token}` } });
    const kayit = Array.isArray(liste.govde?.kayitlar) ? liste.govde.kayitlar.find((r) => r.url === bildirimUrl) : null;
    kontrol('yönetici kuyruğu bildirimi listeler', liste.durum === 200 && Boolean(kayit), `durum=${liste.durum} adet=${liste.govde?.adet}`);
    kontrol('kayıtta host URL’den türetilmiş (www yok, kotu.example değil)', kayit?.host === 'video.sibnet.ru', `host=${kayit?.host}`);
    kontrol('kayıt durumu yeni', kayit?.durum === 'yeni', `durum=${kayit?.durum}`);
    bildirimId = kayit?.id ?? null;

    if (bildirimId) {
      const kotuDurum = await json(`/bildirim/${bildirimId}`, 'POST', { durum: 'uydurma' }, { Authorization: `Bearer ${AYAR.token}` });
      kontrol('geçersiz hedef durum 400', kotuDurum.durum === 400 && kotuDurum.govde?.hata === 'durum-gecersiz', `durum=${kotuDurum.durum}`);
      const isaret = await json(`/bildirim/${bildirimId}`, 'POST', { durum: 'incelendi' }, { Authorization: `Bearer ${AYAR.token}` });
      kontrol('bildirim incelendi olarak işaretlenir', isaret.durum === 200 && isaret.govde?.ok === true, `durum=${isaret.durum}`);
      const yokId = await json('/bildirim/999999999', 'POST', { durum: 'incelendi' }, { Authorization: `Bearer ${AYAR.token}` });
      kontrol('olmayan bildirim kimliği 404 kayit-yok', yokId.durum === 404 && yokId.govde?.hata === 'kayit-yok', `durum=${yokId.durum} hata=${yokId.govde?.hata}`);
    }
  } else {
    atla('yönetici kuyruğu', 'ADMIN_TOKEN yok');
  }

  const oranOnek = `https://video.sibnet.ru/shell.php?videoid=oran-${damga}-`;
  if (AYAR.oran) {
    log('   … oran sınırı zorlanıyor (31 bildirim)');
    let son = null;
    for (let i = 0; i < 31; i++) son = await json('/bildirim', 'POST', { url: `${oranOnek}${i}` });
    kontrol('günlük sınır aşılınca 429 cok-fazla-istek', son.durum === 429 && son.govde?.hata === 'cok-fazla-istek', `durum=${son.durum} hata=${son.govde?.hata}`);

    // Bu koşu için açılan sayaç satırlarını kuyruktan düşür (yönetici varsa).
    if (yonetici) {
      const liste = await istek('/bildirim?durum=yeni&limit=1000', { headers: { Authorization: `Bearer ${AYAR.token}` } });
      const bizim = (liste.govde?.kayitlar || []).filter((r) => typeof r.url === 'string' && r.url.startsWith(oranOnek));
      for (const r of bizim) await json(`/bildirim/${r.id}`, 'POST', { durum: 'gecersiz' }, { Authorization: `Bearer ${AYAR.token}` });
      if (bizim.length) log(`   … ${bizim.length} oran testi kaydı geçersiz işaretlendi`);
    }
  } else {
    atla('oran sınırı (429)', '--oran verilmedi; birim testlerde sahte D1 ile sınanıyor');
  }

  /* --- 3: kayıt + giriş --- */
  log('\n3) kayıt ve giriş');
  const kisa = await json('/auth/kayit', 'POST', { eposta, parola: 'kisa' });
  kontrol('kısa parola 400 parola-gecersiz', kisa.durum === 400 && kisa.govde?.hata === 'parola-gecersiz', `durum=${kisa.durum}`);
  const kotuEposta = await json('/auth/kayit', 'POST', { eposta: 'eposta-degil', parola });
  kontrol('geçersiz e-posta 400 eposta-gecersiz', kotuEposta.durum === 400 && kotuEposta.govde?.hata === 'eposta-gecersiz', `durum=${kotuEposta.durum}`);

  const kayit = await json('/auth/kayit', 'POST', { eposta: eposta.toUpperCase(), parola });
  kontrol('kayıt 201 + jeton + yenileme', kayit.durum === 201 && kayit.govde?.ok === true && typeof kayit.govde?.jeton === 'string' && typeof kayit.govde?.yenileme === 'string', `durum=${kayit.durum}`);
  kontrol('e-posta küçük harfe normalleşir', kayit.govde?.eposta === eposta, `eposta=${kayit.govde?.eposta}`);
  jeton = kayit.govde?.jeton;
  yenileme = kayit.govde?.yenileme;

  const cift = await json('/auth/kayit', 'POST', { eposta, parola });
  kontrol('aynı e-posta 409 eposta-kayitli', cift.durum === 409 && cift.govde?.hata === 'eposta-kayitli', `durum=${cift.durum} hata=${cift.govde?.hata}`);
  const yanlis = await json('/auth/giris', 'POST', { eposta, parola: `${parola}-yanlis` });
  kontrol('yanlış parola 401 eposta-parola', yanlis.durum === 401 && yanlis.govde?.hata === 'eposta-parola', `durum=${yanlis.durum}`);
  const giris = await json('/auth/giris', 'POST', { eposta, parola });
  kontrol('giriş 200 + jeton + yenileme', giris.durum === 200 && typeof giris.govde?.jeton === 'string' && typeof giris.govde?.yenileme === 'string', `durum=${giris.durum}`);
  if (typeof giris.govde?.jeton === 'string') {
    jeton = giris.govde.jeton;
    yenileme = giris.govde.yenileme;
  }

  /* --- 4: senkron --- */
  log('\n4) senkron (/me/durum — iyimser kilit)');
  const jetonsuz = await istek('/me/durum');
  kontrol('jetonsuz okuma 401 yetkisiz', jetonsuz.durum === 401 && jetonsuz.govde?.hata === 'yetkisiz', `durum=${jetonsuz.durum}`);
  const sahteJeton = await istek('/me/durum', { headers: { Authorization: 'Bearer uydurma-jeton' } });
  kontrol('uydurma jeton 401', sahteJeton.durum === 401, `durum=${sahteJeton.durum}`);

  const yetki = { Authorization: `Bearer ${jeton}` };
  const bosDurum = await istek('/me/durum', { headers: yetki });
  kontrol('ilk okuma sürüm 0 ve boş veri', bosDurum.durum === 200 && bosDurum.govde?.surum === 0, `durum=${bosDurum.durum} surum=${bosDurum.govde?.surum}`);
  const yaz1 = await json('/me/durum', 'PUT', { veri: { ilerleme: { naruto: 12 }, izlenenler: ['naruto'] }, surum: 0 }, yetki);
  kontrol('sürüm 0 ile yazma → sürüm 1', yaz1.durum === 200 && yaz1.govde?.surum === 1, `durum=${yaz1.durum} surum=${yaz1.govde?.surum}`);
  const oku1 = await istek('/me/durum', { headers: yetki });
  kontrol('okunan veri yazılanla aynı', oku1.durum === 200 && oku1.govde?.surum === 1 && oku1.govde?.veri?.ilerleme?.naruto === 12, `surum=${oku1.govde?.surum}`);
  const cakisma = await json('/me/durum', 'PUT', { veri: { ilerleme: { naruto: 99 } }, surum: 0 }, yetki);
  kontrol('eski sürümle yazma 409 cakisma + güncel sürüm', cakisma.durum === 409 && cakisma.govde?.hata === 'cakisma' && cakisma.govde?.surum === 1, `durum=${cakisma.durum} surum=${cakisma.govde?.surum}`);
  const yaz2 = await json('/me/durum', 'PUT', { veri: { ilerleme: { naruto: 13 } }, surum: 1 }, yetki);
  kontrol('güncel sürümle yazma → sürüm 2', yaz2.durum === 200 && yaz2.govde?.surum === 2, `durum=${yaz2.durum} surum=${yaz2.govde?.surum}`);
  const dizi = await json('/me/durum', 'PUT', { veri: [1, 2, 3], surum: 2 }, yetki);
  kontrol('dizi gövde 400 veri-gecersiz', dizi.durum === 400 && dizi.govde?.hata === 'veri-gecersiz', `durum=${dizi.durum}`);
  const buyuk = await json('/me/durum', 'PUT', { veri: { dolgu: 'x'.repeat(513 * 1024) }, surum: 2 }, yetki);
  kontrol('512 KB üstü blob 413 veri-buyuk', buyuk.durum === 413 && buyuk.govde?.hata === 'veri-buyuk', `durum=${buyuk.durum} hata=${buyuk.govde?.hata}`);

  /* --- 5: yenileme rotasyonu --- */
  log('\n5) yenileme rotasyonu ve çıkış');
  const yeniOturum = await json('/auth/yenile', 'POST', { yenileme });
  kontrol('yenileme 200 + yeni jeton çifti', yeniOturum.durum === 200 && typeof yeniOturum.govde?.jeton === 'string' && yeniOturum.govde?.yenileme !== yenileme, `durum=${yeniOturum.durum}`);
  const eskiYenileme = await json('/auth/yenile', 'POST', { yenileme });
  kontrol('eski yenileme jetonu tekrar kullanılamaz (401)', eskiYenileme.durum === 401 && eskiYenileme.govde?.hata === 'oturum-yok', `durum=${eskiYenileme.durum} hata=${eskiYenileme.govde?.hata}`);
  const eskiJeton = await istek('/me/durum', { headers: { Authorization: `Bearer ${jeton}` } });
  kontrol('rotasyon eski erişim jetonunu geçersizleştirir', eskiJeton.durum === 401, `durum=${eskiJeton.durum}`);
  const yeniJeton = yeniOturum.govde?.jeton;
  const yeniYenileme = yeniOturum.govde?.yenileme;
  const yeniYetki = { Authorization: `Bearer ${yeniJeton}` };
  const yeniOkuma = await istek('/me/durum', { headers: yeniYetki });
  kontrol('yeni jetonla okuma sürüm 2', yeniOkuma.durum === 200 && yeniOkuma.govde?.surum === 2, `durum=${yeniOkuma.durum} surum=${yeniOkuma.govde?.surum}`);

  const cikis = await json('/auth/cikis', 'POST', { yenileme: yeniYenileme }, yeniYetki);
  kontrol('çıkış 200', cikis.durum === 200 && cikis.govde?.ok === true, `durum=${cikis.durum}`);
  const cikisSonrasi = await istek('/me/durum', { headers: yeniYetki });
  kontrol('çıkıştan sonra jeton geçersiz', cikisSonrasi.durum === 401, `durum=${cikisSonrasi.durum}`);

  /* --- 6: KVKK --- */
  log('\n6) KVKK: veri indirme ve hesap silme');
  const oturum2 = await json('/auth/giris', 'POST', { eposta, parola });
  kontrol('yeniden giriş 200', oturum2.durum === 200, `durum=${oturum2.durum}`);
  const yetki2 = { Authorization: `Bearer ${oturum2.govde?.jeton}` };
  const veri = await istek('/me/veri', { headers: yetki2 });
  kontrol(
    'veri indirme e-posta + durum içerir',
    veri.durum === 200 && veri.govde?.eposta === eposta && veri.govde?.durum?.ilerleme?.naruto === 13 && veri.govde?.surum === 2,
    `durum=${veri.durum} surum=${veri.govde?.surum}`
  );
  const sil = await istek('/me', { method: 'DELETE', headers: yetki2 });
  kontrol('hesap silme 200 silindi=true', sil.durum === 200 && sil.govde?.silindi === true, `durum=${sil.durum}`);
  const silSonrasi = await istek('/me/durum', { headers: yetki2 });
  kontrol('silinen hesabın jetonu geçersiz', silSonrasi.durum === 401, `durum=${silSonrasi.durum}`);
  const tekrarKayit = await json('/auth/kayit', 'POST', { eposta, parola });
  kontrol('silinen e-posta yeniden kayıt olabilir', tekrarKayit.durum === 201, `durum=${tekrarKayit.durum}`);
  if (tekrarKayit.durum === 201) {
    await istek('/me', { method: 'DELETE', headers: { Authorization: `Bearer ${tekrarKayit.govde.jeton}` } });
  }

  /* --- özet --- */
  baslik('özet');
  log(`   geçti: ${sayac.gecti} · kaldı: ${sayac.kaldi} · atlandı: ${sayac.atlandi}`);
  if (basarisizlar.length) {
    log('   başarısız adımlar:');
    for (const b of basarisizlar) log(`     - ${b}`);
  }
  return sayac.kaldi === 0;
}

if (process.argv[1] && process.argv[1].endsWith('api-uctan-uca.mjs')) {
  kostur()
    .then((tamam) => process.exit(tamam ? 0 : 1))
    .catch((hata) => {
      console.error(`   [x] ${hata.stack || hata.message}`);
      process.exit(1);
    });
}
