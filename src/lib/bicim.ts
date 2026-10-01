/**
 * bicim.ts — biçimlendirme, Türkçe metin normalizasyonu ve kaynak yardımcıları
 * İstemci ve sunucu tarafında ortak kullanılır (Node API'si içermez).
 */
import type { Kaynak } from './tipler';

/* ------------------------- metin normalizasyonu ------------------------- */

const TR_KUCUK: Record<string, string> = { İ: 'i', I: 'ı', Ş: 'ş', Ğ: 'ğ', Ü: 'ü', Ö: 'ö', Ç: 'ç' };
const ASKI: Record<string, string> = {
  ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u',
  é: 'e', è: 'e', ê: 'e', ñ: 'n', ä: 'a', ø: 'o', æ: 'ae', ß: 'ss',
};

/** Türkçe kurallarına uygun küçük harf + aksan sadeleştirme (arama için). */
export function normalize(metin: string): string {
  let s = '';
  for (const ch of metin) s += TR_KUCUK[ch] ?? ch;
  s = s.toLowerCase();
  let out = '';
  for (const ch of s) out += ASKI[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Arama sorgusunu kelimelere ayırır. */
export function kelimeler(metin: string): string[] {
  return normalize(metin).split(' ').filter(Boolean);
}

/* ------------------------------ biçimler ------------------------------ */

export function sayiBicim(sayi: number | null | undefined): string {
  if (sayi == null) return '—';
  return new Intl.NumberFormat('tr-TR').format(sayi);
}

export function puanBicim(puan: number | null | undefined): string | null {
  if (puan == null) return null;
  return (puan / 10).toFixed(1).replace('.', ',');
}

const FORMAT_ADLARI: Record<string, string> = {
  TV: 'TV',
  TV_SHORT: 'Kısa Bölüm',
  MOVIE: 'Film',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Müzik Videosu',
};

export function formatAd(format: string | null): string {
  if (!format) return 'Bilinmiyor';
  return FORMAT_ADLARI[format] ?? format;
}

const DURUM_ADLARI: Record<string, string> = {
  FINISHED: 'Tamamlandı',
  RELEASING: 'Devam ediyor',
  NOT_YET_RELEASED: 'Yakında',
  CANCELLED: 'İptal edildi',
  HIATUS: 'Ara verdi',
};

export function durumAd(durum: string | null): string {
  if (!durum) return 'Bilinmiyor';
  return DURUM_ADLARI[durum] ?? durum;
}

export function sureBicim(dk: number | null): string {
  if (!dk) return '—';
  if (dk < 60) return `${dk} dk`;
  const saat = Math.floor(dk / 60);
  const kalan = dk % 60;
  return kalan ? `${saat} sa ${kalan} dk` : `${saat} sa`;
}

/**
 * Veri/derleme zaman damgasını (ISO 8601) biçimlendirir.
 *
 * Neden saat dilimi UTC'ye sabit? Bu metin sunucuda, derleme sırasında üretilir:
 * CI (GitHub Actions) UTC, geliştirici makinesi UTC+3 olabilir. Yerel saat dilimine
 * bırakılırsa aynı kaynak koddan farklı HTML çıkar ve "yerelde çalışıyordu" tipi
 * yanıltıcı farklar doğar. Sabit UTC ile derleme tekrarlanabilir kalır; çıktıya
 * "(UTC)" eklenerek okurun yanlış yorumlaması da engellenir.
 */
export function damgaBicim(iso: string, saatli = false): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  const secenekler: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  };
  if (saatli) {
    secenekler.hour = '2-digit';
    secenekler.minute = '2-digit';
    secenekler.hour12 = false;
  }
  return `${new Intl.DateTimeFormat('tr-TR', secenekler).format(t)} (UTC)`;
}

/**
 * JSON-LD gövdesini `<script>` içine gömülebilir hâle getirir.
 *
 * `JSON.stringify` `<` karakterini kaçırmaz; veri içinde `</script>` geçen tek bir
 * alan (ör. dizi/özet metni) betiği erken kapatıp sayfaya HTML enjekte edebilir.
 * `<` yerine `\u003c` yazmak JSON anlamını değiştirmez, tarayıcıda aynı değere
 * çözülür — ama betik etiketini kapatamaz.
 */
export function jsonLdGuvenli(deger: unknown): string {
  return JSON.stringify(deger).replace(/</g, '\\u003c');
}

export function tarihBicim(zaman: number): string {
  const fark = Date.now() - zaman;
  const dk = Math.floor(fark / 60000);
  if (dk < 1) return 'az önce';
  if (dk < 60) return `${dk} dakika önce`;
  const saat = Math.floor(dk / 60);
  if (saat < 24) return `${saat} saat önce`;
  const gun = Math.floor(saat / 24);
  if (gun < 30) return `${gun} gün önce`;
  const ay = Math.floor(gun / 30);
  if (ay < 12) return `${ay} ay önce`;
  return `${Math.floor(ay / 12)} yıl önce`;
}

