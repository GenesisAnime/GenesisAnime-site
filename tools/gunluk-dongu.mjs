/**
 * gunluk-dongu.mjs — link sağlığını canlı tutan otomatik döngü
 * ===========================================================
 * Tek komutla şu zinciri koşar:
 *   1. `link-tara --bildirim --dilim=N`  → kullanıcı bildirimlerini öne alan tarama dilimi
 *   2. `npm run veri`                    → tarama sonuçları site verisine işlenir (rozetler)
 *   3. `npm run build` + `yayin:hazirla` → yayınlanabilir `out/` ağacı
 *   4. `--yayinla` verilirse: git commit; `--push` de verilirse push (yayın iş akışını tetikler)
 *
 * NEDEN GITHUB ACTIONS DEĞİL?
 * `npm run veri` (tools/export-data.mjs) arşiv SQLite dosyasını okur ve bu dosya depoda
 * tutulmaz (ADR-0004). Bu yüzden 2. adım yalnızca arşivin bulunduğu makinede koşabilir;
 * CI derler ve test eder ama veriyi tazeleyemez. Zamanlayıcı kurulumu için:
 * docs/09-link-sagligi-otomasyonu.md → "Otomatik döngü (günlük)".
 *
 * Kullanım:
 *   npm run dongu:gunluk                        # tara → veri → derle → hazırla (commit YOK)
 *   npm run dongu:gunluk -- --dilim=3000        # gecelik dilim boyutu (varsayılan 1500)
 *   npm run dongu:gunluk -- --yayinla           # ayrıca commit at (push yok)
 *   npm run dongu:gunluk -- --yayinla --push    # commit + push
 *   npm run dongu:gunluk -- --deneme            # hiçbir adımı koşmadan planı yaz
 *
 * Not: tarama kesintiye dayanıklıdır (her sonuç anında diske yazılır); döngü ortasında
 * durursan bir sonraki koşu kaldığı yerden devam eder.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, YOLLAR, baslik, log } from './lib/ortak.mjs';

const AYAR = { dilim: 1500, deneme: false, yayinla: false, push: false, kuru: false };

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--dilim=')) AYAR.dilim = Number(arg.slice(8)) || AYAR.dilim;
  else if (arg === '--deneme') AYAR.deneme = true;
  else if (arg === '--yayinla') AYAR.yayinla = true;
  else if (arg === '--push') AYAR.push = true;
  else if (arg === '--kuru') AYAR.kuru = true; // yalnızca tara (veri üretme/derleme yok)
  else if (arg === '--yardim' || arg === '-h') {
    log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].split('/**')[1]);
    process.exit(0);
  }
}
if (AYAR.push && !AYAR.yayinla) {
  log('   ! --push tek başına anlamsız; commit için --yayinla da verilmeli. Atlanıyor.');
  AYAR.push = false;
}

const DONGU_KAYIT = path.join(YOLLAR.rapor, 'gunluk-dongu.jsonl');
const KAYIT_JSONL = path.join(ROOT, 'docs', 'gunluk', 'kayit.jsonl');

/** Tek adımı koşar; çıktıyı doğrudan terminale akıtır. */
function adim(ad, komut, args, kabuk = false) {
  log(`\n▶ ${ad}`);
  log(`   $ ${komut} ${args.join(' ')}`);
  if (AYAR.deneme) return { kod: 0, ms: 0, cikti: '' };
  const basla = Date.now();
  const sonuc = spawnSync(komut, args, {
    cwd: ROOT,
    shell: kabuk,
    encoding: 'utf8',
    stdio: kabuk ? 'inherit' : ['ignore', 'inherit', 'inherit'],
  });
  return { kod: sonuc.status ?? 1, ms: Date.now() - basla, cikti: sonuc.stdout ?? '' };
}

/** Tarama kapsamını ölçer (rapor satırı için) — başarısız olursa döngüyü düşürmez. */
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

/** Döngü kaydını iki yere yazar: makine okunur rapor + çalışma günlüğü. */
function kaydet(veri) {
  if (AYAR.deneme) return; // deneme koşusu iz bırakmaz
  fs.mkdirSync(path.dirname(DONGU_KAYIT), { recursive: true });
  fs.appendFileSync(DONGU_KAYIT, JSON.stringify(veri) + '\n', 'utf8');
  fs.appendFileSync(KAYIT_JSONL, JSON.stringify(veri) + '\n', 'utf8');
}

const baslangic = Date.now();
baslik(`günlük döngü — dilim ${AYAR.dilim}${AYAR.deneme ? ' (deneme)' : ''}`);

const adimlar = [];
let sonuc = 'ok';

// 1) tarama dilimi — kullanıcı bildirimleri kuyruğun önüne alınır
adimlar.push(adim('Link taraması (bildirimler öne alınır)', process.execPath, [
  '--no-warnings',
  'tools/link-tara.mjs',
  `--dilim=${AYAR.dilim}`,
  '--bildirim',
]));

// 2) veri + derleme + yayın hazırlığı (kuru modda atlanır)
if (adimlar.at(-1).kod === 0 && !AYAR.kuru) {
  for (const [ad, script] of [
    ['Site verisi tazeleniyor', 'veri'],
    ['Statik site derleniyor', 'build'],
    ['Yayına hazırlanıyor', 'yayin:hazirla'],
  ]) {
    const r = adim(ad, 'npm', ['run', script], true);
    adimlar.push(r);
    if (r.kod !== 0) break;
  }
}

const hata = adimlar.find((a) => a.kod !== 0);
if (hata) sonuc = 'hata';

// 3) commit (yalnızca istenirse)
if (sonuc === 'ok' && AYAR.yayinla && !AYAR.kuru) {
  const tarih = new Date().toISOString().slice(0, 10);
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
    ['commit', '-m', `Günlük link taraması (${tarih}): ${AYAR.dilim} kaynak yeniden yoklandı`],
    true
  );
  adimlar.push(commit);
  if (commit.kod === 0 && AYAR.push) {
    const push = adim('Push (yayın iş akışını tetikler)', 'git', ['push'], true);
    adimlar.push(push);
    if (push.kod !== 0) sonuc = 'hata';
  }
}

const kapsam = kapsamOlc();
const sure = Math.round((Date.now() - baslangic) / 1000);
log(`\n──────────────────────────────────────────────`);
log(`   sonuç : ${sonuc}`);
log(`   süre  : ${sure} sn`);
log(`   kapsam: ${kapsam}`);
log(`   kayıt : tools/rapor/gunluk-dongu.jsonl`);

kaydet({
  zaman: new Date().toISOString(),
  faz: 'OTOMATİK-DÖNGÜ',
  is: `Günlük otomatik döngü: ${AYAR.dilim} kaynak yoklandı, site verisi ve yayın ağacı tazelendi${
    AYAR.yayinla ? ', commit atıldı' : ' (commit yok)'
  }`,
  dosyalar: [
    'tools/cache/link-durum.jsonl',
    'public/data',
    'tools/rapor/gunluk-dongu.jsonl',
    'docs/gunluk/kayit.jsonl',
  ],
  komut: `npm run dongu:gunluk -- --dilim=${AYAR.dilim}${AYAR.yayinla ? ' --yayinla' : ''}${
    AYAR.push ? ' --push' : ''
  }${AYAR.kuru ? ' --kuru' : ''}${AYAR.deneme ? ' --deneme' : ''}`,
  sonuc,
  olcum: `süre ${sure} sn · ${kapsam}`,
});

process.exit(sonuc === 'ok' ? 0 : 1);
