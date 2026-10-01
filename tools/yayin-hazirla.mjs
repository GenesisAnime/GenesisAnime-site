/**
 * yayin-hazirla.mjs — statik çıktıyı yayına hazırlar
 * ==================================================================
 * `next build` sonrası çalıştırılır:
 *   1. out/.nojekyll  → GitHub Pages'in Jekyll işlemcisini kapatır
 *      (aksi halde `_next/` klasörü yayınlanmaz)
 *   2. out/404.html varlığını doğrular
 *   3. yayın ölçümlerini tools/rapor/yayin-raporu.md ve .json dosyalarına yazar
 *
 * Kullanım: npm run yayin:hazirla
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const RAPOR = path.join(ROOT, 'tools', 'rapor');

if (!fs.existsSync(OUT)) {
  console.error('[!] out/ klasörü yok. Önce `npm run build` çalıştır.');
  process.exit(1);
}

/* 1) Jekyll'i kapat */
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, 'CNAME.disabled'), '');

/* 2) Ölçüm */
function tara(dizin) {
  let dosya = 0;
  let toplam = 0;
  const uzanti = new Map();
  const yigin = [dizin];
  while (yigin.length) {
    const d = yigin.pop();
    for (const g of fs.readdirSync(d, { withFileTypes: true })) {
      const tam = path.join(d, g.name);
      if (g.isDirectory()) {
        yigin.push(tam);
        continue;
      }
      const boyut = fs.statSync(tam).size;
      dosya++;
      toplam += boyut;
      const ext = path.extname(g.name) || '(uzantısız)';
      uzanti.set(ext, (uzanti.get(ext) ?? 0) + 1);
    }
  }
  return { dosya, toplam, uzanti };
}

const olcum = tara(OUT);
const html = [...fs.readdirSync(path.join(OUT, 'anime'))].length;

const rapor = {
  zaman: new Date().toISOString(),
  cikti: OUT,
  dosyaSayisi: olcum.dosya,
  toplamBoyutMB: Number((olcum.toplam / 1024 / 1024).toFixed(2)),
  uzantilar: [...olcum.uzanti.entries()].sort((a, b) => b[1] - a[1]).map(([uzanti, sayi]) => ({ uzanti, sayi })),
  animeSayfasi: html,
  nojekyll: fs.existsSync(path.join(OUT, '.nojekyll')),
  dortYuzDort: fs.existsSync(path.join(OUT, '404.html')),
  sinirlar: {
    githubPages: { dosyaLimiti: 'yok (yumuşak)', boyutLimiti: '1 GB', durum: olcum.toplam < 1024 * 1024 * 1024 ? 'uygun' : 'AŞIYOR' },
    cloudflarePages: {
      dosyaLimiti: 20000,
      durum: olcum.dosya <= 20000 ? 'uygun' : `AŞIYOR (${olcum.dosya} > 20000)`,
    },
  },
};

fs.mkdirSync(RAPOR, { recursive: true });
fs.writeFileSync(path.join(RAPOR, 'yayin-raporu.json'), JSON.stringify(rapor, null, 2), 'utf8');

const md = [
  '# Yayın çıktısı raporu',
  '',
  `- Zaman: \`${rapor.zaman}\``,
  `- Dosya sayısı: **${rapor.dosyaSayisi}**`,
  `- Toplam boyut: **${rapor.toplamBoyutMB} MB**`,
  `- Anime sayfası: ${rapor.animeSayfasi}`,
  `- .nojekyll: ${rapor.nojekyll ? 'var' : 'YOK'}`,
  `- 404.html: ${rapor.dortYuzDort ? 'var' : 'YOK'}`,
  '',
  '## Dosya türleri',
  '',
  '| Uzantı | Adet |',
  '|---|---:|',
  ...rapor.uzantilar.slice(0, 12).map((u) => `| ${u.uzanti} | ${u.sayi} |`),
  '',
  '## Host limitleri',
  '',
  '| Host | Limit | Durum |',
  '|---|---|---|',
  `| GitHub Pages | 1 GB, dosya limiti yok | ${rapor.sinirlar.githubPages.durum} |`,
  `| Cloudflare Pages | 20.000 dosya | ${rapor.sinirlar.cloudflarePages.durum} |`,
  '',
];
fs.writeFileSync(path.join(RAPOR, 'yayin-raporu.md'), md.join('\n'), 'utf8');

console.log(`   .nojekyll yazıldı`);
console.log(`   dosya: ${rapor.dosyaSayisi} · boyut: ${rapor.toplamBoyutMB} MB`);
console.log(`   anime sayfası: ${rapor.animeSayfasi} · 404.html: ${rapor.dortYuzDort ? 'var' : 'yok'}`);
console.log(`   GitHub Pages: ${rapor.sinirlar.githubPages.durum} · Cloudflare Pages: ${rapor.sinirlar.cloudflarePages.durum}`);
console.log(`   rapor: tools/rapor/yayin-raporu.md`);
