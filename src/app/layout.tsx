import type { Metadata, Viewport } from 'next';
import './globals.css';
import UstBar from '@/components/UstBar';
import AltBilgi from '@/components/AltBilgi';
import AltMenu from '@/components/AltMenu';
import ServisCalisani from '@/components/ServisCalisani';
import HesapSenkron from '@/components/HesapSenkron';
import { kunyeOku } from '@/lib/veri';
import { SITE } from '@/lib/site';

// GitHub Pages alt dizininde (BASE_PATH) ikon/kart yolları doğru olsun.
const TABAN = process.env.BASE_PATH || '';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.ad} — Türkçe anime izleme arşivi`,
    template: `%s · ${SITE.ad}`,
  },
  description: SITE.aciklama,
  applicationName: SITE.ad,
  keywords: ['anime izle', 'türkçe anime', 'anime arşivi', 'fansub', 'çevirmen', 'anime bölümleri'],
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: SITE.ad,
    title: `${SITE.ad} — Türkçe anime izleme arşivi`,
    description: SITE.aciklama,
    url: SITE.url,
    images: [
      {
        url: `${TABAN}/og.png`,
        width: 1200,
        height: 630,
        alt: `${SITE.ad} — ${SITE.slogan}`,
      },
    ],
  },
  twitter: { card: 'summary_large_image' },
  icons: {
    icon: [
      { url: `${TABAN}/favicon.svg`, type: 'image/svg+xml' },
      { url: `${TABAN}/ikon/ikon-192.png`, sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: `${TABAN}/ikon/apple-touch-icon.png`, sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: SITE.ad, statusBarStyle: 'black-translucent' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#08060d',
  width: 'device-width',
  initialScale: 1,
};

export default function KokDuzen({ children }: { children: React.ReactNode }) {
  const kunye = kunyeOku();
  return (
    <html lang="tr">
      <body>
        {/*
         * Erken hata kaydedici: uygulama betikleri yüklenmeden önce kurulur.
         * Yakalanan ilk istemci hatasını <html data-hata="..."> olarak yazar.
         * Statik yayında hata ayıklamayı mümkün kılar (devtools olmadan).
         */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){function k(m){try{document.documentElement.setAttribute('data-hata',String(m).slice(0,900));}catch(e){}}" +
              "window.addEventListener('error',function(e){k((e.error&&e.error.stack)||e.message||'bilinmeyen hata');});" +
              "window.addEventListener('unhandledrejection',function(e){k('Promise: '+((e.reason&&e.reason.stack)||String(e.reason)));});})();",
          }}
        />
        <a className="gizli-gorsel" href="#icerik">
          İçeriğe geç
        </a>
        <UstBar />
        <main id="icerik">{children}</main>
        <AltBilgi kunye={kunye} />
        <AltMenu />
        <ServisCalisani />
        <HesapSenkron />
      </body>
    </html>
  );
}
