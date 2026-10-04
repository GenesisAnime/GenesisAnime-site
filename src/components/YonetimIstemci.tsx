'use client';
/**
 * YonetimIstemci.tsx — yönetici paneli (link tarama döngüsü)
 * =========================================================
 * Neden sunucuda bir "cron" değil de yerel döngü + panel? Tarama ve site verisi
 * üretimi arşiv SQLite dosyasını gerektirir ve o dosya depoda yoktur (ADR-0004).
 * Bu yüzden iş, arşivin bulunduğu makinedeki `npm run dongu:gunluk` koşusunda
 * yapılır; **politika ve kayıt** burada, D1'de durur. Panelden değiştirdiğin ayar
 * (dilim, saat, açık/kapalı, push) yerel döngünün bir sonraki uyanışında okunur.
 *
 * Güvenlik: tüm uçlar ADMIN_TOKEN ister; jeton yalnızca tarayıcı deposunda tutulur
 * (`genesisanime:v1:yonetici`) ve istek başlığında gönderilir. Sayfa `noindex`tir.
 */
import { useCallback, useEffect, useState } from 'react';
import { sayiBicim } from '@/lib/bicim';

const TABAN = (process.env.NEXT_PUBLIC_API || '').replace(/\/$/, '');
const JETON_ANAHTARI = 'genesisanime:v1:yonetici';

interface TaramaAyar {
  aktif: number;
  dilim: number;
  saat: number;
  yayinla: number;
  push: number;
  hemen: number;
  guncelleme: string | null;
}

interface TaramaKosu {
  id: number;
  zaman: string;
  makine: string;
  dilim: number;
  sure_sn: number;
  sonuc: string;
  kapsam: string;
  not_metni: string;
}

interface Kalp {
  makine: string;
  zaman: string;
  surum: string;
  son_karar: string;
}

interface Durum {
  ayar: TaramaAyar;
  kosular: TaramaKosu[];
  kalpler: Kalp[];
  sunucu_zaman: string;
  kosu_siniri: number;
}

/* Site playerının çözümleme hataları (`GET /akis/hata`): host bazında toplam +
   son kayıtlar. Karar değil, ölçüm — hangi host gerçekten çözülemiyor? */
interface AkisHataHost {
  host: string;
  adet: number;
  son: string;
}

interface AkisHataKayit {
  url: string;
  host: string;
  anime: string | null;
  bolum: number | null;
  hata: string;
  zaman: string;
}

interface AkisHataDurum {
  gun: number;
  hostlar: AkisHataHost[];
  son: AkisHataKayit[];
}

/** Hata kodlarının insan dili karşılığı (api/src/yardimci.mjs · AKIS_HATA_TURLERI). */
const AKIS_HATA_ADI: Record<string, string> = {
  cozulemedi: 'akış bulunamadı',
  'tur-desteklenmiyor': 'MP4/WebM değil',
  'akis-durdu': 'oynatma başlamadı',
  'akis-erisilemedi': 'aktarım ucuna ulaşılamadı',
  'medya-desteklemiyor': 'tarayıcı çözemedi',
};

const SAATLER = Array.from({ length: 24 }, (_, i) => i);

/** Yerel saatle okunur damga (panel istemcide çalışır, saat dilimi kullanıcının). */
function zamanMetni(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function gecenSure(iso: string | null): string {
  if (!iso) return '—';
  const dk = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(dk)) return '—';
  if (dk < 1) return 'şimdi';
  if (dk < 60) return `${dk} dk önce`;
  const saat = Math.floor(dk / 60);
  if (saat < 24) return `${saat} saat önce`;
  return `${Math.floor(saat / 24)} gün önce`;
}

