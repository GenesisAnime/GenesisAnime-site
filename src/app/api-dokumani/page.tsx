import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE } from '@/lib/site';

/**
 * api-dokumani — API'nin kullanıcıya dönük belgesi
 * ================================================
 * Bu sayfa ELLE yazılmıştır ama koddan kopması engellenmiştir: `uçlar` aşağıdaki
 * tablolar ile `api/src/index.mjs` yönlendiricisi ve `yolCoz` (api/src/yardimci.mjs)
 * arasındaki tutarlılık `tools/testler/api-dokumani.test.mjs` ile sınanır —
 * belgede olmayan bir uç, ya da yönlendiricinin tanımadığı bir satır testi düşürür.
 */

export const metadata: Metadata = {
  title: 'API dokümantasyonu',
  description:
    'GenesisAnime API: hesap ve senkron uçları, oynatıcı bildirimi, yönetici uçları, ' +
    'kimlik doğrulama, oran sınırları ve örnek istekler.',
  alternates: { canonical: '/api-dokumani/' },
};

const TABAN = (process.env.NEXT_PUBLIC_API || '').replace(/\/$/, '');
const WIKI = `${SITE.depo}/wiki`;

const GenelUclar = [
  ['GET /', '—', '{ok, ad, surum}', 'Sürüm bilgisi; ilk bağlantı sınaması için'],
  ['GET /saglik', '—', '{ok, zaman}', 'Worker ayakta mı? Sunucu saati ile'],
  [
    'POST /bildirim',
    '{url, anime?, bolum?, tur?}',
    '{ok} · 201',
    'IP başına 30/gün · aynı URL 24 saatte bir · host izin listesi (IP ve localhost reddedilir)',
  ],
] as const;

const HesapUclar = [
  ['POST /auth/kayit', '{eposta, parola}', '{jeton, yenileme, eposta} · 201', 'IP başına 20/saat · parola ≥ 10 karakter'],
  ['POST /auth/giris', '{eposta, parola}', 'aynı', 'Kullanıcı yoksa da özet hesaplanır (zamanlama sızıntısını engeller)'],
  ['POST /auth/yenile', '{yenileme}', 'yeni jeton çifti', 'Yenileme jetonu tek kullanımlık (rotasyon) · 90 gün'],
  ['POST /auth/cikis', '{yenileme}', '{ok}', 'Oturumu ve yenileme jetonunu siler'],
  ['GET /me/durum', '— (Bearer)', '{veri, surum}', 'Senkron blob’u okur'],
  ['PUT /me/durum', '{veri, surum}', '{surum} · 409 cakisma', 'İyimser kilit: sürüm uyuşmazsa çakışma döner · blob ≤ 512 KB'],
  ['GET /me/veri', '— (Bearer)', '{eposta, durum, indirme}', 'KVKK: verilerini indir'],
  ['DELETE /me', '— (Bearer)', '{silindi}', 'KVKK: hesabı, oturumları ve durum satırını siler'],
] as const;

const YoneticiUclar = [
  ['GET /bildirim?durum=&limit=', '— (ADMIN_TOKEN)', '{kayitlar}', 'Bildirim kuyruğu'],
  ['POST /bildirim/:id', '{durum}', '{ok}', 'durum: yeni · incelendi · gecersiz'],
  ['GET /tarama/ayar', '— (ADMIN_TOKEN)', '{ayar}', 'Link tarama döngüsü politikası'],
  ['PUT /tarama/ayar', '{aktif, dilim, saat, yayinla, push, hemen}', '{ayar}', 'dilim 25…20.000 · saat 0–23'],
  [
    'GET /tarama/durum',
    '— (ADMIN_TOKEN)',
    '{ayar, kosular, kalpler, sunucu_zaman}',
    'Panelin tek isteği: son 50 koşu + 5 kalp atışı',
  ],
  ['POST /tarama/kosu', '{dilim, sure_sn, sonuc, kapsam, not_metni}', '{ok} · 201', 'Döngü her koşudan sonra yazar · 500 satırla sınırlı'],
  ['POST /tarama/kalp', '{makine, karar}', '{ok}', 'Makine uyanık sinyali (“panelde görünüyor ama iş durmuş” durumunu ayırt eder)'],
] as const;

