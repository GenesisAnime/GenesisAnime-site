/**
 * bicim.test.mjs — biçimlendirme ve gömme yardımcıları için birim testleri
 * ======================================================================
 * Kapsam: `src/lib/bicim.ts` içindeki **saat diliminden bağımsız** damga biçimi
 * (`damgaBicim`), JSON-LD gömme kaçışı (`jsonLdGuvenli`) ve bu iki kuralın
 * kaynak kodda geri gelmemesi (yapısal denetim).
 *
 * Neyi korur?
 *   · Derleme damgası CI (UTC) ile geliştirici makinesinde (UTC+3) AYNI metni üretmeli —
 *     aksi hâlde "yerelde şöyleydi" tipi yanıltıcı farklar ve tekrarlanamayan derleme olur
 *   · JSON-LD gövdesi `</script>` içeriyorsa betik etiketini kapatamamalı (XSS)
 *   · Sunucu bileşenleri yerel saat dilimine bağlı `new Date(...).toLocale*` çağırmamalı
 *   · iframe izin listeleri `fullscreen` içermeli, eski `allowFullScreen` kullanılmamalı
 *     (ikisi birlikteyken tarayıcı konsolu uyarı basıyor ve `allow` kazanıyor)
 *
 * Not: `bicim.ts` doğrudan içe aktarılır; bu, Node'un TypeScript şerit açmasını
 * gerektirir (Node ≥ 22.18). Desteklenmiyorsa yalnızca ilgili testler atlanır,
 * suite'in geri kalanı etkilenmez.
 *
 * Çalıştırma: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('../..', import.meta.url));
const ISO = '2026-10-01T05:05:33.949Z';
const ATLA = 'Node bu sürümde .ts modülünü doğrudan çalıştıramıyor (Node ≥ 22.18 gerekir)';

let bicim = null;
try {
  bicim = await import('../../src/lib/bicim.ts');
} catch {
  bicim = null;
}

function dosyaOku(goreli) {
  return readFileSync(path.join(KOK, goreli), 'utf8');
}

/** Aynı yardımcıyı başka bir saat diliminde, ayrı bir Node sürecinde çalıştırır. */
function baskaSaatDiliminde(dilim) {
  const modul = new URL('../../src/lib/bicim.ts', import.meta.url).href;
  const kod = `
    const m = await import(${JSON.stringify(modul)});
    process.stdout.write(m.damgaBicim(${JSON.stringify(ISO)}, true) + '|' + m.damgaBicim(${JSON.stringify(ISO)}));
  `;
  return execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', kod], {
    env: { ...process.env, TZ: dilim },
    encoding: 'utf8',
  }).trim();
}

test('damgaBicim: damga sabit biçimde ve UTC etiketiyle yazılır', { skip: bicim ? false : ATLA }, () => {
  assert.equal(bicim.damgaBicim(ISO), '1 Ekim 2026 (UTC)');
  assert.equal(bicim.damgaBicim(ISO, true), '1 Ekim 2026 05:05 (UTC)');
  assert.equal(bicim.damgaBicim('bozuk-veri'), '—', 'geçersiz damga boş/hatalı metin üretmemeli');
});

test('damgaBicim: saat dilimi değişince çıktı değişmez', { skip: bicim ? false : ATLA }, () => {
  const beklenen = `${bicim.damgaBicim(ISO, true)}|${bicim.damgaBicim(ISO)}`;
  // UTC, UTC−7 (ABD batı yakası) ve UTC+14 (gün atlayan uç dilim)
  for (const dilim of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    assert.equal(
      baskaSaatDiliminde(dilim),
      beklenen,
      `${dilim} saat diliminde farklı metin üretildi (derleme tekrarlanabilirliği bozulur)`,
    );
  }
});

test('jsonLdGuvenli: betik etiketini kapatamaz, JSON anlamı korunur', { skip: bicim ? false : ATLA }, () => {
  const veri = {
    '@type': 'TVSeries',
    name: '</script><img src=x onerror="alert(1)">',
    description: 'a<b & c',
  };
  const metin = bicim.jsonLdGuvenli(veri);
  assert.ok(!metin.includes('</script>'), 'kaçışsız </script> çıktı — XSS kapısı açık');
  assert.ok(metin.includes('\\u003c'), 'beklenen \\u003c kaçışı yok');
  assert.deepEqual(JSON.parse(metin), veri, 'kaçış JSON değerini değiştirdi');
});

test('JSON-LD kaçışı anime sayfasında kullanılıyor', () => {
  const kaynak = dosyaOku(path.join('src', 'app', 'anime', '[slug]', 'page.tsx'));
  assert.ok(kaynak.includes('jsonLdGuvenli('), 'anime sayfası kaçışsız JSON.stringify ile gömüyor');
  assert.ok(
    !/dangerouslySetInnerHTML=\{\{ __html: JSON\.stringify/.test(kaynak),
    'JSON-LD yine ham JSON.stringify ile gömülmüş',
  );
});

test('sunucu bileşenleri yerel saat dilimine bağlı tarih biçimlendirmez', () => {
  for (const goreli of [path.join('src', 'components', 'AltBilgi.tsx'), path.join('src', 'app', 'kunye', 'page.tsx')]) {
    const kaynak = dosyaOku(goreli);
    assert.ok(
      !/new Date\([^)]*\)\.toLocale/.test(kaynak),
      `${goreli}: derleme zamanında yerel saat dilimine bağlı tarih üretiliyor (damgaBicim kullanın)`,
    );
  }
});

test('iframe izin listeleri fullscreen içerir, eski allowFullScreen kullanılmaz', () => {
  const dosyalar = [
    path.join('src', 'app', 'anime', '[slug]', 'page.tsx'),
    path.join('src', 'components', 'FragmanKatmani.tsx'),
    path.join('src', 'components', 'IzleIstemci.tsx'),
  ];
  for (const goreli of dosyalar) {
    const kaynak = dosyaOku(goreli);
    assert.ok(!kaynak.includes('allowFullScreen'), `${goreli}: allowFullScreen hâlâ var (konsol uyarısı)`);
    const izinler = kaynak.match(/allow="[^"]*"/g) ?? [];
    assert.ok(izinler.length > 0, `${goreli}: iframe izin listesi bulunamadı`);
    for (const izin of izinler) {
      assert.ok(izin.includes('fullscreen'), `${goreli}: izin listesinde fullscreen yok — ${izin}`);
    }
  }
});
