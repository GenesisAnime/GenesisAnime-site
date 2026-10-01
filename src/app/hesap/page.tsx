import type { Metadata } from 'next';
import HesapIstemci from '@/components/HesapIstemci';

export const metadata: Metadata = {
  title: 'Hesap ve eşitleme',
  description:
    'Hesap açmadan da çalışır: izleme listen cihazında. Hesap açarsan liste, ilerleme ve tercihler cihazlar arasında eşitlenir; verini indirebilir, hesabını silebilirsin (KVKK).',
  alternates: { canonical: '/hesap/' },
  robots: { index: false, follow: true },
};

export default function HesapSayfasi() {
  return <HesapIstemci />;
}
