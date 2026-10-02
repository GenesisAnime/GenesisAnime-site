/**
 * tipler.ts — veri hattının ürettiği JSON'ların tip sözleşmesi
 * (tools/export-data.mjs çıktılarıyla birebir eşleşir)
 */

/** Kaynak: [player, fansub|null, url, "ok"?] — "ok" yalnızca doğrulanmış çalışan kaynaklarda bulunur. */
export type Kaynak = [string, string | null, string] | [string, string | null, string, 'ok'];

export interface BolumEkibi {
  /** fansub grubu adı */
  g: string;
  /** çevirmen / redaktör / encode bilgisi (URL'ler temizlenmiş) */
  e: string | null;
}

export interface Bolum {
  /** 1 tabanlı sıra numarası — oynatıcı adresinde kullanılan kimlik */
  n: number;
  /** slug'dan çıkarılan gerçek numara ("12", "12.5") veya null (special/movie) */
  no: string | null;
  /** bölüm adı (anime adı çıkarılmış) */
  ad: string;
  slug: string;
  /** kaynak sayısı */
  ks: number;
  ekip: BolumEkibi[];
  src: Kaynak[];
}

export interface Iliski {
  /** SEQUEL | PREQUEL | SIDE_STORY | SPIN_OFF | ALTERNATIVE | PARENT | SUMMARY | OTHER */
  t: string | null;
  /** arşivde karşılığı varsa slug */
  s: string | null;
  ad: string;
  p: string | null;
  f: string | null;
}

export interface YasalBaglanti {
  a: string;
  u: string;
}

export interface Fragman {
  site: string;
  id: string;
}

export interface Anime {
  slug: string;
  /** Bu kaydın zenginleştirildiği AniList kimliği (yoksa null) */
  anilist: number | null;
  ad: string;
  adEn: string | null;
  yil: number | null;
  puan: number | null;
  format: string | null;
  durum: string | null;
  sezon: string | null;
  sure: number | null;
  poster: string | null;
  banner: string | null;
  /** TMDB backdrop'u (≥3000 px) — hero/bant için gerçek 4K kaynak; yoksa null */
  banner4k: string | null;
  /** `banner4k` kaynağının gerçek genişliği — `srcSet` adayını doğru bildirmek için */
  banner4kGenislik: number | null;
  /**
   * TMDB backdropsu, 4K'nın altında (<3000 px) ama AniList banner'ı yokken ya da
   * AniList tavanını (1900 px) geçtiğinde kullanılan ikinci katman; yoksa null.
   */
  bannerTmdb: string | null;
  bannerTmdbGenislik: number | null;
  ozet: string | null;
  turler: string[];
  iliski: Iliski[];
  /** ait olduğu seri (franchise) slug'ı — 2+ üyeli ilişki ağı yoksa null */
  seri: string | null;
  fragman: Fragman | null;
  yasal: YasalBaglanti[];
  kaynakSayisi: number;
  bolumSayisi: number;
  bolumler: Bolum[];
}

/** Katalog satırı: katalog.json içindeki `kolonlar` dizisiyle aynı sırada. */
export type KatalogSatiri = [
  slug: string,
  ad: string,
  yil: number | null,
  puan: number | null,
  format: string | null,
  poster: string | null,
  bolumSayisi: number,
  turler: string[],
  ara: string,
  durum: string | null,
  kaynakSayisi: number,
  id: number,
];

export interface KatalogDosyasi {
  uretim: string;
  kolonlar: string[];
  anime: KatalogSatiri[];
}

export interface AnaSayfaKarti {
  s: string;
  ad: string;
  yil: number | null;
  puan: number | null;
  format: string | null;
  p: string;
  ban: string | null;
  /** 4K backdrop (varsa hero onu kullanır) */
  ban4k: string | null;
  /** `ban4k` kaynağının gerçek genişliği — srcSet adayını doğru bildirmek için */
  bw: number | null;
  bs: number;
  ks: number;
  t: string[];
  oz: string | null;
  id: number;
  sezon: string | null;
  /** YouTube fragman kimliği (yoksa null) */
  fr: string | null;
}

