/** @type {import('next').NextConfig} */

// Kök dizinde yerel geliştirme için boş bırakılır. İleride alt dizin dağıtımı seçilirse BASE_PATH verilir.
const basePath = process.env.BASE_PATH || '';

const nextConfig = {
  // Tamamen statik çıktı: sunucu yok, çıktı `out/` klasöründe.
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: {
    // Statik export'ta Next görsel optimizasyon sunucusu çalışmaz.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 's4.anilist.co' },
      { protocol: 'https', hostname: 'img.anili.st' },
    ],
  },
  eslint: { ignoreDuringBuilds: true },
  // public/ altındaki ham veriye yapılan fetch çağrıları için basePath'i istemciye taşı
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  experimental: {},
};

export default nextConfig;
