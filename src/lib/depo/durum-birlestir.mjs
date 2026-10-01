/**
 * durum-birlestir.mjs — yerel ve sunucu kullanıcı durumunun birleştirilmesi
 * ==========================================================================
 * Hesap açıldığında iki kopya olur: tarayıcıdaki (localStorage) ve sunucudaki.
 * Kural: **yerel kayıt her zaman kaynak**; birleştirmede alan alan "en yeni
 * kazanır" uygulanır. Böylece çevrimdışı kullanım bozulmaz, ikinci cihazda
 * açılan oturum da veri kaybettirmez.
 *
 * Neden ayrı ve düz JS? Bu mantık güvenlik açısından kritik (yanlış birleştirme
 * ilerleme/liste siler) ve `tools/testler/` ağsız Node testleriyle doğrulanıyor.
 * TypeScript tarafı tipleri `durum-birlestir.d.mts` dosyasından alır.
 */

const YEDEK = () => ({ ilerleme: {}, izlenen: {}, listem: [], tercih: {}, calismayan: [] });

/** Bilinmeyen girdiyi beklenen biçime indirger (bozuk JSON'a karşı dayanıklı). */
export function durumNormalize(ham) {
  const d = ham && typeof ham === 'object' ? ham : {};
  return {
    ilerleme: d.ilerleme && typeof d.ilerleme === 'object' && !Array.isArray(d.ilerleme) ? d.ilerleme : {},
    izlenen: d.izlenen && typeof d.izlenen === 'object' && !Array.isArray(d.izlenen) ? d.izlenen : {},
    listem: Array.isArray(d.listem) ? d.listem.filter((k) => k && typeof k === 'object' && typeof k.slug === 'string') : [],
    tercih: d.tercih && typeof d.tercih === 'object' && !Array.isArray(d.tercih) ? d.tercih : {},
    calismayan: Array.isArray(d.calismayan) ? d.calismayan.filter((u) => typeof u === 'string') : [],
  };
}

const sayi = (x) => (Number.isFinite(x) ? Number(x) : 0);

/**
 * İki durumu birleştirir. Dönen `degisti`, birleşik hâlin yerelden farklı olup
 * olmadığını söyler (gereksiz yazma/senkron turunu önler).
 */
export function durumBirlestir(yerelHam, uzakHam) {
  const yerel = durumNormalize(yerelHam);
  const uzak = durumNormalize(uzakHam);

  /* ilerleme: aynı anime için daha yeni `zaman` kazanır */
  const ilerleme = { ...uzak.ilerleme };
  for (const [slug, kayit] of Object.entries(yerel.ilerleme)) {
    const onceki = ilerleme[slug];
    if (!onceki || sayi(kayit && kayit.zaman) >= sayi(onceki.zaman)) ilerleme[slug] = kayit;
  }

  /* izlenen: `${slug}|${bolum}` → epoch ms; en yeni zaman kazanır */
  const izlenen = { ...uzak.izlenen };
  for (const [anahtar, zaman] of Object.entries(yerel.izlenen)) {
    if (!izlenen[anahtar] || sayi(zaman) >= sayi(izlenen[anahtar])) izlenen[anahtar] = zaman;
  }

  /* liste: slug başına tek kayıt; daha yeni `zaman` kazanır, sıralama yeniden */
  const listemHarita = new Map();
  for (const k of uzak.listem) listemHarita.set(k.slug, k);
  for (const k of yerel.listem) {
    const onceki = listemHarita.get(k.slug);
    if (!onceki || sayi(k.zaman) >= sayi(onceki.zaman)) listemHarita.set(k.slug, k);
  }
  const listem = [...listemHarita.values()].sort((a, b) => sayi(b.zaman) - sayi(a.zaman));

  /* tercihler: cihaz davranışı olduğu için yerel kazanır */
  const tercih = { ...uzak.tercih, ...yerel.tercih };

  /* çalışmayan kaynaklar: birleşim, yeniden sonra; 500 sınırı korunur */
  const calismayan = [];
  const gorulen = new Set();
  for (const url of [...yerel.calismayan, ...uzak.calismayan]) {
    if (gorulen.has(url)) continue;
    gorulen.add(url);
    calismayan.push(url);
    if (calismayan.length >= 500) break;
  }

  const veri = { ilerleme, izlenen, listem, tercih, calismayan };
  const degisti = JSON.stringify(veri) !== JSON.stringify(durumNormalize(yerelHam));
  return { veri, degisti };
}

/** Boş durum üretir (yeni hesap / hesap silme sonrası). */
export function bosDurum() {
  return YEDEK();
}
