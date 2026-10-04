/**
 * ana-sayfa.ts — ana sayfa satır yardımcıları (istemci + sunucu ortak)
 *
 * `satirHref` buraya taşındı: ana sayfanın satırları artık iki yerde
 * işleniyor — ilk satırlar sunucuda (HTML'e gömülür), kalanı istemcide
 * kademeli yüklenir (`TembelSatirlar`). Bağlantı eşlemesi tek kaynakta
 * durmazsa iki taraf zamanla ayrışır.
 */
import type { AnaSayfaSatiri } from './tipler';

/** Satır başlığına karşılık gelen /kesfet filtre bağlantısı. */
export function satirHref(s: Pick<AnaSayfaSatiri, 'baslik' | 'tur'>): string {
  if (s.tur) return `/kesfet/?tur=${encodeURIComponent(s.tur)}`;
  const harita: Record<string, string> = {
    'Şu An Popüler': '/kesfet/?sirala=populer',
    'Yeni Eklenenler': '/kesfet/?sirala=yeni',
    '2026 Sezonu': '/kesfet/?yil=2026',
    'Son 5 Yılın En İyileri': '/kesfet/?sirala=puan',
    'Uzun Soluklu Seriler': '/kesfet/?sirala=bolum',
    Filmler: '/kesfet/?format=MOVIE',
    'Klasikler (2010 ve Öncesi)': '/kesfet/?sirala=eski',
    'Kısa ve Tatlı (13 bölüm ve altı)': '/kesfet/?format=TV',
  };
  return harita[s.baslik] ?? '/kesfet/';
}