/* --------------------------- player adları --------------------------- */

const PLAYER_ADLARI: Record<string, string> = {
  SIBNET: 'Sibnet',
  MAIL: 'Mail.ru',
  ODNOKLASSNIKI: 'Odnoklassniki',
  VK: 'VK',
  OK: 'OK.ru',
  GDRIVE: 'Google Drive',
  UQLOAD: 'Uqload',
  MP4UPLOAD: 'Mp4Upload',
  DAILYMOTION: 'Dailymotion',
  VOE: 'Voe',
  VIDEA: 'Videa',
  CYBERFILE: 'CyberFile',
  HDVID: 'HDvid',
  DOODSTREAM: 'DoodStream',
  MEGA: 'Mega',
  YADISK: 'Yandex Disk',
  STREAMWISH: 'StreamWish',
  BYSE: 'Byse',
  PIXELDRAIN: 'PixelDrain',
  LULUVDO: 'LuluVDO',
  CDA: 'CDA',
  DIGER: 'Diğer',
};

export function playerAd(player: string): string {
  return PLAYER_ADLARI[player] ?? player.charAt(0) + player.slice(1).toLowerCase();
}

/** Kaynağın ana makine adı (çip gruplaması ve gösterimde kullanılır). */
export function kaynakHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Kaynağın siteye gömülebilir olup olmadığına dair ipucu.
 * Bazı player'lar iframe'i engeller (X-Frame-Options / CSP); kullanıcıya
 * "yeni sekmede aç" seçeneği her zaman sunulur.
 */
export function embedUygun(url: string): boolean {
  const host = kaynakHost(url);
  const sorunlu = ['mega.nz', 'pixeldrain.com', 'yandex', 'disk.yandex'];
  return !sorunlu.some((s) => host.includes(s));
}

/** Kaynak dizisi içinden doğrulanmış (çalıştığı bilinen) ilk kaynağı seçer. */
export function enIyiKaynak(kaynaklar: Kaynak[]): number {
  const i = kaynaklar.findIndex((k) => k[3] === 'ok');
  return i >= 0 ? i : 0;
}

export function kaynakEtiketi(k: Kaynak): string {
  return k[3] === 'ok' ? 'doğrulanmış' : 'doğrulanmamış';
}

/** Arşivde fansub künyesi olmayan kaynakların süzgeç etiketi (316.820 kaynağın ~64 bini böyle). */
export const KUNYESIZ = 'Künyesiz';

/** Kaynağın fansub (ekip) adı; künye yoksa `KUNYESIZ` döner (süzgeç düğmeleri için). */
export function kaynakGrubu(k: Kaynak): string {
  const ad = k[1]?.trim();
  return ad ? ad : KUNYESIZ;
}

/** Kaynak listesini player bazında gruplar (çip satırı için). */
export function kaynakGrupla(kaynaklar: Kaynak[]): { player: string; kaynaklar: { k: Kaynak; sira: number }[] }[] {
  const gruplar = new Map<string, { player: string; kaynaklar: { k: Kaynak; sira: number }[] }>();
  kaynaklar.forEach((k, sira) => {
    let g = gruplar.get(k[0]);
    if (!g) {
      g = { player: k[0], kaynaklar: [] };
      gruplar.set(k[0], g);
    }
    g.kaynaklar.push({ k, sira });
  });
  return [...gruplar.values()];
}

/** Basit alaka puanı: başlık eşleşmeleri arama sorgusuna göre puanlanır. */
export function aramaPuanla(ara: string, ad: string, sorguKelimeleri: string[]): number {
  if (sorguKelimeleri.length === 0) return 0;
  const adNormal = normalize(ad);
  let puan = 0;
  for (const k of sorguKelimeleri) {
    if (!k) continue;
    if (adNormal === k) puan += 100;
    else if (adNormal.startsWith(k)) puan += 60;
    else if (adNormal.includes(` ${k}`)) puan += 40;
    else if (adNormal.includes(k)) puan += 25;
    else if (ara.includes(k)) puan += 12;
    else return -1; // hiçbir kelime bulunamadı
  }
  // kısa başlıklar öne çıksın
  return puan + Math.max(0, 20 - Math.floor(adNormal.length / 8));
}

export function kisalt(metin: string, sinir: number): string {
  if (metin.length <= sinir) return metin;
  return metin.slice(0, sinir - 1).trimEnd() + '…';
}

/** Bölüm numarası etiketi: "12", "12.5" veya (special ise) sıra numarası. */
export function bolumNumarasi(no: string | null, sira: number): string {
  return no ?? `#${sira}`;
}
