/**
 * gunluk-dongu.mjs — link sağlığını canlı tutan otomatik döngü
 * ===========================================================
 * Zincir: panel ayarını oku → karar ver → tara → site verisi → derleme →
 * yayın hazırlığı → (istenirse) commit/push → koşu raporunu panele yaz.
 *
 * İki parçalı tasarım:
 *   · **Politika sunucuda:** dilim/saat/açık-kapalı/push ayarları D1'deki
 *     `tarama_ayar` satırında durur ve site üzerindeki `/yonetim/` panelinden
 *     değiştirilir (bkz. docs/11). Döngü her uyanışta bu ayarı okur.
 *   · **İş yalnızca bu makinede:** `npm run veri` arşiv SQLite'ını okur ve o dosya
 *     depoda yoktur (ADR-0004), bu yüzden tarama+veri+derleme üçlüsü arşivin
 *     bulunduğu makinede koşar. Zamanlayıcı saatte bir uyandırır; "günde bir"
 *     kuralı `tools/lib/dongu.mjs` içindeki saf karar fonksiyonundadır (test edilir).
 *   · **Derleme kilide dayanıklı:** `out/` başka bir süreçte açıksa Windows'ün
 *     `EBUSY: rmdir 'out'` hatası gecelik koşuyu düşürmez; söküm bekleyerek
 *     tekrarlanır, derleme kilit hatasında artan beklemeyle yeniden denenir
 *     (`tools/lib/derleme.mjs`, ağsız test edilir).
 *
 * Kullanım:
 *   npm run dongu:gunluk                        # panel ayarına göre karar ver ve (gerekirse) koş
 *   npm run dongu:gunluk -- --zorla             # ayarı yok say, hemen koş
 *   npm run dongu:gunluk -- --kalp              # yalnızca kalp atışı + karar (iş yapmaz)
 *   npm run dongu:gunluk -- --dilim=250         # bu koşu için dilimi değiştir
 *   npm run dongu:gunluk -- --yayinla --push    # commit + push (panel ayarını geçersiz kılar)
 *   npm run dongu:gunluk -- --kuru              # yalnızca tara (veri/derleme yok)
 *   npm run dongu:gunluk -- --deneme            # hiçbir adımı koşma, planı yaz
 *   npm run dongu:gunluk -- --yerel             # panel ayarını okuma, varsayılanlarla koş
 *
 * Yönetici jetonu şu sırayla aranır: `--token=`, `GENESIS_ADMIN_TOKEN`, `api/.dev.vars`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, YOLLAR, baslik, log } from './lib/ortak.mjs';
import { donguKarari, kararMetni, yerelGun } from './lib/dongu.mjs';
import {
  derlemeTekrarKarari,
  kilitHatasiMi,
  kilitOnerisi,
  kilitliDene,
  outSok,
} from './lib/derleme.mjs';

const AYAR = {
  dilim: null,
  deneme: false,
  kuru: false,
  zorla: false,
  kalp: false,
  yerel: false,
  yayinla: null,
  push: null,
  api: process.env.GENESIS_API_URL || 'https://genesisanime-api.genesisanime.workers.dev',
  token: process.env.GENESIS_ADMIN_TOKEN || '',
};

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--dilim=')) AYAR.dilim = Number(arg.slice(8)) || null;
  else if (arg.startsWith('--api=')) AYAR.api = arg.slice(6).replace(/\/+$/, '');
  else if (arg.startsWith('--token=')) AYAR.token = arg.slice(8);
  else if (arg === '--deneme') AYAR.deneme = true;
  else if (arg === '--kuru') AYAR.kuru = true;
  else if (arg === '--zorla') AYAR.zorla = true;
  else if (arg === '--kalp') AYAR.kalp = true;
  else if (arg === '--yerel') AYAR.yerel = true;
  else if (arg === '--yayinla') AYAR.yayinla = true;
  else if (arg === '--push') AYAR.push = true;
  else if (arg === '--yardim' || arg === '-h') {
    log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].split('/**')[1]);
    process.exit(0);
  }
}
if (AYAR.push && AYAR.yayinla === null) {
  log('   ! --push tek başına anlamsız; commit için --yayinla da gerekir. Atlanıyor.');
  AYAR.push = false;
}

const DONGU_KAYIT = path.join(YOLLAR.rapor, 'gunluk-dongu.jsonl');
const KAYIT_JSONL = path.join(ROOT, 'docs', 'gunluk', 'kayit.jsonl');
const MAKINE = (os.hostname() || 'bilinmiyor').slice(0, 60);

/* --------------------------- panel haberleşmesi --------------------------- */

