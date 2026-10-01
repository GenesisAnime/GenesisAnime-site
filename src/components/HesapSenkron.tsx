'use client';
/**
 * HesapSenkron.tsx — senkron döngüsünü kök düzende çalıştırır
 *
 * Görünür çıktısı yoktur. API adresi tanımlıysa yerel değişiklikleri (izleme
 * listesi, ilerleme, tercihler) oturum açıkken gecikmeli olarak sunucuya iter;
 * sekme yeniden görünür olduğunda ve bağlantı geri geldiğinde bir kez dener.
 * Oturum yoksa hiçbir istek atılmaz.
 */
import { useEffect } from 'react';
import { apiAcik, senkronDongusu } from '@/lib/depo/api';

export default function HesapSenkron() {
  useEffect(() => {
    if (!apiAcik()) return;
    return senkronDongusu();
  }, []);
  return null;
}
