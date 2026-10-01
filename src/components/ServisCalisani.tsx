'use client';
/**
 * ServisCalisani.tsx — PWA servis çalışanını kaydeder
 *
 * Yalnızca üretim derlemesinde ve yerel olmayan adreslerde çalışır; böylece
 * geliştirme/önizleme sırasında önbellek eski çıktıyı göstermez.
 */
import { useEffect } from 'react';

export default function ServisCalisani() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const yerel = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    if (yerel) return;
    const taban = process.env.NEXT_PUBLIC_BASE_PATH || '';
    navigator.serviceWorker
      .register(`${taban}/sw.js`, { scope: `${taban}/` })
      .catch(() => {
        /* çevrimdışı iskelet kritik değil; sessizce yut */
      });
  }, []);
  return null;
}
