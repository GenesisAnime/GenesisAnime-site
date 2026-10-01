'use client';
/**
 * kanca.ts — depo (store) verisini React bileşenlerine bağlayan kancalar
 *
 * useSyncExternalStore kullanılır: sunucu render'ında (statik HTML) boş durum,
 * tarayıcıda gerçek durum gösterilir. Hidrasyon uyuşmazlığını önlemek için
 * `baglandi` bayrağı ile ilk render'da daima boş değer dönülür.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { IlerlemeKaydi, ListeKaydi } from '../tipler';
import {
  VARSAYILAN_TERCIH,
  abone,
  calismayanlar,
  ilerlemeHaritasi,
  ilerlemeListesi,
  izlenenHaritasi,
  liste,
  tercihler,
  type Tercihler,
} from './yerel';
import { oturum, oturumAbone, senkronAbone, senkronDurumu, type Oturum, type SenkronDurumu } from './api';

const BOS_ILERLEME: IlerlemeKaydi[] = [];
const BOS_LISTE: ListeKaydi[] = [];
const BOS_HARITA: Record<string, IlerlemeKaydi> = {};
const BOS_IZLENEN: Record<string, number> = {};
const BOS_CALISMAYAN: string[] = [];

/** Bileşen tarayıcıya bağlandı mı (hidrasyon tamamlandı mı)? */
export function useBaglandi(): boolean {
  const [baglandi, setBaglandi] = useState(false);
  useEffect(() => setBaglandi(true), []);
  return baglandi;
}

export function useIlerlemeListesi(): IlerlemeKaydi[] {
  const baglandi = useBaglandi();
  const veri = useSyncExternalStore(
    abone,
    () => (baglandi ? ilerlemeListesi() : BOS_ILERLEME),
    () => BOS_ILERLEME
  );
  return veri;
}

export function useIlerlemeHaritasi(): Record<string, IlerlemeKaydi> {
  const baglandi = useBaglandi();
  return useSyncExternalStore(
    abone,
    () => (baglandi ? ilerlemeHaritasi() : BOS_HARITA),
    () => BOS_HARITA
  );
}

export function useListe(): ListeKaydi[] {
  const baglandi = useBaglandi();
  return useSyncExternalStore(
    abone,
    () => (baglandi ? liste() : BOS_LISTE),
    () => BOS_LISTE
  );
}

export function useIzlenenler(): Record<string, number> {
  const baglandi = useBaglandi();
  return useSyncExternalStore(
    abone,
    () => (baglandi ? izlenenHaritasi() : BOS_IZLENEN),
    () => BOS_IZLENEN
  );
}

export function useTercihler(): Tercihler {
  const baglandi = useBaglandi();
  return useSyncExternalStore(
    abone,
    () => (baglandi ? tercihler() : VARSAYILAN_TERCIH),
    () => VARSAYILAN_TERCIH
  );
}

export function useCalismayanlar(): string[] {
  const baglandi = useBaglandi();
  return useSyncExternalStore(
    abone,
    () => (baglandi ? calismayanlar() : BOS_CALISMAYAN),
    () => BOS_CALISMAYAN
  );
}

/** İzlemeye devam et kartları için: en son izlenen N kayıt. */
export function useSonIzlenenler(sinir = 20): IlerlemeKaydi[] {
  const tumu = useIlerlemeListesi();
  return tumu.slice(0, sinir);
}

/** Belirli bir anime listede mi? */
export function useListede(slug: string): boolean {
  const kayitlar = useListe();
  return kayitlar.some((k) => k.slug === slug);
}

/** Açık oturum (hesap) bilgisi; yoksa null. */
export function useOturum(): Oturum | null {
  const baglandi = useBaglandi();
  return useSyncExternalStore(
    oturumAbone,
    () => (baglandi ? oturum() : null),
    () => null
  );
}

/** Senkron durumu (kapalı/bekliyor/aktif/hata) — hesap sayfası gösterir. */
export function useSenkronDurumu(): SenkronDurumu {
  const baglandi = useBaglandi();
  return useSyncExternalStore(
    senkronAbone,
    () => (baglandi ? senkronDurumu() : { durum: 'kapali', eposta: null, sonZaman: null, hata: null }),
    () => senkronDurumu()
  );
}
