import type { Metadata } from 'next';
import ListemIstemci from '@/components/ListemIstemci';

export const metadata: Metadata = {
  title: 'İzleme listem',
  description: 'Kaydettiğin animeler, izlemeye devam et ve izlenen bölümler — hesap gerekmez.',
  robots: { index: false, follow: true },
};

export default function ListemSayfasi() {
  return <ListemIstemci />;
}
