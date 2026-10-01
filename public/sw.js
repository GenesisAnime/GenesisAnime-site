/*
 * sw.js — GenesisAnime servis çalışanı (PWA çevrimdışı iskelet)
 * ============================================================
 * Strateji:
 *   · statik varlıklar (_next/static, ikonlar, veri JSON'ları) → cache-first
 *   · sayfa gezinmeleri (HTML)                                  → network-first,
 *     çevrimdışıysa önbellekteki son sürüm
 *
 * Sürüm numarası elle artırılır; eski önbellekler activate'ta silinir.
 * Veri JSON'ları küçüktür (anime başına birkaç KB) ve sayfa başına önbellek
 * sınırsız büyümesin diye önbellek 90 girdiyle sınırlanır.
 */
const SURUM = 'genesisanime-v1';
const SINIR = 90;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (olay) => {
  olay.waitUntil(
    (async () => {
      const adlar = await caches.keys();
      await Promise.all(adlar.filter((a) => a !== SURUM).map((a) => caches.delete(a)));
      await self.clients.claim();
    })()
  );
});

async function sinirla(onek) {
  const onbellek = await caches.open(SURUM);
  const anahtarlar = await onbellek.keys();
  if (anahtarlar.length <= SINIR) return;
  const silinecek = anahtarlar.filter((k) => k.url.includes(onek)).slice(0, anahtarlar.length - SINIR);
  await Promise.all(silinecek.map((k) => onbellek.delete(k)));
}

async function onceOnbellek(istek) {
  const onbellek = await caches.open(SURUM);
  const bulunan = await onbellek.match(istek);
  if (bulunan) return bulunan;
  const yanit = await fetch(istek);
  if (yanit && yanit.ok && yanit.type === 'basic') {
    await onbellek.put(istek, yanit.clone());
    sinirla('/data/');
  }
  return yanit;
}

async function onceAg(istek) {
  const onbellek = await caches.open(SURUM);
  try {
    const yanit = await fetch(istek);
    if (yanit && yanit.ok && yanit.type === 'basic') await onbellek.put(istek, yanit.clone());
    return yanit;
  } catch {
    const bulunan = await onbellek.match(istek, { ignoreSearch: true });
    if (bulunan) return bulunan;
    const kapak = await onbellek.match(new URL('./', self.registration.scope).href);
    if (kapak) return kapak;
    throw new Error('çevrimdışı ve önbellekte kopya yok');
  }
}

self.addEventListener('fetch', (olay) => {
  const istek = olay.request;
  if (istek.method !== 'GET') return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;

  const statik =
    url.pathname.includes('/_next/static/') ||
    url.pathname.includes('/ikon/') ||
    url.pathname.includes('/data/') ||
    /\.(png|svg|jpg|jpeg|webp|ico|woff2?|css|js)$/.test(url.pathname);

  if (statik) olay.respondWith(onceOnbellek(istek));
  else if (istek.mode === 'navigate' || istek.destination === 'document') olay.respondWith(onceAg(istek));
});