export default function YonetimIstemci() {
  const [jeton, setJeton] = useState('');
  const [bagli, setBagli] = useState(false);
  const [durum, setDurum] = useState<Durum | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [akisHata, setAkisHata] = useState<AkisHataDurum | null>(null);

  const cagri = useCallback(
    async (yol: string, yontem = 'GET', govde: unknown = null, kullanilanJeton?: string) => {
      const anahtar = kullanilanJeton || jeton;
      if (!TABAN) return { ok: false, hata: 'api-kapali' } as const;
      if (!anahtar) return { ok: false, hata: 'jeton-yok' } as const;
      try {
        const yanit = await fetch(`${TABAN}${yol}`, {
          method: yontem,
          headers: {
            Authorization: `Bearer ${anahtar}`,
            ...(govde ? { 'Content-Type': 'application/json' } : {}),
          },
          body: govde ? JSON.stringify(govde) : undefined,
        });
        const veri = await yanit.json().catch(() => null);
        if (!yanit.ok || !veri || veri.ok === false) {
          return { ok: false, hata: (veri && veri.hata) || String(yanit.status) } as const;
        }
        return { ok: true, veri } as const;
      } catch {
        return { ok: false, hata: 'ag-hatasi' } as const;
      }
    },
    [jeton]
  );

  const yenile = useCallback(
    async (kullanilanJeton?: string) => {
      setYukleniyor(true);
      const y = await cagri('/tarama/durum', 'GET', null, kullanilanJeton);
      setYukleniyor(false);
      if (!y.ok) {
        setBagli(false);
        setHata(y.hata === 'yetkisiz' ? 'Jeton geçersiz (üretimdeki ADMIN_TOKEN ile aynı olmalı).' : `Sunucuya ulaşılamadı: ${y.hata}`);
        return false;
      }
      setDurum(y.veri as unknown as Durum);
      /* Çözümleme hataları ikincil veri: alınamazsa panel yine bağlı kalır. */
      const h = await cagri('/akis/hata?gun=7&limit=40', 'GET', null, kullanilanJeton);
      setAkisHata(h.ok ? (h.veri as unknown as AkisHataDurum) : null);
      setBagli(true);
      setHata(null);
      return true;
    },
    [cagri]
  );

  // Kayıtlı jeton varsa açılışta otomatik bağlan.
  useEffect(() => {
    let iptal = false;
    const kayitli = window.localStorage.getItem(JETON_ANAHTARI) || '';
    if (kayitli && TABAN) {
      setJeton(kayitli);
      yenile(kayitli).then((tamam) => {
        if (!tamam && !iptal) window.localStorage.removeItem(JETON_ANAHTARI);
      });
    }
    return () => {
      iptal = true;
    };
  }, [yenile]);

  async function kaydet(degisiklik: Partial<TaramaAyar>) {
    setMesaj(null);
    const y = await cagri('/tarama/ayar', 'PUT', degisiklik);
    if (!y.ok) {
      setMesaj(`Kaydedilemedi: ${y.hata}`);
      return;
    }
    setMesaj(degisiklik.hemen === 1 ? 'Komut gönderildi: yerel döngü bir sonraki uyanışta hemen çalışacak.' : 'Ayar kaydedildi.');
    await yenile();
  }

  if (!TABAN) {
    return (
      <div className="kap">
        <div className="bos-durum">
          <div className="buyuk">🔧</div>
          <h3>Yönetim paneli kapalı</h3>
          <p>
            Bu derlemede <code>NEXT_PUBLIC_API</code> tanımlı değil. Panel yalnızca API adresi
            verilmiş derlemelerde çalışır.
          </p>
        </div>
      </div>
    );
  }

  if (!bagli) {
    return (
      <div className="kap" style={{ paddingTop: 26 }}>
        <div className="sayfa-basi">
          <h1>Yönetim paneli</h1>
          <p>Link tarama döngüsünün ayarları ve koşu geçmişi. Yönetici jetonu gerekir.</p>
        </div>

        {hata ? (
          <div className="uyari-kutu hata" style={{ marginBottom: 14 }}>
            <span aria-hidden="true">⛔</span>
            <span>{hata}</span>
          </div>
        ) : null}

        <div className="kaynak-panel" style={{ maxWidth: 520 }}>
          <h3>Yönetici jetonu</h3>
          <p className="ipucu">
            Worker'daki <code>ADMIN_TOKEN</code> (Cloudflare → Workers → genesisanime-api →
            Settings → Variables). Jeton yalnızca bu tarayıcıda saklanır.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="alan">
              <label htmlFor="jeton">Jeton</label>
              <input
                id="jeton"
                type="password"
                value={jeton}
                autoComplete="off"
                placeholder="ADMIN_TOKEN"
                onChange={(e) => setJeton(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && jeton) window.localStorage.setItem(JETON_ANAHTARI, jeton);
                }}
              />
            </div>
            <button
              className="dugme dugme-birincil"
              disabled={!jeton || yukleniyor}
              onClick={() => {
                window.localStorage.setItem(JETON_ANAHTARI, jeton);
                yenile(jeton);
              }}
            >
              {yukleniyor ? 'Bağlanıyor…' : 'Bağlan'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const a = durum!.ayar;
  const sonKalp = durum!.kalpler[0];
  const kalpEski = sonKalp ? Date.now() - new Date(sonKalp.zaman).getTime() > 2 * 3600 * 1000 : true;

  return (
    <div className="kap" style={{ paddingTop: 26 }}>
      <div className="sayfa-basi">
        <h1>Yönetim paneli</h1>
        <p>
          Yerel makinedeki <code>npm run dongu:gunluk</code> döngüsünün ayarları, koşu geçmişi ve
          günlük kapsam ölçümü. Sunucu zamanı: {zamanMetni(durum!.sunucu_zaman)}
        </p>
      </div>

      {mesaj ? (
        <div className="uyari-kutu bilgi" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">ℹ️</span>
          <span>{mesaj}</span>
        </div>
      ) : null}

      <div className={`uyari-kutu ${kalpEski ? 'uyari' : 'bilgi'}`} style={{ marginBottom: 16 }}>
        <span aria-hidden="true">{kalpEski ? '⚠️' : '🟢'}</span>
        <span>
          {sonKalp ? (
            <>
              Son kalp atışı <b>{sonKalp.makine}</b> · {gecenSure(sonKalp.zaman)} ({zamanMetni(sonKalp.zaman)}) ·
              karar: <b>{sonKalp.son_karar}</b>
              {kalpEski ? ' — 2 saatten eski: makine kapalı ya da zamanlayıcı kurulu değil.' : ''}
            </>
          ) : (
            'Hiç kalp atışı yok: yerel makinede zamanlayıcı henüz çalışmadı.'
          )}
        </span>
      </div>

      <div className="bilgi-izgara" style={{ marginBottom: 26 }}>
        <div className="kaynak-panel">
          <h3>Ayarlar</h3>
          <p className="ipucu">Değişiklikler yerel döngünün bir sonraki uyanışında (en çok 1 saat) etkili olur.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5 }}>
              <input type="checkbox" checked={a.aktif === 1} onChange={(e) => kaydet({ aktif: e.target.checked ? 1 : 0 })} />
              Döngü açık
            </label>

            <div className="alan">
              <label htmlFor="dilim">Gecelik dilim (URL sayısı)</label>
              <input
                id="dilim"
                type="number"
                min={25}
                max={20000}
                step={25}
                value={a.dilim}
                onChange={(e) => setDurum({ ...durum!, ayar: { ...a, dilim: Number(e.target.value) } })}
                onBlur={() => kaydet({ dilim: a.dilim })}
              />
              <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
                25–20.000 arası. Ölçülebilir havuzda ~1.500 URL ≈ 2-4 dakika.
              </span>
            </div>

            <div className="alan">
              <label htmlFor="saat">Günlük koşu saati</label>
              <select id="saat" value={a.saat} onChange={(e) => kaydet({ saat: Number(e.target.value) })}>
                {SAATLER.map((s) => (
                  <option key={s} value={s}>
                    {String(s).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
                Makine o saatte kapalıysa gün içinde açıldığında koşar (koşu kaçmaz).
              </span>
            </div>

            <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5 }}>
              <input type="checkbox" checked={a.yayinla === 1} onChange={(e) => kaydet({ yayinla: e.target.checked ? 1 : 0 })} />
              Değişiklikleri commit'le
            </label>

            <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5 }}>
              <input type="checkbox" checked={a.push === 1} onChange={(e) => kaydet({ push: e.target.checked ? 1 : 0 })} />
              Commit'ten sonra push'la (yayını tetikler)
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <button className="dugme dugme-birincil" onClick={() => kaydet({ hemen: 1 })}>
                Şimdi çalıştır
              </button>
              <button className="dugme dugme-sade" onClick={() => yenile()}>
                {yukleniyor ? 'Yenileniyor…' : 'Yenile'}
              </button>
              <button
                className="dugme dugme-sade"
                onClick={() => {
                  window.localStorage.removeItem(JETON_ANAHTARI);
                  setJeton('');
                  setBagli(false);
                  setDurum(null);
                }}
              >
                Çıkış
              </button>
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
              Son ayar güncellemesi: {zamanMetni(a.guncelleme)}
              {a.hemen === 1 ? ' · “şimdi çalıştır” bekliyor' : ''}
            </span>
          </div>
        </div>

        <div className="kaynak-panel">
          <h3>Özet</h3>
          <p className="ipucu">Sunucudaki son {sayiBicim(durum!.kosu_siniri)} koşu tutulur.</p>
          <table className="tablo" style={{ fontSize: 12.5 }}>
            <tbody>
              <tr>
                <td>Kayıtlı koşu</td>
                <td className="sayi">{sayiBicim(durum!.kosular.length)}</td>
              </tr>
              <tr>
                <td>Son koşu</td>
                <td className="sayi">{durum!.kosular[0] ? zamanMetni(durum!.kosular[0].zaman) : '—'}</td>
              </tr>
              <tr>
                <td>Son koşu sonucu</td>
                <td className="sayi">{durum!.kosular[0]?.sonuc ?? '—'}</td>
              </tr>
              <tr>
                <td>Kalp atan makine</td>
                <td className="sayi">{sonKalp?.makine ?? '—'}</td>
              </tr>
              <tr>
                <td>API sürümü</td>
                <td className="sayi">{sonKalp?.surum ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="kaynak-panel">
        <h3>Koşu geçmişi</h3>
        <p className="ipucu">Her satırı açıp o koşunun adım özetini ve kapsam dağılımını görebilirsin.</p>
        {durum!.kosular.length === 0 ? (
          <div className="uyari-kutu uyari">
            <span aria-hidden="true">⚠️</span>
            <span>Henüz koşu kaydı yok. Yerel makinede zamanlayıcıyı kurunca burası dolmaya başlar.</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tablo" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th>Makine</th>
                  <th className="sayi">Dilim</th>
                  <th className="sayi">Süre</th>
                  <th>Sonuç</th>
                  <th>Kapsam</th>
                </tr>
              </thead>
              <tbody>
                {durum!.kosular.map((k) => (
                  <tr key={k.id}>
                    <td>{zamanMetni(k.zaman)}</td>
                    <td>{k.makine}</td>
                    <td className="sayi">{sayiBicim(k.dilim)}</td>
                    <td className="sayi">{k.sure_sn} sn</td>
                    <td style={{ color: k.sonuc === 'ok' ? 'var(--ok)' : 'var(--bad)' }}>{k.sonuc}</td>
                    <td>
                      {k.not_metni ? (
                        <details>
                          <summary style={{ cursor: 'pointer' }}>{k.kapsam || 'ayrıntı'}</summary>
                          <pre
                            style={{
                              whiteSpace: 'pre-wrap',
                              fontSize: 11.5,
                              color: 'var(--tx2)',
                              marginTop: 6,
                              maxWidth: '56ch',
                            }}
                          >
                            {k.not_metni}
                          </pre>
                        </details>
                      ) : (
                        k.kapsam || '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
          Ayrıntılı günlük, koşunun yapıldığı makinede: <code>tools/rapor/gunluk-dongu.log</code> ve{' '}
          <code>tools/rapor/gunluk-dongu.jsonl</code>
        </p>
      </div>

      <div className="kaynak-panel">
        <h3>Sitenin playerı: çözülemeyen kaynaklar</h3>
        <p className="ipucu">
          Kullanıcıların site playerında açılmadığını bildirdiği kaynaklar, host bazında (son 7 gün).
          Günlük kota (429) ve köprü yokluğu buraya yazılmaz — onlar kaynağın kusuru değil.
        </p>
        {!akisHata || akisHata.hostlar.length === 0 ? (
          <div className="uyari-kutu bilgi">
            <span aria-hidden="true">ℹ️</span>
            <span>Son 7 günde çözümleme hatası bildirilmedi.</span>
          </div>
        ) : (
          <>
            <table className="tablo" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Host</th>
                  <th className="sayi">Kayıt</th>
                  <th>Son bildirim</th>
                </tr>
              </thead>
              <tbody>
                {akisHata.hostlar.map((h) => (
                  <tr key={h.host}>
                    <td>{h.host}</td>
                    <td className="sayi">{sayiBicim(h.adet)}</td>
                    <td>{gecenSure(h.son)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12.5 }}>
                Son bildirimler ({akisHata.son.length})
              </summary>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table className="tablo" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Zaman</th>
                      <th>Host</th>
                      <th>Anime · bölüm</th>
                      <th>Neden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {akisHata.son.map((k) => (
                      <tr key={`${k.url}|${k.hata}|${k.zaman}`}>
                        <td>{zamanMetni(k.zaman)}</td>
                        <td>{k.host}</td>
                        <td>{k.anime ? `${k.anime} · ${k.bolum ?? '?'}` : '—'}</td>
                        <td title={k.url}>{AKIS_HATA_ADI[k.hata] ?? k.hata}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
