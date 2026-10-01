/** Tipler: durum-birlestir.mjs — bkz. o dosyadaki açıklama. */
import type { IlerlemeKaydi, ListeKaydi } from '../tipler';
import type { Tercihler } from './yerel';

export interface DurumVerisi {
  ilerleme: Record<string, IlerlemeKaydi>;
  izlenen: Record<string, number>;
  listem: ListeKaydi[];
  tercih: Partial<Tercihler>;
  calismayan: string[];
}

export function durumNormalize(ham: unknown): DurumVerisi;
export function durumBirlestir(yerel: unknown, uzak: unknown): { veri: DurumVerisi; degisti: boolean };
export function bosDurum(): DurumVerisi;
