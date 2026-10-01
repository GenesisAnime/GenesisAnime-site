# 01 · Mimari

> Son güncelleme: 2026-10-01

## Tam resim

```
┌──────────────────────────── GİRDİLER (salt okunur) ────────────────────────────┐
│                                                                                │
│  ../../Yeni turkanimetv arsiv/güncel database/turkanime-v1 - güncel database.db │
│      anime 6.107 · bolum 71.694 · link 317.146 · anime_meta 6.085              │
│      ta_episode_fansub 112.541 · ta_fansub_group 356                           │
│                                                                                │
│  ../../Linkleri tespit etme araçları/kontrol_gecmisi.jsonl   (4.378 kayıt)     │
│  AniList GraphQL  ──(tools/cache/anilist/*.json, 8,31 MB)──┐                   │
└────────────────────────────────────────────────────────────┼───────────────────┘
                                                             │
              tools/export-data.mjs  ◄──────────────────────┘
              (node:sqlite — bağımlılık yok, ~9 sn)
                       │
                       ├─→ public/data/katalog.json        1,77 MB  (6.107 satır, kolon dizisi)
                       ├─→ public/data/anime/<slug>.json   44,8 MB  (6.107 dosya, ort. 7,5 KB)
                       ├─→ public/data/ana-sayfa.json       319 KB  (24 hero + 18 satır)
                       ├─→ public/data/taksonomi.json      19,8 KB
                       ├─→ public/data/fansublar.json      (grup → yapım dizini, slug'lı)
                       ├─→ public/data/seriler.json        (961 franchise grubu / 3.244 yapım)
                       ├─→ public/data/kunye.json / saglik.json
                       └─→ tools/rapor/veri-raporu.{md,json}

              src/ (Next.js 15 App Router, output: 'export')
                       │
                       └─→ npm run build ─→ out/   865,2 MB · 21.043 dosya
                                            └─→ GitHub Pages (asıl hedef); CF Pages 20k sınırını aştı

              api/ (Cloudflare Workers + D1)  ◄──isteğe bağlı, site onsuz da tam çalışır
                       ├─→ /bildirim   kullanıcı bildirimi (tarama önceliği)
                       ├─→ /auth/*     kayıt · giriş · yenile · çıkış
                       └─→ /me/*       senkron blob + KVKK (indir/sil)
```

## Katmanlar ve sorumluluklar

### 1. Veri hattı — `tools/`

| Dosya | Sorumluluk |
|---|---|
| `tools/lib/ortak.mjs` | Yol çözümleme, Türkçe normalizasyon, tür eşleme, link sağlığı okuma, metin temizleme |
| `tools/export-data.mjs` | Tüm site verisini üretir (7 aşamalı, kendi kendini raporlar) |
| `tools/enrich-anilist.mjs` | AniList GraphQL zenginleştirmesi (toplu istek, 700 ms aralık, parça önbelleği) |
| `tools/yayin-hazirla.mjs` | `.nojekyll` + çıktı ölçümü + host limit kontrolü |
| `tools/simge-uret.mjs` | Bağımlılıksız PNG üreteci: OG kartı + PWA ikonları (zlib/CRC32) |
| `tools/bildirim-cek.mjs` | Worker'daki kullanıcı bildirimlerini `tools/cache/bildirim.jsonl`'e aktarır |

Tasarım kararları:
- **Sıfır bağımlılık.** SQLite erişimi Node 22+ `node:sqlite` ile yapılır; `better-sqlite3` gibi
  derleme gerektiren paket yok. `fetch` zaten yerleşik.
- **Yeniden çalıştırılabilir.** Her üreteç idempotent; AniList çağrıları parça bazında önbelleklenir
  (`tools/cache/anilist/<ilk>-<son>.json`), yarıda kesilirse kaldığı yerden devam eder.
- **Kendi raporunu yazar.** Her koşu `tools/rapor/veri-raporu.md` üretir; belgelerdeki sayılar bu
  raporlardan gelir.

### 2. Veri katmanı — `public/data/` (üretilmiş, sürüm kontrolünde)

| Dosya | Boyut | Tüketici |
|---|---|---|
| `katalog.json` | 1,77 MB | `/kesfet/`, `/ara/`, grup dizini (istemci, tembel) |
| `anime/<slug>.json` | 6.107 dosya · 44,8 MB | Yalnızca `/izle/` (tek dosya, istek üzerine) |
| `ana-sayfa.json` | 319 KB | Yalnızca build zamanı (istemciye gitmez) |
| `taksonomi.json` | 19,8 KB | `/kesfet/` filtreler, `/fansublar/`, oynatıcı güvenilirlik çubukları |
| `fansublar.json` | grup dizini | `/fansublar/` (grup seçilince indirilir), `/fansub/<slug>/` |
| `seriler.json` | 961 grup | `/seriler/` (indeks) ve `/seri/<slug>/` (derleme zamanı) |
| `kunye.json`, `saglik.json` | küçük | `/kunye/`, alt bilgi |

`katalog.json` **kolon dizisi** biçimindedir (nesne değil): 6.107 kayıtta anahtar adlarını
tekrarlamamak ~370 KB tasarruf sağlar. Kolon sırası `src/lib/veri.ts` içindeki `KOLON` sabiti ve
`src/lib/tipler.ts` içindeki `KatalogSatiri` tipiyle sözleşmeye bağlanmıştır.

### 3. Site — `src/`

