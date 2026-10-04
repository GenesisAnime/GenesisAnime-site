'use client';
/**
 * ServisCalisani.tsx — PWA servis çalışanını kaydeder + sürüm çubuğunu gösterir
 *
 * Yalnızca üretim derlemesinde ve yerel olmayan adreslerde çalışır; böylece
 * geliştirme/önizleme sırasında önbellek eski çıktıyı göstermez.
 *
 * Sürüm çubuğu: `sw.js` yeni sürümü `skipWaiting()` ile devralınca açık sekme
 * eski parçalarla (chunk) çalışmaya devam eder. `controllerchange` bunun
 * işaretidir; sayfa **önceden de** kontrollüyse çubuk çıkar ve tek tıkla yeniler.
 * Karar `src/lib/surum.ts` içindedir (test edilebilir, metin oradan gelir).
 */
import { useEffect, useState } from 'react';
import { SURUM_CUBUGU_METNI, SURUM_KAPAT_ETIKETI, cubukGerekli } from '@/lib/surum';

/** Kayıtlı çalışanı düzenli yokla: yeni sürüm sessizce beklemesin. */
const YOKLAMA_MS = 30 * 60 * 1000;

export default function ServisCalisani() {
  const [yeniSurum, setYeniSurum] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const yerel = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    if (yerel) return;

    const taban = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const kontrollu = Boolean(navigator.serviceWorker.controller);
    const yeniGor = () => {
      if (cubukGerekli(kontrollu, true)) setYeniSurum(true);
    };

    let kayit: ServiceWorkerRegistration | null = null;
    let zamanlayici: number | null = null;
    let iptal = false;

    const durumDegisti = (calisan: ServiceWorker | null) => () => {
      /* Yeni çalışan `installed` olduysa ve sayfa zaten kontrollüyse çubuk. */
      if (calisan?.state === 'installed' && navigator.serviceWorker.controller) yeniGor();
    };

    navigator.serviceWorker
      .register(`${taban}/sw.js`, { scope: `${taban}/` })
      .then((k) => {
        if (iptal) return;
        kayit = k;
        k.addEventListener('updatefound', () => {
          k.installing?.addEventListener('statechange', durumDegisti(k.installing));
        });
        /* Sekme açıldıktan sonra yayınlanan sürüm de yakalanır. */
        zamanlayici = window.setInterval(
          () =>
            k.update().catch(() => {
              /* çevrimdışı: bir sonraki yoklamada yeniden denenir */
            }),
          YOKLAMA_MS
        );
      })
      .catch(() => {
        /* çevrimdışı iskelet kritik değil; sessizce yut */
      });

    /* skipWaiting + clients.claim: yeni çalışan sayfayı devraldı. */
    const devraldi = () => yeniGor();
    navigator.serviceWorker.addEventListener('controllerchange', devraldi);
    /* Sekmeye dönüşte bir kez yokla: uzun süre açık kalan sekme bayat kalmasın. */
    const gorunurluk = () => {
      if (document.visibilityState === 'visible') {
        kayit?.update().catch(() => {
          /* sessiz: yoklama başarısızlığı kullanıcıya bildirilmez */
        });
      }
    };
    document.addEventListener('visibilitychange', gorunurluk);

    return () => {
      iptal = true;
      if (zamanlayici !== null) window.clearInterval(zamanlayici);
      navigator.serviceWorker.removeEventListener('controllerchange', devraldi);
      document.removeEventListener('visibilitychange', gorunurluk);
    };
  }, []);

  if (!yeniSurum) return null;

  return (
    <div className="surum-cubugu" role="status" aria-live="polite">
      <button className="surum-cubugu-dugme" type="button" onClick={() => location.reload()}>
        {SURUM_CUBUGU_METNI}
      </button>
      <button
        className="surum-cubugu-kapat"
        type="button"
        aria-label={SURUM_KAPAT_ETIKETI}
        title={SURUM_KAPAT_ETIKETI}
        onClick={() => setYeniSurum(false)}
      >
        ×
      </button>
    </div>
  );
}
