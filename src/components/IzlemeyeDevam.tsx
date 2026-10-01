'use client';
/** IzlemeyeDevam.tsx — tarayıcıda kayıtlı son izlenen bölümler (hesapsız çalışır) */
import Satir from './Satir';
import Kart from './Kart';
import { useSonIzlenenler } from '@/lib/depo/kanca';
import { tarihBicim } from '@/lib/bicim';

export default function IzlemeyeDevam() {
  const kayitlar = useSonIzlenenler(20);
  if (kayitlar.length === 0) return null;

  return (
    <Satir baslik="İzlemeye devam et" tumuHref="/listem/">
      {kayitlar.map((k) => (
        <Kart
          key={k.slug}
          slug={k.slug}
          ad={k.ad}
          poster={k.poster}
          yil={null}
          puan={null}
          format={null}
          hedef={`/izle/?a=${encodeURIComponent(k.slug)}&b=${k.bolum}`}
          altBilgi={`${k.bolumAdi || `${k.bolum}. bölüm`} · ${tarihBicim(k.zaman)}`}
        />
      ))}
    </Satir>
  );
}