```
src/app/
  layout.tsx            kök yerleşim (üst bar, alt bilgi, mobil menü, erken hata kaydedici)
  page.tsx              ana sayfa (sunucu bileşeni; ana-sayfa.json'u build zamanı okur)
  kesfet/page.tsx       kabuk (Suspense) + KesfetIstemci
  ara/page.tsx          kabuk (Suspense) + AraIstemci
  anime/[slug]/page.tsx 6.107 ön-render detay sayfası (generateStaticParams, dynamicParams=false)
  izle/page.tsx         statik kabuk + IzleIstemci (adres çubuğundan a= ve b=)
  listem/page.tsx       istemci (tarayıcı deposu)
  fansublar/page.tsx    sunucu kabuk + FansubIstemci
  fansub/[slug]/page.tsx  363 fansub profil sayfası (grup katkısı + katalog)
  seriler/page.tsx      seri (franchise) indeksi (961 grup)
  seri/[slug]/page.tsx 961 kronolojik seri sayfası
  hesap/page.tsx        hesap + KVKK (API kapalıyken yerel-öncelikli bilgilendirme)
  kunye/page.tsx        sunucu (ölçüm tabloları)
  manifest.ts           PWA bildirgesi (BASE_PATH'e duyarlı)
  sitemap.ts robots.ts  metadata rotaları (statik export'ta dosya olarak üretilir)
  not-found.tsx         404.html
src/components/         UstBar, Hero, Satir, Kart, BolumListesi, IzleIstemci, Ikon, …
src/lib/
  veri.ts               build zamanı veri okuma (yalnızca sunucu)
  bicim.ts              biçimlendirme + Türkçe normalizasyon (istemci+sunucu)
  tipler.ts             veri sözleşmeleri
  yollar.ts             basePath uyumlu yol yardımcıları
  istemci/katalog.ts    katalog tembel yükleme + arama/filtre motoru
  depo/yerel.ts         localStorage sürücüsü (kişisel durum)
  depo/kanca.ts         React kancaları (useSyncExternalStore)
  depo/api.ts           hesap + senkron sürücüsü (yerel deponun yanında çalışır)
  depo/durum-birlestir.mjs  yerel/sunucu durum birleştirmesi (saf JS, test edilir)
  bildirim.ts           "kaynak çalışmıyor" bildirim kuyruğu (API'siz no-op)
public/sw.js            servis çalışanı (statik + veri cache-first, HTML network-first)
```

### 4. Kişisel durum — `src/lib/depo/`

Sitenin tüm "kullanıcıya ait" durumu tek modülden geçer:

| Anahtar | İçerik |
|---|---|
| `genesisanime:v1:ilerleme` | anime başına son bölüm + sayfada geçirilen süre |
| `genesisanime:v1:izlenen` | `slug\|bölüm` → zaman damgası |
| `genesisanime:v1:listem` | izleme listesi |
| `genesisanime:v1:tercih` | otomatik sonraki, kaynak tercihi, doğrulanmış önceliği, görünüm |
| `genesisanime:v1:calismayan` | kullanıcının "çalışmıyor" dediği URL'ler |

**Neden bu katman var:** Hesap servisi (`api/`) bu katmanın **yanında** çalışır; yerel depo tek
gerçek kaynak olmaya devam eder, çevrimdışı davranış bozulmaz. Oturum açıldığında
`depo/api.ts` sunucu kopyasını çeker, `durum-birlestir.mjs` ile birleştirir ("en yeni kazanır") ve
geri iter; değişiklikler 3 sn gecikmeyle gönderilir. Ayrıntı: `docs/11-hesaplar-uygulama.md`.

## Kritik teknik kararlar

| Konu | Karar | Gerekçe |
|---|---|---|
| Render modeli | `output: 'export'` (tam statik) | Sunucu maliyeti yok, ücretsiz host, ölçeklenir |
| Ön-render kapsamı | Yalnızca 6.107 anime sayfası | Bölüm sayfaları 71.694 HTML üretirdi (GB'lar); tek `?a=&b=` kabuğu yeterli |
| Bölüm listesi verisi | İstemciye `BolumOzet[]` (bölüm başına ~80 B) | Tüm `Anime` nesnesi serileştiğinde sayfa boyutu 512 KB'a çıkıyordu |
| Liste SSR sınırı | İlk 100 bölüm | One Piece (1.100+ bölüm) DOM'unu ve HTML'i sınırlar |
| Katalog biçimi | Kolon dizisi, tek dosya | Tek istek, ~370 KB daha küçük |
| Kişisel durum | localStorage | Hesapsız çalışır; API sürücüsü yanında eklenir, yerel kopya korunur |
| Ek CSS çatısı | Yok — el yazımı tasarım sistemi | Bağımlılık azaltma, tam kontrol (ADR-0002) |
| Hesap servisi | Cloudflare Workers + D1 (`api/`) | Statik önyüz host'u değişmez; `api/` ayrı paket, kök bağımlılık artmaz |
| Parola/jeton | PBKDF2-HMAC-SHA256 + opak taşıyıcı jeton | Workers'ta argon2 yok; çerez cross-origin'de kırılgan (ADR-0008) |

## Sınırlar ve varsayımlar

- `public/data/` **depoda tutulur** çünkü veri hattı 70 MB'lık arşiv SQLite dosyasını gerektirir ve
  o dosya depoda değildir. CI bu yüzden yalnızca `npm run build` yapar (ADR-0004).
- Derin bağlantı adresi `/izle/?a=<slug>&b=<n>` biçimindedir; `/izle/<slug>/<n>` gibi yol tabanlı
  adresler statik export'ta 71 bin dosya gerektirirdi (ADR-0005).
- `/izle/`, `/ara/` ve `/listem/` `noindex`'tir (ince/tekrar içerik) — ADR-0006.
