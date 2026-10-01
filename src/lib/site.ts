/** site.ts — site kimliği, meta bilgileri ve dış bağlantılar */

export const SITE = {
  ad: 'GenesisAnime',
  kisaAd: 'Genesis',
  slogan: 'Anime arşivin, tek yerde.',
  aciklama:
    'Türkçe anime izleme arşivi: binlerce anime, bölüm bazlı fansub ve çevirmen bilgisi, ' +
    'kaynak çipleriyle hızlı oynatıcı, izleme listesi ve izlemeye devam et desteği.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://nutaliaxd.github.io/GenesisAnime',
  dil: 'tr',
  iletisim: 'https://github.com/Nutaliaxd',
  depo: 'https://github.com/Nutaliaxd/GenesisAnime',
} as const;
