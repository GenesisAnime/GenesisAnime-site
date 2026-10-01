import Link from 'next/link';
import { SITE } from '@/lib/site';
import type { Kunye } from '@/lib/tipler';
import { sayiBicim } from '@/lib/bicim';

export default function AltBilgi({ kunye }: { kunye: Kunye }) {
  return (
    <footer className="alt">
      <div className="kap">
        <div className="alt-izgara">
          <div>
            <div className="logo" style={{ marginBottom: 12 }}>
              <span className="logo-isaret" aria-hidden="true">
                G
              </span>
              <span className="logo-metin">{SITE.ad}</span>
            </div>
            <p style={{ color: 'var(--tx2)', fontSize: 13.5, maxWidth: '46ch', lineHeight: 1.7 }}>
              {SITE.slogan} Arşivde <b>{sayiBicim(kunye.anime)}</b> anime,{' '}
              <b>{sayiBicim(kunye.bolum)}</b> bölüm ve <b>{sayiBicim(kunye.kaynak)}</b> oynatılabilir
              kaynak listeleniyor.
            </p>
          </div>

          <div>
            <h4>Gezinme</h4>
            <Link href="/">Ana Sayfa</Link>
            <Link href="/kesfet/">Keşfet</Link>
            <Link href="/ara/">Arama</Link>
            <Link href="/listem/">İzleme Listem</Link>
          </div>

          <div>
            <h4>Arşiv</h4>
            <Link href="/fansublar/">Fansub grupları</Link>
            <Link href="/kunye/">Künye ve veri kalitesi</Link>
            <Link href="/kesfet/?sirala=bolum">En uzun seriler</Link>
            <Link href="/kesfet/?format=MOVIE">Filmler</Link>
          </div>

          <div>
            <h4>Bilgi</h4>
            <a href={SITE.depo} target="_blank" rel="noreferrer noopener">
              Kaynak kodu
            </a>
            <a href={SITE.iletisim} target="_blank" rel="noreferrer noopener">
              İletişim
            </a>
            <Link href="/kunye/#yasal">Yasal uyarı</Link>
            <Link href="/kunye/#kaynak-politikasi">Kaynak politikası</Link>
          </div>
        </div>

        <div className="alt-yasal">
          <p>
            <b>Yasal uyarı.</b> {SITE.ad} hiçbir video barındırmaz, yüklemez ve aktarmaz. Sitede
            yalnızca üçüncü taraf video platformlarında <i>o sırada kamuya açık</i> olan gömülü
            sayfalara bağlantı verilir; oynatma tamamen ilgili platform üzerinde gerçekleşir. Tüm
            içerik hakları ilgili hak sahiplerine aittir. Hak sahibi bir talep ilettiğinde ilgili
            bağlantılar derhal kaldırılır. Arşiv verisi kültürel arşivleme amacıyla, açık kaynaklı
            topluluk çalışmasıyla derlenmiştir.
          </p>
          <p style={{ marginTop: 10 }}>
            Kaynakların yalnızca küçük bir bölümü otomatik olarak doğrulanmıştır; sayfada
            doğrulanmamış kaynaklar da listelenir. Çalışmayan bir kaynağa denk geldiğinde oynatıcı
            sayfasındaki <b>“Kaynak çalışmıyor”</b> düğmesini kullanabilirsin.
          </p>
          <p style={{ marginTop: 14, fontSize: 12, color: 'var(--tx3)' }}>
            Veri derlemesi: {new Date(kunye.uretim).toLocaleDateString('tr-TR', { dateStyle: 'long' })}
          </p>
        </div>
      </div>
    </footer>
  );
}
