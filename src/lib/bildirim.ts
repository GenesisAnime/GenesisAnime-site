/**
 * bildirim.ts — "kaynak çalışmıyor" bildirimlerinin istemci kuyruğu
 * ==================================================================
 * Yerel işaret (`depo/yerel.ts → calismayanIsaretle`) her koşulda çalışır:
 * site offline da olsa kullanıcı o kaynağı bir daha görmez. Bu modül ek olarak
 * bildirimi API'ye (api/, Cloudflare Workers) iletir; böylece kaynak bir sonraki
 * link taramasında kuyruğun önüne alınır.
 *
 * Tasarım:
 *   · API adresi tanımlı değilse (NEXT_PUBLIC_BILDIRIM_API boş) tamamen no-op'tur.
 *   · Bildirim önce localStorage kuyruğuna yazılır, sonra gönderilir; ağ hatasında
 *     kuyruk korunur ve bir sonraki tıklamada/`online` olayında yeniden denenir.
 *   · Yalnızca kaynağın URL'i, anime slug'ı ve bölüm numarası gönderilir.
 *     IP sunucuda tuzlanır, ham hâli saklanmaz (bkz. api/src/index.mjs).
 */

const TABAN = (process.env.NEXT_PUBLIC_BILDIRIM_API || '').replace(/\/$/, '');
const KUYRUK_ANAHTARI = 'genesisanime:v1:bildirim-kuyruk';
const KUYRUK_SINIRI = 200;

export interface BildirimGirdisi {
  url: string;
  anime?: string | null;
  bolum?: number | null;
  tur?: 'calismiyor' | 'eksik' | 'yanlis-bolum' | 'donuk';
}

interface KuyrukKaydi extends BildirimGirdisi {
  zaman: number;
}

/** API adresi tanımlı mı? Değilse bildirim yalnızca yerelde kalır. */
export function bildirimAcik(): boolean {
  return TABAN.length > 0;
}

function kuyrukOku(): KuyrukKaydi[] {
  if (typeof window === 'undefined') return [];
  try {
    const ham = window.localStorage.getItem(KUYRUK_ANAHTARI);
    if (!ham) return [];
    const veri = JSON.parse(ham);
    return Array.isArray(veri) ? (veri as KuyrukKaydi[]) : [];
  } catch {
    return [];
  }
}

function kuyrukYaz(kayitlar: KuyrukKaydi[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KUYRUK_ANAHTARI, JSON.stringify(kayitlar.slice(0, KUYRUK_SINIRI)));
  } catch {
    /* kota dolu ya da gizli sekme — bildirim yerelde kalır */
  }
}

let dinleyiciKuruldu = false;

/** Çevrimiçi olunca kuyruğu boşaltmayı dene (yalnızca bir kez kurulur). */
function cevrimiciDinle(): void {
  if (dinleyiciKuruldu || typeof window === 'undefined') return;
  dinleyiciKuruldu = true;
  window.addEventListener('online', () => {
    void kuyrukGonder();
  });
}

/**
 * Kuyruktaki bildirimleri sırayla gönderir; başarılıları kuyruktan düşer.
 * Kapalıysa (API yok) hemen döner. Hata durumunda kuyruk korunur.
 */
export async function kuyrukGonder(): Promise<{ gonderilen: number; kalan: number }> {
  if (!bildirimAcik()) return { gonderilen: 0, kalan: kuyrukOku().length };
  const kuyruk = kuyrukOku();
  if (!kuyruk.length) return { gonderilen: 0, kalan: 0 };

  let gonderilen = 0;
  const kalanlar: KuyrukKaydi[] = [];
  for (let i = 0; i < kuyruk.length; i++) {
    const kayit = kuyruk[i];
    // Ağ hatasında ve 429'da dur: sıradakiler de büyük olasılıkla düşer.
    try {
      const yanit = await fetch(`${TABAN}/bildirim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: kayit.url,
          anime: kayit.anime ?? undefined,
          bolum: kayit.bolum ?? undefined,
          tur: kayit.tur ?? 'calismiyor',
        }),
        keepalive: true,
      });
      if (yanit.ok || yanit.status === 400 || yanit.status === 409) {
        gonderilen++; // 400: kalıcı geçersiz kayıt — kuyrukta tutmanın anlamı yok
        continue;
      }
      if (yanit.status === 429 || yanit.status >= 500) {
        kalanlar.push(kayit, ...kuyruk.slice(i + 1));
        break;
      }
      kalanlar.push(kayit);
    } catch {
      kalanlar.push(kayit, ...kuyruk.slice(i + 1));
      break;
    }
  }

  kuyrukYaz(kalanlar);
  return { gonderilen, kalan: kalanlar.length };
}

/**
 * Bildirimi kuyruğa ekler ve göndermeyi dener. Ağ yoksa kayıt kaybolmaz;
 * bir sonraki çağrıda ya da `online` olayında iletilir.
 */
export function bildirimGonder(girdi: BildirimGirdisi): void {
  if (!bildirimAcik() || typeof window === 'undefined') return;
  if (!girdi.url || !/^https?:/i.test(girdi.url)) return;

  const kayit: KuyrukKaydi = {
    url: girdi.url,
    anime: girdi.anime ?? null,
    bolum: girdi.bolum ?? null,
    tur: girdi.tur ?? 'calismiyor',
    zaman: Date.now(),
  };
  const kuyruk = kuyrukOku();
  const kimlik = (k: KuyrukKaydi) => `${k.url}|${k.anime ?? ''}|${k.bolum ?? ''}`;
  if (!kuyruk.some((k) => kimlik(k) === kimlik(kayit))) kuyrukYaz([...kuyruk, kayit]);
  cevrimiciDinle();
  void kuyrukGonder();
}