const Hatalar = [
  ['400', 'govde-gecersiz · url-gecersiz · eposta-gecersiz · parola-gecersiz · veri-gecersiz · durum-gecersiz', 'Gövde şeması doğrulanamadı'],
  ['401', 'yetkisiz', 'Bearer jetonu yok, süresi geçmiş ya da yönetici jetonu hatalı'],
  ['404', 'yol-yok', 'Bilinmeyen yol'],
  ['405', 'yontem-yok', 'Yol var ama bu HTTP yöntemi tanımlı değil'],
  ['409', 'cakisma', 'Senkron sürümü sunucudan eski (iyimser kilit)'],
  ['429', 'cok-fazla-istek', 'Oran sınırı aşıldı — başlıkta kalan süre yok, isteği geciktir'],
  ['500', 'sunucu-hatasi', 'Beklenmeyen hata (ayrıntı istemciye verilmez, log’a düşer)'],
] as const;

function UcTablosu({ satirlar }: { satirlar: readonly (readonly [string, string, string, string])[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tablo">
        <thead>
          <tr>
            <th>Yöntem · yol</th>
            <th>Gövde</th>
            <th>Yanıt</th>
            <th>Not</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map(([yol, govde, yanit, not]) => (
            <tr key={yol}>
              <td>
                <code>{yol}</code>
              </td>
              <td style={{ color: 'var(--tx2)' }}>
                <code>{govde}</code>
              </td>
              <td style={{ color: 'var(--tx2)' }}>
                <code>{yanit}</code>
              </td>
              <td style={{ color: 'var(--tx2)' }}>{not}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ornek({ baslik, kod }: { baslik: string; kod: string }) {
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ color: 'var(--tx3)', fontSize: 12.5, marginBottom: 6 }}>{baslik}</p>
      <pre
        style={{
          background: 'var(--card)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--rad)',
          padding: '14px 16px',
          overflowX: 'auto',
          fontSize: 12.5,
          lineHeight: 1.75,
          margin: 0,
        }}
      >
        <code>{kod}</code>
      </pre>
    </div>
  );
}

export default function ApiDokumaniSayfasi() {
  const adres = TABAN || 'https://genesisanime-api.genesisanime.workers.dev';

  return (
    <div className="kap">
      <div className="sayfa-basi">
        <h1>API dokümantasyonu</h1>
        <p>
          Site tamamen statiktir; hesaplar, izleme listesi senkronu, “kaynak çalışmıyor” bildirimleri
          ve link tarama paneli bu ayrı servis üzerinden yürür. Servis Cloudflare Workers üzerinde
          çalışır, veriyi D1 (SQLite) tutar ve <b>hiçbir npm bağımlılığı kullanmaz</b>; kaynak kodu{' '}
          <a href={`${SITE.depo}/tree/main/api`} target="_blank" rel="noreferrer noopener">
            <code>api/</code>
          </a>{' '}
          dizinindedir.
        </p>
      </div>

      <div className="istatistik-izgara">
        <div className="istatistik">
          <b style={{ fontSize: 15, lineHeight: 1.5, background: 'none', WebkitTextFillColor: 'var(--tx)', color: 'var(--tx)' }}>
            <code>{adres}</code>
          </b>
          <span>canlı adres (derleme anında <code>NEXT_PUBLIC_API</code> ile gömülür)</span>
        </div>
        <div className="istatistik">
          <b>Bearer</b>
          <span>kullanıcı uçları erişim jetonu ister · yönetici uçları <code>ADMIN_TOKEN</code></span>
        </div>
        <div className="istatistik">
          <b>12 saat</b>
          <span>erişim jetonu ömrü · yenileme jetonu 90 gün ve tek kullanımlık</span>
        </div>
        <div className="istatistik">
          <b>30/gün</b>
          <span>IP başına bildirim sınırı · kayıt ve giriş 20/saat</span>
        </div>
      </div>

      <div className="uyari-kutu bilgi" style={{ marginTop: 18 }}>
        <span aria-hidden="true">🔒</span>
        <span>
          <b>CORS yalnızca site kaynağına açıktır.</b> Üretimde Worker yalnızca{' '}
          <code>{SITE.url.replace(/\/$/, '')}</code> kaynağından gelen tarayıcı isteklerine cevap
          verir; başka bir site bu API’yi ziyaretçinin tarayıcısından çağıramaz. Sunucudan sunucuya
          istekler CORS’a takılmaz. Yönetici uçları <b>jeton olmadan hiçbir şey döndürmez</b>.
        </span>
      </div>

      <section style={{ marginTop: 38 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Genel uçlar
        </h2>
        <UcTablosu satirlar={GenelUclar} />
        <p style={{ color: 'var(--tx2)', fontSize: 13.5, marginTop: 12, lineHeight: 1.75 }}>
          Bildirim <code>tur</code> değerleri: <code>calismiyor</code> · <code>eksik</code> ·{' '}
          <code>yanlis-bolum</code> · <code>donuk</code>. Aynı adres aynı IP’den 24 saat içinde
          tekrar gönderilirse yeni satır açılmaz, <code>{'{ok:true, tekrar:true}'}</code> döner —
          yani bildirimi tekrarlamak zararsızdır.
        </p>
      </section>

      <section style={{ marginTop: 38 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Hesap ve senkron
        </h2>
        <UcTablosu satirlar={HesapUclar} />
        <p style={{ color: 'var(--tx2)', fontSize: 13.5, marginTop: 12, lineHeight: 1.75 }}>
          Senkron yerel-önce çalışır: site önce cihazdaki listeyi gösterir, sunucuya erişilemezse
          kuyruk korunur ve bağlantı gelince eşitlenir. Çakışmada (
          <code>409 cakisma</code>) istemci sunucu sürümünü alıp birleştirir — “en yeni kazanır”,
          tercihlerde ise yerel kazanır.
        </p>
      </section>

      <section style={{ marginTop: 38 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Yönetici uçları
        </h2>
        <UcTablosu satirlar={YoneticiUclar} />
        <p style={{ color: 'var(--tx2)', fontSize: 13.5, marginTop: 12, lineHeight: 1.75 }}>
          Bu uçlar{' '}
          <Link href="/yonetim/">
            <code>/yonetim/</code>
          </Link>{' '}
          panelini ve gecelik link tarama döngüsünü besler. Panel sayfası arama motorlarına kapalıdır
          ve jetonu yalnızca tarayıcının yerel deposunda tutar.
        </p>
      </section>

      <section style={{ marginTop: 38 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Örnek istekler
        </h2>
        <Ornek
          baslik="Servis ayakta mı?"
          kod={`curl -s ${adres}/saglik
# → {"ok":true,"zaman":"2026-10-01T15:46:49.718Z"}`}
        />
        <Ornek
          baslik="Çalışmayan kaynak bildirimi"
          kod={`curl -s -X POST ${adres}/bildirim \\
  -H 'Content-Type: application/json' \\
  -d '{"url":"https://ornek.com/bolum/1","anime":"naruto","bolum":"1","tur":"calismiyor"}'
# → {"ok":true}   (aynı URL 24 saat içinde tekrar gönderilirse {"ok":true,"tekrar":true})`}
        />
        <Ornek
          baslik="Kayıt ve giriş"
          kod={`curl -s -X POST ${adres}/auth/kayit \\
  -H 'Content-Type: application/json' \\
  -d '{"eposta":"ornek@ornek.com","parola":"en-az-on-karakter"}'
# → {"ok":true,"jeton":"…","yenileme":"…","eposta":"ornek@ornek.com"}`}
        />
        <Ornek
          baslik="Senkron durumunu oku ve yaz (Bearer)"
          kod={`TOKEN='<erişim jetonu>'
curl -s ${adres}/me/durum -H "Authorization: Bearer $TOKEN"
curl -s -X PUT ${adres}/me/durum -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"veri":{"izlenen":{},"tercihler":{}},"surum":3}'
# → {"ok":true,"surum":4}`}
        />
        <Ornek
          baslik="Yönetici: tarama durumu (ADMIN_TOKEN)"
          kod={`curl -s ${adres}/tarama/durum -H "Authorization: Bearer <ADMIN_TOKEN>"`}
        />
      </section>

      <section style={{ marginTop: 38 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Durum kodları
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="tablo">
            <thead>
              <tr>
                <th>Kod</th>
                <th>hata değeri</th>
                <th>Ne demek?</th>
              </tr>
            </thead>
            <tbody>
              {Hatalar.map(([kod, deger, aciklama]) => (
                <tr key={kod}>
                  <td>
                    <code>{kod}</code>
                  </td>
                  <td style={{ color: 'var(--tx2)' }}>
                    <code>{deger}</code>
                  </td>
                  <td style={{ color: 'var(--tx2)' }}>{aciklama}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 38 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Gizlilik
        </h2>
        <div style={{ color: 'var(--tx2)', fontSize: 13.5, lineHeight: 1.85, maxWidth: '78ch' }}>
          <p>
            <b>IP adresi saklanmaz.</b> Oran sınırı ve tekilleştirme için yalnızca sunucu tarafındaki
            bir tuzla üretilen SHA-256 özeti (<code>ip_hash</code>) kullanılır. Parola ve jetonlar da
            yalnızca özetlenmiş hâlde durur; parola için PBKDF2-HMAC-SHA256 kullanılır (platform
            tavanı olan 100.000 iterasyon — bu sınır ilk gerçek dağıtımda 500 hatasıyla öğrenildi ve
            belgelendi).
          </p>
          <p style={{ marginTop: 12 }}>
            İzleme listen kendi hesabında tutulur; <code>GET /me/veri</code> ile tamamını indirebilir,{' '}
            <code>DELETE /me</code> ile hesabını tüm satırlarıyla silebilirsin. Site hesap açmadan da
            tamamen çalışır — hesap yalnızca cihazlar arası eşitleme içindir.
          </p>
        </div>
      </section>

      <section style={{ marginTop: 38 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Belgeler ve kaynak
        </h2>
        <div className="etiketler">
          <a className="etiket" href={WIKI} target="_blank" rel="noreferrer noopener">
            GitHub Wiki
          </a>
          <a className="etiket" href={`${SITE.depo}/tree/main/api`} target="_blank" rel="noreferrer noopener">
            api/ kaynak kodu
          </a>
          <a className="etiket" href={`${SITE.depo}/blob/main/api/README.md`} target="_blank" rel="noreferrer noopener">
            Kurulum (api/README.md)
          </a>
          <a className="etiket" href={`${SITE.depo}/blob/main/docs/11-hesaplar-uygulama.md`} target="_blank" rel="noreferrer noopener">
            docs/11 — hesaplar ve uygulama
          </a>
        </div>
        <p style={{ color: 'var(--tx3)', fontSize: 12.5, marginTop: 16, lineHeight: 1.7 }}>
          Bu sayfa elle yazılmıştır; uç listesinin koddan kopmadığı otomatik testle garanti edilir
          (<code>tools/testler/api-dokumani.test.mjs</code> belgeyi yönlendiriciyle karşılaştırır).
        </p>
      </section>

      <div style={{ marginTop: 38, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link className="dugme dugme-birincil" href="/hesap/">
          Hesabım
        </Link>
        <Link className="dugme dugme-ikincil" href="/kunye/">
          Künye ve veri kalitesi
        </Link>
      </div>
    </div>
  );
}