/** Seri (franchise) üyesi: katalogdan bağımsız, kompakt kayıt. */
export interface SeriUye {
  s: string;
  ad: string;
  yil: number | null;
  p: string | null;
}

export interface Seri {
  /** seri sayfası adresi — kök (en eski) yapımın slug'ı */
  s: string;
  ad: string;
  uyeler: SeriUye[];
}

export interface SeriDosyasi {
  uretim: string;
  seriler: Seri[];
}

export interface AnaSayfaSatiri {
  baslik: string;
  tur: string | null;
  ogeler: AnaSayfaKarti[];
}

export interface AnaSayfaDosyasi {
  uretim: string;
  hero: AnaSayfaKarti[];
  satirlar: AnaSayfaSatiri[];
}

export interface Taksonomi {
  uretim: string;
  turler: { ad: string; sayi: number }[];
  formatlar: { ad: string; sayi: number }[];
  yillar: { yil: number; sayi: number }[];
  playerlar: {
    ad: string;
    guvenilirlik: number;
    kontrol: number;
    ok: number;
    olu: number;
  engelli: number;
  /** Kesin karara varılamayan ölçümler (bot duvarı, DDoS koruması, kanıtsız yanıt) */
  belirsiz: number;
  link: number;
  }[];
  fansublar: { ad: string; s: string; anime: number; bolum: number }[];
}

/** fansublar.json — grup dizini (fansub sayfaları için). */
export interface FansubDosyasi {
  uretim: string;
  gruplar: { ad: string; s: string; bolum: number; anime: string[] }[];
}

export interface Kunye {
  uretim: string;
  anime: number;
  bolum: number;
  kaynak: number;
  /** 4K (≥3000 px) TMDB backdrop'u olan yapım sayısı */
  banner4k: number;
  /** 4K'nın altındaki TMDB backdropsu kullanılan (HD katmanı) yapım sayısı */
  bannerTmdb: number;
  tekilKaynak: number;
  dogrulanmisKaynak: number;
  fansubGrubu: number;
  seriGrubu: number;
  player: number;
  tur: number;
  kataloğaGiren: number;
  bölümsüzAnime: number;
  kaynaksizAnime: number;
  zenginlestirilmisAnime: number;
  iliskiKaydi: number;
  yasalIzlemeBaglantisi: number;
}

export interface Saglik {
  uretim: string;
  kaynak: string;
  /** En az bir kez yoklanan tekil URL sayısı (deneme kapsamı) */
  kontrolEdilenUrl: number;
  hamTekilUrl: number;
  /** kontrolEdilenUrl / hamTekilUrl — "denendi" oranı */
  kapsamYuzdesi: number;
  /** Yalnızca kesin karara varılanların oranı (ok + ölü + engelli) */
  kesinKapsamYuzdesi: number;
  /** tools/cache/link-durum.jsonl'den gelen kayıt sayısı (kendi tarayıcımız) */
  kendiTaramaUrl: number;
  kullanilan: { calisiyor: number; olu: number; engellendi: number; belirsiz: number };
  sitedeGizlenen: { olu: number; engelli: number };
  not: string;
}

/* ---------------- istemci tarafı (localStorage) tipleri ---------------- */

export interface IlerlemeKaydi {
  slug: string;
  ad: string;
  poster: string | null;
  bolum: number;
  bolumAdi: string;
  /** epoch ms */
  zaman: number;
  /** saniye cinsinden sayfada geçirilen izleme süresi (iframe süresi okunamaz) */
  saniye: number;
}

export interface ListeKaydi {
  slug: string;
  ad: string;
  poster: string | null;
  yil: number | null;
  zaman: number;
}
