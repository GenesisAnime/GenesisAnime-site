'use client';
/**
 * api.ts — hesap ve senkron sürücüsü (Faz 5)
 * ==========================================
 * Yerel sürücü (`yerel.ts`) her zaman kaynak ve tek gerçek deposu olmaya devam
 * eder; site çevrimdışıyken de aynen çalışır. Bu modül yalnızca iki şey ekler:
 *
 *   1. Hesap: kayıt/giriş/çıkış + KVKK (veri indirme, hesap silme).
 *   2. Senkron: oturum varsa yerel durum ile sunucu kopyası birleştirilir
 *      ("en yeni kazanır" — bkz. durum-birlestir.mjs) ve değişiklikler
 *      gecikmeli (debounce) olarak sunucuya itilir.
 *
 * API adresi `NEXT_PUBLIC_API` ile verilir; boşsa modül tamamen kapalıdır
 * (bugünkü yerel-öncelikli davranış aynen sürer, hiçbir istek atılmaz).
 */
import { abone, durumTemizle, durumYaz, tumDurum } from './yerel';
import { durumBirlestir, durumNormalize, type DurumVerisi } from './durum-birlestir.mjs';

const TABAN = (process.env.NEXT_PUBLIC_API || '').replace(/\/$/, '');
const OTURUM_ANAHTARI = 'genesisanime:v1:oturum';
const SENKRON_GECIKMESI = 3000;

export interface Oturum {
  jeton: string;
  yenileme: string;
  eposta: string;
}

export interface ApiSonuc {
  ok: boolean;
  hata?: string;
  [alan: string]: unknown;
}

/** API adresi tanımlı mı? Değilse hesap/senkron arayüzü bilgilendirme gösterir. */
export function apiAcik(): boolean {
  return TABAN.length > 0;
}

/* ------------------------------ oturum deposu ------------------------------ */

let oturumOnbellek: Oturum | null | undefined;
const oturumDinleyiciler = new Set<() => void>();

function oturumBayatlat(): void {
  oturumOnbellek = undefined;
  for (const d of oturumDinleyiciler) d();
}

/** Oturum bilgisi; `useSyncExternalStore` için aynı referans döner. */
export function oturum(): Oturum | null {
  if (oturumOnbellek !== undefined) return oturumOnbellek;
  if (typeof window === 'undefined') return null;
  try {
    const ham = window.localStorage.getItem(OTURUM_ANAHTARI);
    const veri = ham ? (JSON.parse(ham) as Partial<Oturum>) : null;
    oturumOnbellek =
      veri && typeof veri.jeton === 'string' && typeof veri.yenileme === 'string'
        ? { jeton: veri.jeton, yenileme: veri.yenileme, eposta: String(veri.eposta || '') }
        : null;
  } catch {
    oturumOnbellek = null;
  }
  return oturumOnbellek;
}

export function oturumAbone(dinleyici: () => void): () => void {
  oturumDinleyiciler.add(dinleyici);
  return () => oturumDinleyiciler.delete(dinleyici);
}

function oturumKaydet(yeni: Oturum | null): void {
  if (typeof window !== 'undefined') {
    try {
      if (yeni) window.localStorage.setItem(OTURUM_ANAHTARI, JSON.stringify(yeni));
      else window.localStorage.removeItem(OTURUM_ANAHTARI);
    } catch {
      /* gizli sekme */
    }
  }
  oturumBayatlat();
}

/* ------------------------------ senkron durumu ------------------------------ */

export interface SenkronDurumu {
  durum: 'kapali' | 'bekliyor' | 'aktif' | 'hata';
  eposta: string | null;
  sonZaman: number | null;
  hata: string | null;
}

let senkronOnbellek: SenkronDurumu = { durum: 'kapali', eposta: null, sonZaman: null, hata: null };
const senkronDinleyiciler = new Set<() => void>();

function senkronAyarla(degisiklik: Partial<SenkronDurumu>): void {
  senkronOnbellek = { ...senkronOnbellek, ...degisiklik };
  for (const d of senkronDinleyiciler) d();
}

export function senkronDurumu(): SenkronDurumu {
  return senkronOnbellek;
}

export function senkronAbone(dinleyici: () => void): () => void {
  senkronDinleyiciler.add(dinleyici);
  return () => senkronDinleyiciler.delete(dinleyici);
}

/* ------------------------------- HTTP katmanı ------------------------------- */

interface IstekAyari {
  yontem?: string;
  govde?: unknown;
  jeton?: string | null;
  /** 401 gelirse yenileme jetonuyla bir kez daha dene (varsayılan: evet). */
  yenile?: boolean;
}

