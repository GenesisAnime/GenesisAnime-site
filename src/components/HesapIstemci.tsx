'use client';
/**
 * HesapIstemci.tsx — hesap, senkron ve KVKK sayfası
 *
 * Üç durum gösterir:
 *   1. API yapılandırılmamış  → site tamamen cihazda çalışır (bugünkü durum)
 *   2. API var, oturum yok    → giriş / kayıt formu
 *   3. Oturum açık            → profil, senkron durumu, veri indirme, hesap silme
 *
 * Hiçbir durumda çevrimdışı özellik kaybolmaz: yerel depo her zaman çalışır.
 */
import Link from 'next/link';
import { useState } from 'react';
import {
  apiAcik,
  cikisYap,
  girisYap,
  hesapSil,
  indirmePaketi,
  kayitOl,
  senkronBaslat,
  veriPaketi,
} from '@/lib/depo/api';
import { useCalismayanlar, useIlerlemeListesi, useListe, useOturum, useSenkronDurumu } from '@/lib/depo/kanca';
import { durumTemizle } from '@/lib/depo/yerel';

const HATA_METNI: Record<string, string> = {
  'eposta-gecersiz': 'Geçerli bir e-posta adresi gir.',
  'parola-gecersiz': 'Parola en az 10 karakter olmalı.',
  'eposta-parola': 'E-posta veya parola hatalı.',
  'eposta-kayitli': 'Bu e-posta ile bir hesap zaten var; giriş yapmayı dene.',
  'cok-fazla-istek': 'Çok fazla deneme yapıldı; biraz sonra yeniden dene.',
  'ag-hatasi': 'Sunucuya ulaşılamadı. Site çevrimdışı da çalışır; biraz sonra yeniden dene.',
  'api-kapali': 'Hesap servisi bu kurulumda tanımlı değil.',
  'oturum-yok': 'Oturum bulunamadı; yeniden giriş yap.',
};

const hataMetni = (kod?: string): string => (kod ? HATA_METNI[kod] || `Beklenmeyen hata: ${kod}` : 'Beklenmeyen hata.');

