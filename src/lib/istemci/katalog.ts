'use client';
/**
 * katalog.ts — istemci tarafı katalog yükleyici + arama motoru
 *
 * 2 MB'lık katalog.json yalnızca kullanıcı arama/filtre ile etkileşime
 * girdiğinde bir kez indirilir ve bellekte tutulur (modül düzeyinde tekil söz).
 * Böylece ana sayfa ve anime sayfaları hiç istemci verisi indirmez.
 */
import { genelYol } from '../yollar';
import type { KatalogSatiri } from '../tipler';
import { aramaPuanla, kelimeler, normalize } from '../bicim';

interface KatalogDosyasi {
  uretim: string;
  kolonlar: string[];
  anime: KatalogSatiri[];
}

let soz: Promise<KatalogSatiri[]> | null = null;
let veri: KatalogSatiri[] | null = null;

export function katalogYukle(): Promise<KatalogSatiri[]> {
  if (veri) return Promise.resolve(veri);
  if (!soz) {
    soz = fetch(genelYol('/data/katalog.json'))
      .then((y) => {
        if (!y.ok) throw new Error(`katalog.json indirilemedi (${y.status})`);
        return y.json() as Promise<KatalogDosyasi>;
      })
      .then((d) => {
        veri = d.anime;
        return veri;
      })
      .catch((e) => {
        soz = null;
        throw e;
      });
  }
  return soz;
}

export function katalogHazir(): boolean {
  return veri !== null;
}

export function katalogOnbellek(): KatalogSatiri[] | null {
  return veri;
}

export interface AramaSonucu {
  satir: KatalogSatiri;
  puan: number;
}

/** Kullanıcı sorgusuna göre alaka sırasına dizilmiş sonuçlar. */
export function ara(satirlar: KatalogSatiri[], sorgu: string, sinir = 40): KatalogSatiri[] {
  const kelimelerDizisi = kelimeler(sorgu);
  if (kelimelerDizisi.length === 0) return [];
  const sonuclar: AramaSonucu[] = [];
  for (const s of satirlar) {
    const puan = aramaPuanla(s[8], s[1], kelimelerDizisi);
    if (puan > 0) sonuclar.push({ satir: s, puan });
    if (sonuclar.length > 4000) break;
  }
  sonuclar.sort((a, b) => b.puan - a.puan);
  return sonuclar.slice(0, sinir).map((x) => x.satir);
}

export interface Filtre {
  tur: string | null;
  format: string | null;
  yil: string | null;
  durum: string | null;
  sirala: 'populer' | 'puan' | 'yeni' | 'eski' | 'ad' | 'bolum';
  sorgu: string;
}

export const VARSAYILAN_FILTRE: Filtre = {
  tur: null,
  format: null,
  yil: null,
  durum: null,
  sirala: 'populer',
  sorgu: '',
};

export function filtrele(satirlar: KatalogSatiri[], f: Filtre): KatalogSatiri[] {
  const kelimelerDizisi = kelimeler(f.sorgu);
  const sonuc = satirlar.filter((s) => {
    if (f.tur && !s[7].includes(f.tur)) return false;
    if (f.format && s[4] !== f.format) return false;
    if (f.yil && String(s[2]) !== f.yil) return false;
    if (f.durum && s[9] !== f.durum) return false;
    if (kelimelerDizisi.length) {
      const araAlan = s[8];
      for (const k of kelimelerDizisi) if (!araAlan.includes(k)) return false;
    }
    return true;
  });

  const puan = (s: KatalogSatiri) => s[3] ?? 0;
  switch (f.sirala) {
    case 'puan':
      sonuc.sort((a, b) => puan(b) - puan(a) || (a[1] > b[1] ? 1 : -1));
      break;
    case 'yeni':
      sonuc.sort((a, b) => (b[2] ?? 0) - (a[2] ?? 0) || puan(b) - puan(a));
      break;
    case 'eski':
      sonuc.sort((a, b) => (a[2] ?? 9999) - (b[2] ?? 9999) || puan(b) - puan(a));
      break;
    case 'ad':
      sonuc.sort((a, b) => a[1].localeCompare(b[1], 'tr'));
      break;
    case 'bolum':
      sonuc.sort((a, b) => b[6] - a[6] || puan(b) - puan(a));
      break;
    case 'populer':
    default:
      // kaynak sayısı + puan karışımı: hem bilinen hem dolu yapımlar öne çıksın
      sonuc.sort(
        (a, b) => puan(b) * 2 + Math.log10(b[10] + 1) * 12 - (puan(a) * 2 + Math.log10(a[10] + 1) * 12)
      );
      break;
  }
  return sonuc;
}

/** Sorgu ile eşleşen başlıkta vurgulanacak parçalar (basit, güvenli). */
export function vurgula(metin: string, sorgu: string): (string | { v: string })[] {
  const kelimelerDizisi = kelimeler(sorgu);
  if (!kelimelerDizisi.length) return [metin];
  const normal = normalize(metin);
  const araliklar: [number, number][] = [];
  for (const k of kelimelerDizisi) {
    let bas = normal.indexOf(k);
    while (bas !== -1) {
      araliklar.push([bas, bas + k.length]);
      bas = normal.indexOf(k, bas + 1);
    }
  }
  if (!araliklar.length) return [metin];
  araliklar.sort((a, b) => a[0] - b[0]);
  const birlesik: [number, number][] = [];
  for (const a of araliklar) {
    const son = birlesik[birlesik.length - 1];
    if (son && a[0] <= son[1]) son[1] = Math.max(son[1], a[1]);
    else birlesik.push([a[0], a[1]]);
  }
  const parcalar: (string | { v: string })[] = [];
  let konum = 0;
  for (const [b, s] of birlesik) {
    if (b > konum) parcalar.push(metin.slice(konum, b));
    parcalar.push({ v: metin.slice(b, s) });
    konum = s;
  }
  if (konum < metin.length) parcalar.push(metin.slice(konum));
  return parcalar;
}
