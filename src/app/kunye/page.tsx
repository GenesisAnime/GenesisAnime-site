import Link from 'next/link';
import type { Metadata } from 'next';
import { kunyeOku, saglikOku, taksonomiOku } from '@/lib/veri';
import { damgaBicim, formatAd, playerAd, sayiBicim } from '@/lib/bicim';

export const metadata: Metadata = {
  title: 'Künye ve veri kalitesi',
  description:
    'Arşivin kapsamı, kaynak doğrulama yöntemi, player güvenilirlik ölçümleri ve yasal bilgilendirme.',
  alternates: { canonical: '/kunye/' },
};

export default function KunyeSayfasi() {
  const kunye = kunyeOku();
  const saglik = saglikOku();
  const taksonomi = taksonomiOku();

  return (
    <div className="kap">
      <div className="sayfa-basi">
        <h1>Künye ve veri kalitesi</h1>
        <p>
          Bu sayfa arşivin ne kadarını kapsadığını, kaynakların nasıl doğrulandığını ve hangi
          verilerin hangi kaynaktan geldiğini şeffaf şekilde gösterir.
        </p>
      </div>

      <div className="istatistik-izgara">
        <div className="istatistik">
          <b>{sayiBicim(kunye.anime)}</b>
          <span>anime kaydı</span>
        </div>
        <div className="istatistik">
          <b>{sayiBicim(kunye.bolum)}</b>
          <span>bölüm kaydı</span>
        </div>
        <div className="istatistik">
          <b>{sayiBicim(kunye.kaynak)}</b>
          <span>listelenen kaynak</span>
        </div>
        <div className="istatistik">
          <b>{sayiBicim(kunye.dogrulanmisKaynak)}</b>
          <span>doğrulanmış kaynak</span>
        </div>
        <div className="istatistik">
          <b>{sayiBicim(kunye.fansubGrubu)}</b>
          <span>fansub grubu</span>
        </div>
        <div className="istatistik">
          <b>{sayiBicim(kunye.seriGrubu)}</b>
          <span>seri (franchise) grubu</span>
        </div>
        <div className="istatistik">
          <b>{sayiBicim(kunye.zenginlestirilmisAnime)}</b>
          <span>AniList zenginleştirmesi</span>
        </div>
        <div className="istatistik">
          <b>{sayiBicim(kunye.iliskiKaydi)}</b>
          <span>ilişkili yapım bağlantısı</span>
        </div>
        <div className="istatistik">
          <b>{sayiBicim(kunye.yasalIzlemeBaglantisi)}</b>
          <span>yasal izleme bağlantısı</span>
        </div>
      </div>

      <section id="kaynak-politikasi" style={{ marginTop: 20 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Kaynak doğrulama politikası
        </h2>

        <div className="uyari-kutu uyari">
          <span aria-hidden="true">⚠️</span>
          <span>
            <b>Dürüst durum:</b> {sayiBicim(saglik.hamTekilUrl)} tekil kaynak adresinden{' '}
            {sayiBicim(saglik.kontrolEdilenUrl)} tanesi ({'%'}
            {saglik.kapsamYuzdesi.toString().replace('.', ',')}) otomatik olarak kontrol edildi. Bunların{' '}
            {sayiBicim(saglik.kullanilan.calisiyor + saglik.kullanilan.olu + saglik.kullanilan.engellendi)}{' '}
            tanesinde kesin karara varıldı ({'%'}
            {saglik.kesinKapsamYuzdesi.toString().replace('.', ',')});{' '}
            {sayiBicim(saglik.kullanilan.belirsiz)} kaynakta ise site bot koruması ya da kanıtsız yanıt
            nedeniyle <b>belirsiz</b> kalındı. Geri kalan kaynakların durumu <b>bilinmiyor</b>.
          </span>
        </div>

        <div className="istatistik-izgara" style={{ marginTop: 14 }}>
          <div className="istatistik">
            <b style={{ background: 'none', WebkitTextFillColor: 'var(--ok)', color: 'var(--ok)' }}>
              {sayiBicim(saglik.kullanilan.calisiyor)}
            </b>
            <span>kontrol edilip çalıştığı doğrulanan kaynak — oynatıcıda “doğrulanmış” rozeti alır</span>
          </div>
          <div className="istatistik">
            <b style={{ background: 'none', WebkitTextFillColor: 'var(--bad)', color: 'var(--bad)' }}>
              {sayiBicim(saglik.sitedeGizlenen.olu + saglik.sitedeGizlenen.engelli)}
            </b>
            <span>
              ölü veya engelli olduğu için sitede gizlenen kaynak ({sayiBicim(saglik.sitedeGizlenen.olu)}{' '}
              ölü + {sayiBicim(saglik.sitedeGizlenen.engelli)} engelli)
            </span>
          </div>
          <div className="istatistik">
            <b style={{ background: 'none', WebkitTextFillColor: 'var(--tx2)', color: 'var(--tx2)' }}>
              {sayiBicim(saglik.kullanilan.belirsiz)}
            </b>
            <span>
              karar verilemeyen kaynak — gizlenmez ama rozet de almaz (bot koruması, DDoS duvarı,
              kanıtsız yanıt)
            </span>
          </div>
        </div>

        <p style={{ color: 'var(--tx2)', fontSize: 13.5, marginTop: 16, lineHeight: 1.75 }}>
          Ölü olduğu bilinen kaynaklar sitede hiç gösterilmez. Doğrulanmamış kaynaklar gizlenmez;
          yalnızca rozetsiz görünür. Her bölümde birden fazla kaynak bulunduğu için kullanıcı
          çalışan bir kaynağa geçebilir. Oynatıcıdaki <b>“Kaynak çalışmıyor”</b> düğmesi, sorunlu
          kaynağı senin tarayıcında işaretler ve otomatik olarak bir sonraki kaynağa geçer.
        </p>

        <p style={{ color: 'var(--tx2)', fontSize: 13.5, marginTop: 12, lineHeight: 1.75 }}>
          <b>Tarama nasıl yapılıyor?</b> Kaynaklar <code>tools/link-tara.mjs</code> ile partiler
          hâlinde, eşzamanlı ve host başına nazik bir hızda yoklanır; her sonuç anında diske yazılır,
          yarıda kesilen bir tarama kaldığı yerden devam eder. Karar yalnızca somut kanıta dayanır:
          404/410 yanıtı ya da hostun kendi “dosya silindi” sayfası <b>ölü</b>, oynatıcı kaynağı{' '}
          <b>çalışıyor</b> sayılır. Oran sınırı (403/429), bot/DDoS koruması ve içeriği JavaScript ile
          üreten sayfalar <b>belirsiz</b> kalır — şüphede kalınan hiçbir kaynak gizlenmez. Kural
          değişiklikleri canlı URL'lerle sınanır (<code>npm run link:test</code>).
        </p>
      </section>

      <section style={{ marginTop: 46 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Player güvenilirliği
        </h2>
        <p style={{ color: 'var(--tx3)', fontSize: 13, marginBottom: 12 }}>
          Kesin karara varılan örneklemde her player için çalışma oranı (belirsiz ölçümler paydaya
          girmez). Oynatıcı, kaynakları bu orana göre sıralar; doğrulanmış kaynaklar her zaman öne
          alınır. Örneklemi küçük olan player'ların oranı temkinli okunmalıdır.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tablo">
            <thead>
              <tr>
                <th>Player</th>
                <th className="sayi">Toplam kaynak</th>
                <th className="sayi">Kesin karar</th>
                <th className="sayi">Çalışıyor</th>
                <th className="sayi">Ölü</th>
                <th className="sayi">Belirsiz</th>
                <th className="sayi">Güvenilirlik</th>
              </tr>
            </thead>
            <tbody>
              {taksonomi.playerlar.slice(0, 22).map((p) => (
                <tr key={p.ad}>
                  <td>{playerAd(p.ad)}</td>
                  <td className="sayi">{sayiBicim(p.link)}</td>
                  <td className="sayi">{sayiBicim(p.kontrol)}</td>
                  <td className="sayi">{sayiBicim(p.ok)}</td>
                  <td className="sayi">{sayiBicim(p.olu)}</td>
                  <td className="sayi">{sayiBicim(p.belirsiz ?? 0)}</td>
                  <td className="sayi">
                    {p.kontrol > 0 ? `%${Math.round(p.guvenilirlik * 100)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 46 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Kapsam ve eksikler
        </h2>
        <div className="etiketler">
          <span className="etiket">Anime: {sayiBicim(kunye.anime)}</span>
          <span className="etiket">Bölüm: {sayiBicim(kunye.bolum)}</span>
          <span className="etiket">Tür: {sayiBicim(kunye.tur)}</span>
          <span className="etiket">Player: {sayiBicim(kunye.player)}</span>
          <span className="etiket">4K banner: {sayiBicim(kunye.banner4k)}</span>
          <span className="etiket">TMDB (HD) banner: {sayiBicim(kunye.bannerTmdb)}</span>
          <span className="etiket">Bölüm kaydı olmayan yapım: {sayiBicim(kunye.bölümsüzAnime)}</span>
          <span className="etiket">Çalışan kaynağı kalmayan yapım: {sayiBicim(kunye.kaynaksizAnime)}</span>
        </div>
        <p style={{ color: 'var(--tx2)', fontSize: 13.5, marginTop: 16, lineHeight: 1.75 }}>
          Arşiv, kapanan bir siteden kurtarılan verilerden oluşur. Bu nedenle bazı yapımlarda bölüm
          eksikleri veya yalnızca birkaç kaynak bulunabilir. Veri güncellemeleri yeniden üretim
          hattıyla (<code>npm run veri</code>) yapılır; ölü kaynak bildirimleri biriktikçe
          yayınlanan veri de güncellenir.
        </p>
      </section>

      <section style={{ marginTop: 46 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Veri kaynakları
        </h2>
        <table className="tablo">
          <thead>
            <tr>
              <th>Veri</th>
              <th>Kaynak</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Anime adı, bölüm listesi, video bağlantıları</td>
              <td>Kurtarılan arşiv veritabanı (6.107 anime · 317.146 kayıt)</td>
            </tr>
            <tr>
              <td>Kapak, puan, yıl, özet, tür, ilişkili yapımlar, yasal bağlantılar</td>
              <td>AniList GraphQL API ({sayiBicim(kunye.zenginlestirilmisAnime)} yapım eşleştirildi)</td>
            </tr>
            <tr>
              <td>4K banner görselleri ({sayiBicim(kunye.banner4k)} yapım — geniş ekran hero ve afiş bantları)</td>
              <td>
                TMDB (The Movie Database) — görseller TMDB API'sinden alınır. Bu ürün TMDB API'sini
                kullanır ancak TMDB tarafından onaylanmamış veya sertifikalanmamıştır: “This product uses
                the TMDB API but is not endorsed or certified by TMDB.”
              </td>
            </tr>
            <tr>
              <td>Fansub grubu ve çevirmen/redaktör bilgisi</td>
              <td>Bölüm bazlı ekip kayıtları (112.541 satır)</td>
            </tr>
            <tr>
              <td>Kaynak çalışma durumu</td>
              <td>
                Otomatik link taraması ({sayiBicim(saglik.kontrolEdilenUrl)} adres ·{' '}
                {sayiBicim(saglik.kendiTaramaUrl)} tanesi <code>tools/link-tara.mjs</code> ile)
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="yasal" style={{ marginTop: 46 }}>
        <h2 className="satir-baslik" style={{ fontSize: 19, marginBottom: 14 }}>
          Yasal bilgilendirme
        </h2>
        <div style={{ color: 'var(--tx2)', fontSize: 13.5, lineHeight: 1.85, maxWidth: '78ch' }}>
          <p>
            <b>Bu site hiçbir video dosyası barındırmaz, yüklemez, kopyalamaz ve aktarmaz.</b>{' '}
            Oynatıcıda gösterilen içerik, üçüncü taraf video platformlarında (Sibnet, Mail.ru,
            VK, Uqload, Voe, Google Drive vb.) kamuya açık olarak yayınlanan gömülü sayfalardan
            oluşur. Oynatma tamamen ilgili platformun kendi altyapısında gerçekleşir.
          </p>
          <p style={{ marginTop: 12 }}>
            Arşiv verisi, kültürel arşivleme amacıyla topluluk çalışmasıyla derlenmiştir; veri
            içeriğine ilişkin haklar ilgili hak sahiplerine aittir. Hak sahibi bir kişi veya kurum
            talepte bulunduğunda ilgili bağlantılar derhal kaldırılır.
          </p>
          <p style={{ marginTop: 12 }}>
            Yasal olarak izlenebilen yapımlar için her anime sayfasında{' '}
            <b>“Yasal izleme”</b> başlığı altında resmî platform bağlantıları listelenir. Bu
            kanalları tercih etmeniz arşivin sürdürülebilirliği açısından önemlidir.
          </p>
        </div>
      </section>

      <div style={{ marginTop: 40, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link className="dugme dugme-birincil" href="/kesfet/">
          Kataloğa göz at
        </Link>
        <Link className="dugme dugme-ikincil" href="/fansublar/">
          Fansub grupları
        </Link>
      </div>

      <p style={{ color: 'var(--tx3)', fontSize: 12.5, marginTop: 30 }}>
        Veri üretim zamanı: {damgaBicim(kunye.uretim, true)} · Format çeşitleri:{' '}
        {taksonomi.formatlar.slice(0, 5).map((f) => `${formatAd(f.ad)} (${f.sayi})`).join(', ')}
      </p>
    </div>
  );
}
