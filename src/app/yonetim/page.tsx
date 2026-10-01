import type { Metadata } from 'next';
import YonetimIstemci from '@/components/YonetimIstemci';

/**
 * /yonetim/ — yönetici paneli (link tarama döngüsü)
 *
 * Kasıtlı olarak gezinmeye bağlanmaz ve `noindex`tir: jeton olmadan hiçbir veri
 * görünmez, ama sayfanın varlığını aramaya duyurmak gereksiz. Adresi bilen yönetici
 * jetonunu girer; panel ayarları ve koşu geçmişini API'den okur.
 */
export const metadata: Metadata = {
  title: 'Yönetim paneli',
  description: 'Link tarama döngüsünün ayarları ve koşu geçmişi (yönetici).',
  robots: { index: false, follow: false },
};

export default function YonetimSayfasi() {
  return <YonetimIstemci />;
}
