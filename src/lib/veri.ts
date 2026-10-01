/**
 * veri.ts — build zamanı veri erişimi (yalnızca sunucu/build tarafı)
 *
 * Statik dışa aktarımda tüm sayfalar build sırasında üretilir; bu modül
 * `tools/export-data.mjs` çıktılarını doğrudan diskten okur. Önce
 *   npm run veri
 * çalıştırılmış olmalıdır. İstemci bileşenlerinden İTHAL EDİLMEMELİDİR.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {
  AnaSayfaDosyasi,
  Anime,
  FansubDosyasi,
  KatalogDosyasi,
  KatalogSatiri,
  Kunye,
  Saglik,
  SeriDosyasi,
  Taksonomi,
} from './tipler';

const VERI_DIZINI = path.join(process.cwd(), 'public', 'data');
const ANIME_DIZINI = path.join(VERI_DIZINI, 'anime');

const onbellek = new Map<string, unknown>();

function oku<T>(dosya: string, zorunlu = true): T | null {
  if (onbellek.has(dosya)) return onbellek.get(dosya) as T;
  const tam = path.join(VERI_DIZINI, dosya);
  if (!fs.existsSync(tam)) {
    if (zorunlu) {
      throw new Error(
        `Veri dosyası bulunamadı: public/data/${dosya}\n` +
          `Önce "npm run veri" komutunu çalıştır (ve isteğe bağlı: npm run veri:anilist).`
      );
    }
    return null;
  }
  const veri = JSON.parse(fs.readFileSync(tam, 'utf8')) as T;
  onbellek.set(dosya, veri);
  return veri;
}

export function katalogOku(): KatalogDosyasi {
  return oku<KatalogDosyasi>('katalog.json')!;
}

export function anaSayfaOku(): AnaSayfaDosyasi {
  return oku<AnaSayfaDosyasi>('ana-sayfa.json')!;
}

export function taksonomiOku(): Taksonomi {
  return oku<Taksonomi>('taksonomi.json')!;
}

export function kunyeOku(): Kunye {
  return oku<Kunye>('kunye.json')!;
}

export function saglikOku(): Saglik {
  return oku<Saglik>('saglik.json')!;
}

export function serilerOku(): SeriDosyasi {
  return oku<SeriDosyasi>('seriler.json')!;
}

export function fansublarDosyaOku(): FansubDosyasi {
  return oku<FansubDosyasi>('fansublar.json')!;
}

export function animeOku(slug: string): Anime | null {
  const tam = path.join(ANIME_DIZINI, `${slug}.json`);
  if (!fs.existsSync(tam)) return null;
  if (onbellek.has(tam)) return onbellek.get(tam) as Anime;
  const veri = JSON.parse(fs.readFileSync(tam, 'utf8')) as Anime;
  onbellek.set(tam, veri);
  return veri;
}

export function tumSluglar(): string[] {
  return katalogOku().anime.map((k) => k[0]);
}

/** Katalogdaki belirli kolon indeksleri (katalog.json → `kolonlar`) */
export const KOLON = {
  slug: 0,
  ad: 1,
  yil: 2,
  puan: 3,
  format: 4,
  poster: 5,
  bolumSayisi: 6,
  turler: 7,
  ara: 8,
  durum: 9,
  kaynakSayisi: 10,
  id: 11,
} as const;

/** Katalog satırını istemciye gönderilecek nesneye çevirir (payload küçültme). */
export type KartVerisi = {
  slug: string;
  ad: string;
  yil: number | null;
  puan: number | null;
  format: string | null;
  poster: string | null;
  bolumSayisi: number;
  turler: string[];
  kaynakSayisi: number;
};

export function kartlastir(satir: KatalogSatiri): KartVerisi {
  return {
    slug: satir[KOLON.slug],
    ad: satir[KOLON.ad],
    yil: satir[KOLON.yil],
    puan: satir[KOLON.puan],
    format: satir[KOLON.format],
    poster: satir[KOLON.poster],
    bolumSayisi: satir[KOLON.bolumSayisi],
    turler: satir[KOLON.turler],
    kaynakSayisi: satir[KOLON.kaynakSayisi],
  };
}
