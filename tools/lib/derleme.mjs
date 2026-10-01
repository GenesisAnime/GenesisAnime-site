/**
 * derleme.mjs — derleme adımının SAF kilit/tekrar mantığı
 * ======================================================
 * `npm run build` (next build) statik çıktıyı baştan yazar ve önce `out/`u siler.
 * Klasör başka bir süreç tarafından tutuluyorsa Windows `EBUSY: rmdir 'out'`
 * verir; gecelik koşu, saatler süren taramanın ardından tek satır hataya düşer ve
 * "hata sonrası 3 saat bekle" kuralı yüzünden o gün bir daha denenmez.
 * (Yaşandı: yerel önizleme için açık bırakılan `python -m http.server`.)
 *
 * İki mekanizma var, ikisi de dosyasız/ağsız sınanabilir:
 *   · `outSok` — derlemeden **önce** `out/`u silmeyi dener; kilitliyse kısa
 *     aralıklarla tekrar dener. Kilit geçiciyse derleme hiç düşmez.
 *   · `kilitliDene` + `derlemeTekrarKarari` — derleme yine de kilit hatasıyla
 *     düşerse artan beklemeyle birkaç kez daha denenir.
 *
 * Kilit DIŞI hatalar (tip hatası, eksik modül, boş disk) tekrar denenmez: gerçek
 * hatayı tekrarlamak yalnızca gecikmedir ve hatayı gizler. Bu yüzden kilit
 * algılaması dar tutulur: yalnızca "klasör başka bir süreçte" hataları.
 */
import fs from 'node:fs';

/** Toplam deneme sayısı (ilk deneme + tekrarlar). */
export const DERLEME_TEKRAR_SINIRI = 3;
/** Tekrarlar arası artan beklemeler (ms). */
export const DERLEME_BEKLEMELERI_MS = [15_000, 45_000];
/** `out/` sökümü için deneme sayısı ve denemeler arası bekleme (6 × 5 sn = 30 sn). */
export const SOKUM_DENEME_SINIRI = 6;
export const SOKUM_BEKLEME_MS = 5_000;
/** Bir karar fonksiyonu hatalı olsa bile döngüye girmeyi engelleyen sert üst sınır. */
export const EN_COK_DENEME = 10;

const KILIT_DESENLERI = [
  /\bEBUSY\b/i,
  /\bEPERM\b/i,
  /\bEACCES\b/i,
  /\bENOTEMPTY\b/i,
  /resource busy or locked/i,
  /cannot access the file/i,
  /being used by another process/i,
];

/**
 * Hata metni "klasör/ dosya başka bir süreçte" sınıfından mı?
 * Node bu durumda Windows'ta EBUSY/EPERM, kimi zaman EACCES/ENOTEMPTY verir;
 * dosya gezgini ve senkron araçları ise kendi İngilizce metinlerini gösterir.
 */
export function kilitHatasiMi(metin) {
  const s = String(metin ?? '');
  return s.length > 0 && KILIT_DESENLERI.some((d) => d.test(s));
}

/** Kilit çözülmediğinde log'a/panel notuna eklenen eylem önerisi. */
export function kilitOnerisi() {
  return (
    'out/ klasörünü başka bir süreç tutuyor olabilir: yerel önizleme sunucusu ' +
    '(python -m http.server / npm run dev), açık dosya gezgini veya senkron aracı. ' +
    'Kapatıp döngüyü elle çalıştırın: npm run dongu:gunluk -- --zorla'
  );
}

const varsayilanBekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

/**
 * Verilen işi, karar "tekrar" dediği sürece artan beklemeyle tekrarlar.
 * `calistir` ve `karar` dışarıdan verilir: testler sahte bir işlevle, gecikmesiz
 * koşar; gerçek kullanım `spawnSync` + `fs.rmSync` ile.
 *
 * @param {object} g
 * @param {(deneme: number) => {kod: number, ms?: number, cikti?: string}} g.calistir
 * @param {(g: {deneme: number, cikti: string, son: object}) => {tekrar: boolean, neden?: string, beklemeMs?: number}} g.karar
 * @param {(ms: number) => Promise<void>} [g.bekle]
 * @param {(metin: string) => void} [g.bildir]
 * @returns {Promise<{son: object, denemeler: {deneme: number, kod: number, sure_ms: number}[]}>}
 */