function indir(paket: Record<string, unknown>): void {
  const { ad, metin } = indirmePaketi(paket);
  const url = URL.createObjectURL(new Blob([metin], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = ad;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function HesapIstemci() {
  const oturum = useOturum();
  const senkron = useSenkronDurumu();
  const liste = useListe();
  const ilerleme = useIlerlemeListesi();
  const calismayan = useCalismayanlar();

  const [kip, setKip] = useState<'giris' | 'kayit'>('giris');
  const [eposta, setEposta] = useState('');
  const [parola, setParola] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [silmeOnayi, setSilmeOnayi] = useState(false);
  const [temizleOnayi, setTemizleOnayi] = useState(false);

  const gonder = async (olay: React.FormEvent) => {
    olay.preventDefault();
    setHata(null);
    setBilgi(null);
    setMesgul(true);
    const sonuc = kip === 'kayit' ? await kayitOl(eposta, parola) : await girisYap(eposta, parola);
    setMesgul(false);
    if (!sonuc.ok) {
      setHata(hataMetni(sonuc.hata));
      return;
    }
    setParola('');
    setBilgi('Giriş yapıldı; verilerin birazdan eşitlenecek.');
    void senkronBaslat();
  };

  const veriyiIndir = async () => {
    setHata(null);
    setMesgul(true);
    const paket = await veriPaketi();
    setMesgul(false);
    indir(paket);
    setBilgi('Veri dosyası indirildi.');
  };

  const yereliTemizle = () => {
    if (!temizleOnayi) {
      setTemizleOnayi(true);
      return;
    }
    durumTemizle();
    setTemizleOnayi(false);
    setBilgi('Bu cihazdaki veriler silindi.');
  };

  const hesabiSil = async () => {
    if (!silmeOnayi) {
      setSilmeOnayi(true);
      return;
    }
    setHata(null);
    setMesgul(true);
    const sonuc = await hesapSil();
    setMesgul(false);
    setSilmeOnayi(false);
    if (!sonuc.ok) {
      setHata(hataMetni(sonuc.hata));
      return;
    }
    setBilgi('Hesabın ve sunucudaki eşitlenmiş veriler silindi; bu cihazdaki veriler de temizlendi.');
  };

  const durumEtiketi =
    senkron.durum === 'aktif'
      ? 'Eşitlendi'
      : senkron.durum === 'hata'
        ? 'Eşitleme hatası'
        : senkron.durum === 'kapali'
          ? 'Hesap servisi kapalı'
          : 'Eşitleme bekliyor';

  return (
    <div className="kap" style={{ paddingTop: 26, paddingBottom: 40 }}>
      <div className="sayfa-basi">
        <h1>Hesap ve eşitleme</h1>
        <p>
          Site hesap açmadan tam çalışır: izleme listesi, ilerleme ve tercihler yalnızca bu cihazda
          tutulur. Hesap açarsan aynı veriler cihazlar arasında eşitlenir; senkron çakışmalarında
          “en yeni kazanır” kuralı uygulanır. Eşitleme iki yönlüdür ve çevrimdışıyken de çalışır.
        </p>
      </div>

      <div className="hesap-izgara">
        <section className="hesap-kutu">
          {!apiAcik() ? (
            <>
              <h2>Hesaplar bu kurulumda kapalı</h2>
              <p>
                Bu sürüm hesap servisi olmadan derlendi (NEXT_PUBLIC_API tanımlı değil), bu yüzden
                giriş/kayıt formu gösterilmiyor. Site tamamen cihazında çalışır; açık bir hesap da
                zaten yok. Aşağıdan verilerini indirebilir, tarayıcıdaki kopyayı temizleyebilirsin.
              </p>
              <p className="hesap-diger">
                Eşitleme açıldığında bu sayfa giriş/kayıt formuna ve senkron durumuna dönüşür
                (bkz. docs/11-hesaplar-uygulama.md).
              </p>
            </>
          ) : oturum ? (
            <>
              <h2>Profil</h2>
              <p className="hesap-eposta">{oturum.eposta}</p>
              <p className="hesap-durum">
                <span className={`hesap-nokta ${senkron.durum}`} aria-hidden="true" />
                {durumEtiketi}
                {senkron.sonZaman ? ` · son eşitleme ${new Date(senkron.sonZaman).toLocaleTimeString('tr-TR')}` : ''}
              </p>
              {senkron.durum === 'hata' && senkron.hata ? (
                <div className="uyari-kutu uyari">
                  <span aria-hidden="true">⚠️</span>
                  <span>{hataMetni(senkron.hata)} Yerel veriler etkilenmedi.</span>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="dugme dugme-birincil"
                  disabled={mesgul}
                  onClick={() => {
                    setMesgul(true);
                    void senkronBaslat().then((ok) => {
                      setMesgul(false);
                      setBilgi(ok ? 'Eşitleme tamam.' : 'Eşitleme şu an yapılamadı; veriler bu cihazda güvende.');
                    });
                  }}
                >
                  Şimdi eşitle
                </button>
                <button
                  className="dugme dugme-sade"
                  disabled={mesgul}
                  onClick={() => void cikisYap().then(() => setBilgi('Çıkış yapıldı. Yerel veriler bu cihazda kaldı.'))}
                >
                  Çıkış yap
                </button>
              </div>
              <p className="hesap-diger">
                Çıkış yapmak yerel verileri silmez; yalnızca senkron durur.
              </p>
            </>
          ) : (
            <>
              <h2>{kip === 'giris' ? 'Giriş yap' : 'Hesap oluştur'}</h2>
              <p>
                {kip === 'giris'
                  ? 'E-posta ve parolanla giriş yap; bu cihazdaki veriler sunucuya eşitlenir.'
                  : 'Yeni hesap oluştur. Parola yalnızca özetlenmiş hâlde (PBKDF2) saklanır.'}
              </p>
              <form onSubmit={gonder} style={{ display: 'grid', gap: 12 }}>
                <div className="alan">
                  <label htmlFor="eposta">E-posta</label>
                  <input
                    id="eposta"
                    type="email"
                    autoComplete="email"
                    required
                    value={eposta}
                    onChange={(e) => setEposta(e.target.value)}
                  />
                </div>
                <div className="alan">
                  <label htmlFor="parola">Parola</label>
                  <input
                    id="parola"
                    type="password"
                    autoComplete={kip === 'kayit' ? 'new-password' : 'current-password'}
                    required
                    minLength={10}
                    value={parola}
                    onChange={(e) => setParola(e.target.value)}
                  />
                  <span className="hesap-diger">En az 10 karakter.</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="dugme dugme-birincil" type="submit" disabled={mesgul}>
                    {mesgul ? 'Bekle…' : kip === 'kayit' ? 'Hesap oluştur' : 'Giriş yap'}
                  </button>
                  <button
                    className="dugme dugme-sade"
                    type="button"
                    onClick={() => {
                      setKip(kip === 'giris' ? 'kayit' : 'giris');
                      setHata(null);
                    }}
                  >
                    {kip === 'giris' ? 'Hesabım yok' : 'Hesabım var'}
                  </button>
                </div>
              </form>
            </>
          )}

          {hata ? (
            <div className="uyari-kutu hata">
              <span aria-hidden="true">⚠️</span>
              <span>{hata}</span>
            </div>
          ) : null}
          {bilgi ? (
            <div className="uyari-kutu bilgi">
              <span aria-hidden="true">ℹ️</span>
              <span>{bilgi}</span>
            </div>
          ) : null}
          {apiAcik() && !oturum ? (
            <p className="hesap-diger">
              Parolan yalnızca özetlenmiş (PBKDF2-HMAC-SHA256) hâlde tutulur; senkron uçları yalnızca
              sitenin kendi kaynağına (CORS) açıktır ve IP adresin saklanmaz.
            </p>
          ) : null}
        </section>

        <section className="hesap-kutu">
          <h2>Bu cihazdaki veriler</h2>
          <p>
            {liste.length.toLocaleString('tr-TR')} listede · {ilerleme.length.toLocaleString('tr-TR')} izlemeye devam ·{' '}
            {calismayan.length.toLocaleString('tr-TR')} “çalışmıyor” işareti
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="dugme dugme-ikincil" disabled={mesgul} onClick={() => void veriyiIndir()}>
              Verilerimi indir (JSON)
            </button>
            <Link className="dugme dugme-sade" href="/listem/">
              İzleme listeme git
            </Link>
          </div>

          <h2 style={{ marginTop: 6 }}>KVKK</h2>
          <p>
            Verilerini dilediğin zaman indirebilirsin. Hesap açtıysan hesabın ve sunucudaki
            eşitlenmiş kopyan <b>geri döndürülemez biçimde</b> silinir; bu cihazdaki veriler de
            temizlenir. Sunucuda IP adresi tutulmaz; bildirimlerde yalnızca tuzlu özet kullanılır.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {oturum ? (
              <button className="dugme dugme-sade" disabled={mesgul} onClick={() => void hesabiSil()}>
                {silmeOnayi ? 'Emin misin? Silmek için yeniden bas' : 'Hesabımı ve sunucu kopyasını sil'}
              </button>
            ) : (
              <button className="dugme dugme-sade" onClick={yereliTemizle}>
                {temizleOnayi ? 'Emin misin? Silmek için yeniden bas' : 'Bu cihazdaki verileri temizle'}
              </button>
            )}
            {silmeOnayi || temizleOnayi ? (
              <button
                className="dugme dugme-sade"
                onClick={() => {
                  setSilmeOnayi(false);
                  setTemizleOnayi(false);
                }}
              >
                Vazgeç
              </button>
            ) : null}
          </div>
          <p className="hesap-diger">
            {oturum
              ? 'Hesap silme sunucudaki kopyayı ve bu cihazdaki verileri birlikte temizler.'
              : 'Hesap açık değil; silinecek bir sunucu kopyası yok. Bu düğme yalnızca tarayıcıdaki verileri siler.'}
          </p>
        </section>
      </div>
    </div>
  );
}