/** Basit `.env` okuyucu (verilen anahtarlardan ilkini döndürür). */
function envDosyasiOku(dosya, anahtarlar) {
  if (!fs.existsSync(dosya)) return '';
  for (const satir of fs.readFileSync(dosya, 'utf8').split('\n')) {
    const t = satir.trim();
    if (!t || t.startsWith('#')) continue;
    const esit = t.indexOf('=');
    if (esit < 1) continue;
    if (!anahtarlar.includes(t.slice(0, esit).trim())) continue;
    return t.slice(esit + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

/**
 * Yönetici jetonu: --token= → ortam değişkeni → kök `.env`.
 * `api/.dev.vars` BİLEREK kullanılmaz: oradaki jeton yerel `wrangler dev` içindir ve
 * üretimdekiyle aynı değildir; sessizce "yetkisiz" hatası üretirdi (yaşandı).
 */
function jetonBul() {
  if (AYAR.token) return AYAR.token;
  if (process.env.GENESIS_ADMIN_TOKEN) return process.env.GENESIS_ADMIN_TOKEN;
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  return envDosyasiOku(path.join(ROOT, '.env'), ['GENESIS_ADMIN_TOKEN', 'ADMIN_TOKEN']);
}

async function apiCagri(yol, yontem = 'GET', govde = null) {
  const jeton = AYAR.token;
  if (!AYAR.api || !jeton) return { ok: false, hata: 'jeton-yok' };
  try {
    const yanit = await fetch(`${AYAR.api}${yol}`, {
      method: yontem,
      headers: { Authorization: `Bearer ${jeton}`, ...(govde ? { 'Content-Type': 'application/json' } : {}) },
      body: govde ? JSON.stringify(govde) : undefined,
    });
    const veri = await yanit.json().catch(() => null);
    if (!yanit.ok || !veri || veri.ok === false) {
      return { ok: false, hata: (veri && veri.hata) || String(yanit.status) };
    }
    return { ok: true, veri };
  } catch (e) {
    return { ok: false, hata: (e && e.message) || 'ag-hatasi' };
  }
}

/* ------------------------------- adım koşumu ------------------------------- */

function adim(ad, komut, args, kabuk = false) {
  log(`\n▶ ${ad}`);
  log(`   $ ${komut} ${args.join(' ')}`);
  if (AYAR.deneme) return { ad, kod: 0, ms: 0 };
  const basla = Date.now();
  const sonuc = spawnSync(komut, args, {
    cwd: ROOT,
    shell: kabuk,
    encoding: 'utf8',
    stdio: kabuk ? 'inherit' : ['ignore', 'inherit', 'inherit'],
  });
  return { ad, kod: sonuc.status ?? 1, ms: Date.now() - basla };
}

/**
 * Derlemeyi çıktısını yakalayarak koşar: kilit hatasında (`EBUSY`/`EPERM`)
 * artan beklemeyle birkaç kez daha dener. Kilit dışı hata tekrar edilmez —
 * gerçek hatayı gizlememek için (bkz. tools/lib/derleme.mjs).
 */
async function derlemeAdimi() {
  const calistir = () => {
    log('\n▶ Statik site derleniyor');
    log('   $ npm run build');
    if (AYAR.deneme) return { kod: 0, ms: 0, cikti: '' };
    const basla = Date.now();
    let sonuc;
    try {
      // Çıktıyı yakalamak zorundayız: kilit hatası ancak metinden anlaşılır.
      sonuc = spawnSync('npm', ['run', 'build'], {
        cwd: ROOT,
        shell: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (e) {
      return { kod: 1, ms: Date.now() - basla, cikti: (e && e.message) || String(e) };
    }
    const cikti = `${sonuc.stdout || ''}${sonuc.stderr || ''}`;
    if (cikti) process.stdout.write(cikti.endsWith('\n') ? cikti : `${cikti}\n`);
    return { kod: sonuc.status ?? 1, ms: Date.now() - basla, cikti };
  };
  const { son, denemeler } = await kilitliDene({
    calistir,
    karar: derlemeTekrarKarari,
    bildir: (metin) => log(`   ! derleme: ${metin}`),
  });
  return {
    ad: denemeler.length > 1 ? `Statik site derleniyor (${denemeler.length} deneme)` : 'Statik site derleniyor',
    kod: son.kod,
    ms: denemeler.reduce((t, d) => t + d.sure_ms, 0),
    denemeler: denemeler.length,
    kilit: son.kod !== 0 && kilitHatasiMi(son.cikti),
  };
}

/** Tarama kapsamını ölçer (panel satırında görünür). */
function kapsamOlc() {
  if (AYAR.deneme) return 'deneme';
  const s = spawnSync(process.execPath, ['--no-warnings', 'tools/link-tara.mjs', '--durum'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const satir = (s.stdout ?? '')
    .split('\n')
    .map((x) => x.trim())
    .find((x) => x.startsWith('dağılım'));
  return satir ? satir.replace(/\s+/g, ' ') : 'ölçülemedi';
}

function kaydet(veri) {
  if (AYAR.deneme) return; // deneme koşusu iz bırakmaz
  fs.mkdirSync(path.dirname(DONGU_KAYIT), { recursive: true });
  fs.appendFileSync(DONGU_KAYIT, JSON.stringify(veri) + '\n', 'utf8');
  fs.appendFileSync(KAYIT_JSONL, JSON.stringify(veri) + '\n', 'utf8');
}

/* --------------------------------- akış --------------------------------- */

async function main() {
  AYAR.token = jetonBul();
  const baslangic = Date.now();
  baslik(`günlük döngü — makine ${MAKINE}${AYAR.deneme ? ' (deneme)' : ''}`);

  /* 1 · Panel ayarını ve son koşuları oku */
  let ayar = null;
  let kosular = [];
  let panelHatasi = null;
  if (!AYAR.yerel) {
    const durum = await apiCagri('/tarama/durum');
    if (durum.ok) {
      ayar = durum.veri.ayar;
      kosular = durum.veri.kosular || [];
      log(`   panel: dilim ${ayar.dilim} · saat ${ayar.saat} · ${ayar.aktif === 1 ? 'açık' : 'kapalı'}`);
    } else {
      panelHatasi = durum.hata;
      log(`   ! panel ayarı okunamadı (${durum.hata}) — varsayılan dilimle karar verilecek`);
      if (durum.hata === 'yetkisiz' || durum.hata === 'jeton-yok') {
        log('     → kök `.env` dosyasına GENESIS_ADMIN_TOKEN=<üretim jetonu> yazın:');
        log('       Cloudflare → Workers → genesisanime-api → Settings → Variables → ADMIN_TOKEN');
        log('       (panelde de aynı jeton kullanılır: /yonetim/)');
      }
      ayar = { aktif: 1, dilim: 1500, saat: 0, yayinla: 0, push: 0, hemen: 0 };
    }
  }
  if (!ayar) ayar = { aktif: 1, dilim: 1500, saat: 0, yayinla: 0, push: 0, hemen: 0 };

  /* 2 · Karar */
  const karar = donguKarari({ ayar, kosular, simdi: new Date(), zorla: AYAR.zorla });
  const dilim = AYAR.dilim ?? ayar.dilim;
  log(`\n   karar: ${kararMetni(karar)}${panelHatasi ? ' (panel okunamadı)' : ''}`);

  const kalpGonder = () =>
    apiCagri('/tarama/kalp', 'POST', { makine: MAKINE, karar: panelHatasi ? `${karar.neden} · panel-yok` : karar.neden });

  if (!karar.kos || AYAR.kalp) {
    await kalpGonder();
    log(`   iş yapılmadı (${AYAR.kalp ? '--kalp' : karar.neden})`);
    process.exit(0);
  }

  /* 3 · İş zinciri */
  // Derleme ortamı denetimi: NEXT_PUBLIC_* değerleri derleme anında HTML'e gömülür.
  // Eksikse döngünün ürettiği site hesapsız/API'siz olur ve bu SESSİZ bir kayıptır
  // (bir kez yaşandı: panel "API kapalı" gösterdi). Uyarıyı log'a ve panele taşıyoruz.
  const derlemeUyarilari = [];
  if (!process.env.NEXT_PUBLIC_API && !envDosyasiOku(path.join(ROOT, '.env'), ['NEXT_PUBLIC_API'])) {
    derlemeUyarilari.push('NEXT_PUBLIC_API yok: derleme sitesiz API ile yapılacak (hesap/bildirim kapalı kalır)');
  }
  if (!process.env.BASE_PATH && !envDosyasiOku(path.join(ROOT, '.env'), ['BASE_PATH'])) {
    derlemeUyarilari.push('BASE_PATH yok: alt dizin yayını için yollar öneksiz derlenecek');
  }
  for (const u of derlemeUyarilari) log(`   ! ${u}`);

  const adimlar = [];
  const tarama = adim('Link taraması (bildirimler öne alınır)', process.execPath, [
    '--no-warnings',
    'tools/link-tara.mjs',
    `--dilim=${dilim}`,
    '--bildirim',
  ]);
  adimlar.push(tarama);

  const yayinla = AYAR.yayinla ?? ayar.yayinla === 1;
  const push = AYAR.push ?? ayar.push === 1;

  if (tarama.kod === 0 && !AYAR.kuru) {
    const veri = adim('Site verisi tazeleniyor', 'npm', ['run', 'veri'], true);
    adimlar.push(veri);
    if (veri.kod === 0) {
      // Derleme `out/`u baştan yazar. Klasörü başka bir süreç tutuyorsa (yerel
      // önizleme sunucusu, açık gezgin) burada kilit çözülmeye çalışılır.
      // `--deneme` hiçbir şeye dokunmaz: söküm de yapılmaz.
      const sokum = AYAR.deneme
        ? { ok: true, denemeler: 0, hata: '', kilit: false }
        : await outSok({ yol: path.join(ROOT, 'out'), bildir: (m) => log(`   ! ${m}`) });
      if (!sokum.ok) {
        const ilk = (sokum.hata || '').split('\n')[0];
        log(`   ! out/ sökülemedi (${sokum.denemeler} deneme): ${ilk}`);
        derlemeUyarilari.push(`out/ sökülemedi (${sokum.denemeler} deneme): ${ilk}. ${kilitOnerisi()}`);
      }
      const derleme = await derlemeAdimi();
      adimlar.push(derleme);
      if (derleme.kod !== 0 && derleme.kilit) {
        derlemeUyarilari.push(`Derleme out/ kilidi yüzünden düştü (${derleme.denemeler} deneme). ${kilitOnerisi()}`);
      }
      if (derleme.kod === 0) {
        adimlar.push(adim('Yayına hazırlanıyor', 'npm', ['run', 'yayin:hazirla'], true));
      }
    }
  }

  let sonuc = adimlar.some((a) => a.kod !== 0) ? 'hata' : 'ok';

  /* 4 · Commit / push (yalnızca istenirse) */
  if (sonuc === 'ok' && yayinla && !AYAR.kuru) {
    const tarih = yerelGun(new Date());
    const yollar = [
      'tools/cache/link-durum.jsonl',
      'tools/cache/bildirim.jsonl',
      'tools/cache/link-tarama-host.json',
      'public/data',
      'tools/rapor',
      'docs/gunluk/kayit.jsonl',
    ];
    adimlar.push(adim('Değişiklikler sahneleniyor', 'git', ['add', '--', ...yollar], true));
    const commit = adim(
      'Commit',
      'git',
      ['commit', '-m', `Günlük link taraması (${tarih}): ${dilim} kaynak yeniden yoklandı`],
      true
    );
    adimlar.push(commit);
    if (commit.kod === 0 && push) {
      const p = adim('Push (yayın iş akışını tetikler)', 'git', ['push'], true);
      adimlar.push(p);
      if (p.kod !== 0) sonuc = 'hata';
    }
  }

  const kapsam = kapsamOlc();
  const sure = Math.round((Date.now() - baslangic) / 1000);

  /* 5 · Panele raporla */
  const ozet = adimlar
    .map((a) => `${a.kod === 0 ? '✓' : '✗'} ${a.ad} (${Math.round(a.ms / 1000)} sn)`)
    .join(' · ');
  const not_metni = [
    `karar: ${karar.neden} · dilim: ${dilim} · commit: ${yayinla ? 'evet' : 'hayır'} · push: ${push ? 'evet' : 'hayır'}`,
    ...derlemeUyarilari.map((u) => `UYARI: ${u}`),
    ozet,
    kapsam,
  ].join('\n');
  const rapor = await apiCagri('/tarama/kosu', 'POST', {
    makine: MAKINE,
    dilim,
    sure_sn: sure,
    sonuc,
    kapsam,
    not_metni,
  });
  if (!rapor.ok) log(`   ! koşu raporu panele yazılamadı: ${rapor.hata}`);
  // "Hemen çalıştır" bayrağını temizle: tek seferlik bir istektir.
  if (ayar.hemen === 1) {
    await apiCagri('/tarama/ayar', 'PUT', { ...ayar, hemen: 0 });
    log('   panel bayrağı "hemen çalıştır" temizlendi');
  }

  log('\n──────────────────────────────────────────────');
  log(`   sonuç : ${sonuc}`);
  log(`   süre  : ${sure} sn`);
  log(`   kapsam: ${kapsam}`);
  log('   kayıt : tools/rapor/gunluk-dongu.jsonl + panel');

  kaydet({
    zaman: new Date().toISOString(),
    faz: 'OTOMATİK-DÖNGÜ',
    is: `Günlük otomatik döngü (${MAKINE}): ${dilim} kaynak yoklandı, site verisi ve yayın ağacı tazelendi${
      yayinla ? ', commit atıldı' : ' (commit yok)'
    }`,
    dosyalar: ['tools/cache/link-durum.jsonl', 'public/data', 'tools/rapor/gunluk-dongu.jsonl', 'docs/gunluk/kayit.jsonl'],
    komut: `npm run dongu:gunluk -- --dilim=${dilim}${yayinla ? ' --yayinla' : ''}${push ? ' --push' : ''}`,
    sonuc,
    olcum: `karar ${karar.neden} · süre ${sure} sn · ${kapsam}`,
  });

  process.exit(sonuc === 'ok' ? 0 : 1);
}

await main();
