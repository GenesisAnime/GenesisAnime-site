/**
 * ana-sayfa-kartlar.mjs — ana sayfanın istemciye giden **hafif** satır verisi
 * ===========================================================================
 * Neden ayrı dosya: ana sayfanın alt satırları artık istemcide kademeli
 * yükleniyor (`src/components/TembelSatirlar.tsx`). Tam `ana-sayfa.json`
 * 369 KB (99 KB gzip) — oysa kart yalnız 8 alan kullanıyor. Kırpılmış sürüm
 * 88 KB (14 KB gzip): kullanıcı kaydırdığında inen veri bunun kat kat altında.
 *
 * Alan listesi `Kart` bileşeninin (ve `satirHref`'in) gerçekten okuduğu
 * alanlardır; yeni bir alan eklenirse buraya da eklenmeli. Tutarlılık
 * `tools/testler/veri.test.mjs` içinde denetlenir: dosya `ana-sayfa.json` ile
 * birebir aynı satırları ve kart alanlarını taşımıyorsa test kırmızıya döner.
 *
 * Kullanım:  npm run veri çıktısının parçası (export-data.mjs çağırır)
 *            ya da tek başına:  node --no-warnings tools/ana-sayfa-kartlar.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/ortak.mjs';

/** Kart bileşeninin okuduğu alanlar (ada göre; eksik olan yazılmaz). */
export const KART_ALANLARI = ['s', 'ad', 'p', 'p2', 'yil', 'puan', 'format', 'bs', 'ks'];

export function kaynakYolu() {
  return path.join(ROOT, 'public', 'data', 'ana-sayfa.json');
}

export function hedefYolu() {
  return path.join(ROOT, 'public', 'data', 'ana-sayfa-kartlar.json');
}

/** Ana sayfa dosyasından yalnız kart alanlarını taşıyan hafif sürümü üretir. */
export function kartlariKirp(anaSayfa) {
  const kart = (o) => {
    const hedef = {};
    for (const alan of KART_ALANLARI) {
      if (o[alan] !== undefined) hedef[alan] = o[alan];
    }
    return hedef;
  };
  return {
    uretim: anaSayfa.uretim,
    satirlar: (anaSayfa.satirlar ?? []).map((s) => ({
      baslik: s.baslik,
      tur: s.tur ?? null,
      ogeler: (s.ogeler ?? []).map(kart),
    })),
  };
}

/** Kırpılmış dosyayı okur/yazar. Dönüş: yazılan bayt sayısı. */
export function kartlariYaz(kaynak = kaynakYolu(), hedef = hedefYolu()) {
  const veri = JSON.parse(fs.readFileSync(kaynak, 'utf8'));
  const kirpik = kartlariKirp(veri);
  fs.writeFileSync(hedef, JSON.stringify(kirpik));
  return fs.statSync(hedef).size;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const bayt = kartlariYaz();
  console.log(`ana-sayfa-kartlar.json yazıldı: ${(bayt / 1024).toFixed(0)} KB`);
}