export async function kilitliDene({ calistir, karar, bekle = varsayilanBekle, bildir = () => {}, enCok = EN_COK_DENEME } = {}) {
  const denemeler = [];
  let son = null;
  for (let deneme = 1; deneme <= enCok; deneme++) {
    son = calistir(deneme) || { kod: 1, cikti: '' };
    denemeler.push({ deneme, kod: son.kod, sure_ms: son.ms ?? 0 });
    if (son.kod === 0 || !karar) break;
    const k = karar({ deneme, cikti: son.cikti ?? '', son }) || {};
    if (!k.tekrar) {
      if (k.neden && k.neden !== 'kilit-degil') bildir(`${k.neden} — tekrar denenmeyecek`);
      break;
    }
    bildir(`${k.neden} → ${Math.round((k.beklemeMs ?? 0) / 1000)} sn sonra yeniden denenecek`);
    await bekle(k.beklemeMs ?? 0);
  }
  return { son, denemeler };
}

/** Derleme hatasından sonra tekrar kararı (yalnızca kilit hatalarında). */
export function derlemeTekrarKarari({ deneme = 1, cikti = '' } = {}) {
  if (!kilitHatasiMi(cikti)) return { tekrar: false, neden: 'kilit-degil', beklemeMs: 0 };
  if (deneme >= DERLEME_TEKRAR_SINIRI) {
    return { tekrar: false, neden: `kilit sürüyor (${deneme} deneme denendi)`, beklemeMs: 0 };
  }
  return {
    tekrar: true,
    neden: `out/ kilitli (deneme ${deneme}/${DERLEME_TEKRAR_SINIRI})`,
    beklemeMs: DERLEME_BEKLEMELERI_MS[Math.min(deneme - 1, DERLEME_BEKLEMELERI_MS.length - 1)],
  };
}

/** `out/` sökümünden sonra tekrar kararı (kilit dışı hatalarda hemen vazgeçer). */
export function sokumKarari({
  deneme = 1,
  cikti = '',
  sinir = SOKUM_DENEME_SINIRI,
  beklemeMs = SOKUM_BEKLEME_MS,
} = {}) {
  if (!kilitHatasiMi(cikti)) return { tekrar: false, neden: 'kilit-degil', beklemeMs: 0 };
  if (deneme >= sinir) return { tekrar: false, neden: `out/ kilidi geçmedi (${deneme} deneme)`, beklemeMs: 0 };
  return { tekrar: true, neden: `out/ kilitli (deneme ${deneme}/${sinir})`, beklemeMs };
}

/**
 * `out/`u derlemeden önce söker (Next zaten baştan yazacak).
 * Kilitliyse `SOKUM_BEKLEME_MS` aralıklarla en çok `SOKUM_DENEME_SINIRI` kez dener;
 * böylece geçici kilitlerde derleme hiç düşmez. Kilit sürerse `ok:false` döner —
 * çağıran taraf yine derlemeyi dener, yalnızca panele açıklayıcı not düşer.
 *
 * @param {{yol: string, fsModul?: object, bekle?: Function, bildir?: Function, sinir?: number, beklemeMs?: number}} g
 */
export async function outSok({
  yol,
  fsModul = fs,
  bekle,
  bildir,
  sinir = SOKUM_DENEME_SINIRI,
  beklemeMs = SOKUM_BEKLEME_MS,
} = {}) {
  const calistir = () => {
    const basla = Date.now();
    try {
      // force: klasör yoksa hata verme · maxRetries: Node'un kendi EBUSY denemeleri
      fsModul.rmSync(yol, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
      return { kod: 0, ms: Date.now() - basla, cikti: '' };
    } catch (e) {
      return { kod: 1, ms: Date.now() - basla, cikti: (e && e.message) || String(e) };
    }
  };
  const { son, denemeler } = await kilitliDene({
    calistir,
    karar: ({ deneme, cikti }) => sokumKarari({ deneme, cikti, sinir, beklemeMs }),
    bekle,
    bildir,
  });
  return {
    ok: son.kod === 0,
    denemeler: denemeler.length,
    hata: son.kod === 0 ? '' : son.cikti,
    kilit: son.kod !== 0 && kilitHatasiMi(son.cikti),
  };
}
