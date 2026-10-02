'use client';
/**
 * KopruPanel.tsx — köprü yeteneklerinin ölçüm durumu (/kunye sayfasında)
 *
 * Neden var: yetenekler artık koda gömülü bir tablodan değil, çalışma anında
 * toplanan kanıttan geliyor (`kopru.ts`). Ölçüm cihazda tutulduğu için
 * kullanıcının **kendi tarayıcısında** ne öğrenildiğini görebilmesi gerekir:
 * yoksa "hangi kaynak kontrol edilebiliyor" sorusunun cevabı görünmez bir
 * varsayıma dönüşür. Panel önsel ile ölçümü ayrı ayrı gösterir ve sıfırlama sunar.
 */
import { useEffect, useState } from 'react';
import { etkinKopru, type KopruAdi, type KopruOlcumu } from '@/lib/kopru';
import { kopruOlcumleriniSil, kopruOlcumleri } from '@/lib/depo/yerel';

const ADLAR: KopruAdi[] = ['vk', 'ok', 'mail'];

function tarih(zaman: number): string {
  if (!zaman) return '—';
  const gun = Math.floor((Date.now() - zaman) / 86400000);
  if (gun <= 0) return 'bugün';
  if (gun === 1) return 'dün';
  if (gun < 30) return `${gun} gün önce`;
  return `${Math.floor(gun / 30)} ay önce`;
}

export default function KopruPanel() {
  /* localStorage sunucuda yok: ilk render boş, ölçüm istemcide okunur. */
  const [olcumler, setOlcumler] = useState<Record<string, KopruOlcumu> | null>(null);

  useEffect(() => {
    setOlcumler(kopruOlcumleri());
  }, []);

  if (!olcumler) return null;

  const satirlar = ADLAR.map((ad) => {
    /* Saat açıkça verilir: `etkinKopru` ölçümün tazeliğini buna göre ölçer. */
    const etkin = etkinKopru(ad, olcumler[ad] ?? null, Date.now());
    const yetenekler = [
      etkin.hazirSinyali ? 'hazır sinyali' : null,
      etkin.telemetri ? 'gerçek konum/süre' : null,
      etkin.komut ? 'oynat/duraklat/sar' : null,
    ].filter(Boolean) as string[];
    return { ad, etkin, yetenekler };
  });

  const olcumVar = satirlar.some((s) => s.etkin.kaynak === 'olcum');

  return (
    <section style={{ marginTop: 46 }}>
      <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
        Oynatıcı köprüsü — bu cihazda ölçülen yetenekler
      </h2>
      <p style={{ color: 'var(--tx3)', fontSize: 13, marginBottom: 12 }}>
        Gömülü oynatıcıların hangi komutlara cevap verdiği koda gömülü bir tablodan değil, senin
        tarayıcında biriken kanıttan geliyor. Kaynak yanıt vermeye başlarsa site bunu kendiliğinden
        fark eder: bir kaynak konum bildiriyorsa, bulunduğu saniyeye görünmez bir “sar” isteği
        gönderilir; oynatıcı <code>seeked</code> ile cevap verirse kontrol düğmeleri açılır. Bu
        istek yalnızca aynı kaynak için haftada bir kez denenir ve ekranda hiçbir şey değiştirmez.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="tablo">
          <thead>
            <tr>
              <th>Kaynak</th>
              <th>Etkin yetenek</th>
              <th>Kaynak</th>
              <th>Gözlem</th>
              <th>Son görülme</th>
              <th>Son sınama</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map(({ ad, etkin, yetenekler }) => (
              <tr key={ad}>
                <td>{etkin.etiket}</td>
                <td>{yetenekler.length ? yetenekler.join(' · ') : 'yok (opak)'}</td>
                <td>{etkin.kaynak === 'olcum' ? 'ölçüldü' : 'önsel (02.10 ölçümü)'}</td>
                <td>{etkin.olcum ? `${etkin.olcum.gozlem} oturum` : '—'}</td>
                <td>{tarih(etkin.olcum?.sonGorulme ?? 0)}</td>
                <td>{etkin.olcum?.sonSina ? tarih(etkin.olcum.sonSina) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {olcumVar ? (
        <button
          className="dugme dugme-ikincil"
          style={{ marginTop: 14 }}
          onClick={() => {
            kopruOlcumleriniSil();
            setOlcumler({});
          }}
        >
          Ölçümleri sıfırla (önsele dön)
        </button>
      ) : (
        <p style={{ color: 'var(--tx3)', marginBottom: 0 }}>
          Bu cihazda henüz ölçüm birikmedi; tablo 02.10 ölçümünü (önsel) gösteriyor.
        </p>
      )}
    </section>
  );
}
