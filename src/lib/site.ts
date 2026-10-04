/** site.ts — site kimliği, meta bilgileri ve dış bağlantılar */

export const SITE = {
  ad: 'GenesisAnime',
  kisaAd: 'Genesis',
  slogan: 'Anime arşivin, tek yerde.',
  aciklama:
    'Türkçe anime izleme arşivi: binlerce anime, bölüm bazlı fansub ve çevirmen bilgisi, ' +
    'kaynak çipleriyle hızlı oynatıcı, izleme listesi ve izlemeye devam et desteği.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://genesisanime.github.io/GenesisAnime-site',
  dil: 'tr',
  iletisim: 'https://github.com/tatsunalia',
  depo: 'https://github.com/GenesisAnime/GenesisAnime-site',
  wiki: 'https://github.com/GenesisAnime/GenesisAnime-site/wiki',
} as const;