async function hamIstek(yol: string, ayar: IstekAyari = {}): Promise<Response> {
  return fetch(`${TABAN}${yol}`, {
    method: ayar.yontem || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(ayar.jeton ? { Authorization: `Bearer ${ayar.jeton}` } : {}),
    },
    body: ayar.govde === undefined ? undefined : JSON.stringify(ayar.govde),
  });
}

/** Yenileme jetonuyla yeni erişim jetonu alır (tek kullanımlık yenileme). */
async function jetonYenile(): Promise<boolean> {
  const mevcut = oturum();
  if (!mevcut) return false;
  try {
    const yanit = await hamIstek('/auth/yenile', { yontem: 'POST', govde: { yenileme: mevcut.yenileme } });
    if (!yanit.ok) {
      if (yanit.status === 401) oturumKaydet(null);
      return false;
    }
    const veri = (await yanit.json()) as Partial<Oturum>;
    if (!veri.jeton || !veri.yenileme) return false;
    oturumKaydet({ jeton: veri.jeton, yenileme: veri.yenileme, eposta: veri.eposta || mevcut.eposta });
    return true;
  } catch {
    return false;
  }
}

async function istek(yol: string, ayar: IstekAyari = {}): Promise<ApiSonuc> {
  if (!apiAcik()) return { ok: false, hata: 'api-kapali' };
  const mevcut = oturum();
  try {
    let yanit = await hamIstek(yol, { ...ayar, jeton: ayar.jeton ?? mevcut?.jeton ?? null });
    if (yanit.status === 401 && (ayar.yenile ?? true) && mevcut && (await jetonYenile())) {
      yanit = await hamIstek(yol, { ...ayar, jeton: oturum()?.jeton ?? null });
    }
    let govde: Record<string, unknown> = {};
    try {
      govde = (await yanit.json()) as Record<string, unknown>;
    } catch {
      govde = {};
    }
    if (!yanit.ok) return { ok: false, hata: String(govde.hata || `http-${yanit.status}`), ...govde };
    return { ok: true, ...govde };
  } catch {
    return { ok: false, hata: 'ag-hatasi' };
  }
}

/* --------------------------------- hesaplar --------------------------------- */

export async function kayitOl(eposta: string, parola: string): Promise<ApiSonuc> {
  const sonuc = await istek('/auth/kayit', { yontem: 'POST', govde: { eposta, parola }, jeton: null, yenile: false });
  if (sonuc.ok && sonuc.jeton && sonuc.yenileme) {
    oturumKaydet({ jeton: String(sonuc.jeton), yenileme: String(sonuc.yenileme), eposta: String(sonuc.eposta || eposta) });
  }
  return sonuc;
}

export async function girisYap(eposta: string, parola: string): Promise<ApiSonuc> {
  const sonuc = await istek('/auth/giris', { yontem: 'POST', govde: { eposta, parola }, jeton: null, yenile: false });
  if (sonuc.ok && sonuc.jeton && sonuc.yenileme) {
    oturumKaydet({ jeton: String(sonuc.jeton), yenileme: String(sonuc.yenileme), eposta: String(sonuc.eposta || eposta) });
  }
  return sonuc;
}

export async function cikisYap(): Promise<void> {
  const mevcut = oturum();
  if (mevcut && apiAcik()) await istek('/auth/cikis', { yontem: 'POST', govde: { yenileme: mevcut.yenileme }, yenile: false });
  oturumKaydet(null);
  senkronAyarla({ durum: apiAcik() ? 'bekliyor' : 'kapali', eposta: null, hata: null });
}

/* ---------------------------------- senkron ---------------------------------- */

let sunucuSurum = 0;
let zamanlayici: ReturnType<typeof setTimeout> | null = null;
let senkronAktif = false;
let durdurAbone: (() => void) | null = null;

async function sunucuDurumCek(): Promise<{ veri: DurumVerisi; surum: number } | null> {
  const sonuc = await istek('/me/durum');
  if (!sonuc.ok) return null;
  sunucuSurum = Number(sonuc.surum || 0);
  return { veri: durumNormalize(sonuc.veri ?? {}), surum: sunucuSurum };
}

/**
 * Yerel durumu sunucuya iter. Sürüm çakışırsa (başka cihaz yazdıysa) sunucuyu
 * yeniden çeker, birleştirir ve bir kez daha dener.
 */
async function sunucuyaIt(): Promise<boolean> {
  const mevcut = oturum();
  if (!mevcut) return false;
  const yerel = durumNormalize(tumDurum());
  let sonuc = await istek('/me/durum', { yontem: 'PUT', govde: { veri: yerel, surum: sunucuSurum } });
  if (sonuc.ok) {
    sunucuSurum = Number(sonuc.surum || sunucuSurum + 1);
    senkronAyarla({ durum: 'aktif', eposta: mevcut.eposta, sonZaman: Date.now(), hata: null });
    return true;
  }
  if (sonuc.hata === 'cakisma' || sonuc.surum !== undefined) {
    const uzak = await sunucuDurumCek();
    if (!uzak) return false;
    const b = durumBirlestir(yerel, uzak.veri);
    if (b.degisti) durumYaz(b.veri);
    sonuc = await istek('/me/durum', { yontem: 'PUT', govde: { veri: b.veri, surum: uzak.surum } });
    if (sonuc.ok) {
      sunucuSurum = Number(sonuc.surum || uzak.surum + 1);
      senkronAyarla({ durum: 'aktif', eposta: mevcut.eposta, sonZaman: Date.now(), hata: null });
      return true;
    }
  }
  senkronAyarla({ durum: 'hata', eposta: mevcut.eposta, hata: sonuc.hata || 'senkron-hatasi' });
  return false;
}

/** Oturum açıldığında/ilk yüklemede: sunucuyu çek, birleştir, geri it. */
export async function senkronBaslat(): Promise<boolean> {
  if (!apiAcik() || !oturum()) return false;
  const uzak = await sunucuDurumCek();
  if (!uzak) {
    senkronAyarla({ durum: 'hata', eposta: oturum()?.eposta ?? null, hata: 'sunucuya-ulasilamadi' });
    return false;
  }
  const b = durumBirlestir(tumDurum(), uzak.veri);
  if (b.degisti) durumYaz(b.veri);
  return sunucuyaIt();
}

/**
 * Senkron döngüsünü başlatır (idempotent). Yerel değişiklikler gecikmeli olarak
 * sunucuya itilir; `online` olayında ve sekme görünür olduğunda bir kez denenir.
 * Dönen fonksiyon döngüyü durdurur (bileşen kaldırıldığında).
 */
export function senkronDongusu(): () => void {
  if (!apiAcik()) {
    senkronAyarla({ durum: 'kapali' });
    return () => {};
  }
  if (senkronAktif) return () => senkronDurdur();
  senkronAktif = true;

  const tetikle = () => {
    if (!oturum()) return;
    if (zamanlayici) clearTimeout(zamanlayici);
    zamanlayici = setTimeout(() => void sunucuyaIt(), SENKRON_GECIKMESI);
  };

  durdurAbone = abone(tetikle);
  const cevrimici = () => void sunucuyaIt();
  const gorunurluk = () => {
    if (document.visibilityState === 'visible') cevrimici();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', cevrimici);
    document.addEventListener('visibilitychange', gorunurluk);
  }
  senkronAyarla({ durum: 'bekliyor', eposta: oturum()?.eposta ?? null, hata: null });
  if (oturum()) void senkronBaslat();

  return () => senkronDurdur();
}

function senkronDurdur(): void {
  senkronAktif = false;
  if (zamanlayici) clearTimeout(zamanlayici);
  zamanlayici = null;
  if (durdurAbone) durdurAbone();
  durdurAbone = null;
}

/* ----------------------------------- KVKK ----------------------------------- */

/** KVKK veri indirme: yerel kopya + (oturum varsa) sunucu kopyası. */
export async function veriPaketi(): Promise<Record<string, unknown>> {
  const mevcut = oturum();
  let sunucu: unknown = null;
  if (mevcut && apiAcik()) {
    const sonuc = await istek('/me/veri');
    if (sonuc.ok) sunucu = sonuc.durum ?? {};
  }
  return {
    uretim: new Date().toISOString(),
    eposta: mevcut?.eposta ?? null,
    yerel: tumDurum(),
    sunucu,
  };
}

/** KVKK hesap silme: sunucu kaydını siler, ardından yerel durumu temizler. */
export async function hesapSil(): Promise<ApiSonuc> {
  const mevcut = oturum();
  if (!mevcut) return { ok: false, hata: 'oturum-yok' };
  const sonuc = await istek('/me', { yontem: 'DELETE', yenile: false });
  if (!sonuc.ok) return sonuc;
  oturumKaydet(null);
  durumTemizle();
  senkronAyarla({ durum: 'bekliyor', eposta: null, sonZaman: Date.now(), hata: null });
  return { ok: true };
}

/** Yerel kopyayı indirilebilir JSON'a çevirir (dosya adı ve içerik). */
export function indirmePaketi(paket: Record<string, unknown>): { ad: string; metin: string } {
  const gun = new Date().toISOString().slice(0, 10);
  return { ad: `genesisanime-verilerim-${gun}.json`, metin: JSON.stringify(paket, null, 2) };
}
