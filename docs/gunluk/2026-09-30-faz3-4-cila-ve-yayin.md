# Günlük · 2026-09-30 · Faz 3–4 — Cila, SEO ve yayın

## 1. Yayın boyutu sorunu (H-3)

İlk ölçüm:

```
$ du -sh out
517M      dosya: 18.375      html: 6.116
1.7 MB  out/data/katalog.json
1.2 MB  out/sitemap.xml
0.9 MB  out/index.html
0.8 MB  out/anime/one-piece/index.html
0.5 MB  out/anime/one-piece/index.txt
```

**Kök neden:** `src/app/anime/[slug]/page.tsx` içinde `<BolumListesi anime={anime} />` çağrısı tam
`Anime` nesnesini istemci bileşenine prop olarak geçiyordu. Next.js istemci bileşenlerinin prop'larını
hem HTML'e hem RSC yüküne (`index.txt`) serileştirir; yani One Piece için 1.100+ bölüm ve tüm
kaynakları iki kez yazılıyordu.

**Düzeltme 1 — kompakt özet:**

```tsx
<BolumListesi slug={anime.slug} bolumler={anime.bolumler.map((b) => ({
  n: b.n, no: b.no, ad: b.ad, ks: b.ks,
  fansub: b.src[0]?.[1] ?? null, ekipSayisi: b.ekip.length,
}))} />
```

Bölüm başına ~2 KB yerine ~80 bayt aktarılıyor. ➜ **517 MB → 434 MB**

**Düzeltme 2 — SSR satır sınırı:** İlk 100 bölüm sunucuda render edilir, gerisi "bölüm daha göster"
düğmesiyle açılır (veri istemcide zaten var, ek istek yok). ➜ **434 MB → 392,46 MB**

```
$ npm run yayin:hazirla
   .nojekyll yazıldı
   dosya: 18377 · boyut: 392.46 MB
   anime sayfası: 6107 · 404.html: var
   GitHub Pages: uygun · Cloudflare Pages: uygun

$ ls -la out/anime/one-piece/index.html out/anime/naruto/index.html
   one-piece: 512 KB → 202 KB
   naruto   : 131 KB →  97 KB
```

## 2. SEO

| Öğe | Uygulama |
|---|---|
| `sitemap.xml` | 6.111 URL (4 sabit + 6.107 anime), 1,17 MB, `force-static` |
| `robots.txt` | `Disallow: /izle/ /ara/ /listem/`, sitemap referansı |
| JSON-LD | Anime sayfalarında `TVSeries`/`Movie` + `AggregateRating` + `numberOfEpisodes` |
| Meta | `title` şablonu, `description` (özetten 150 karakter), OG görseli (banner veya afiş) |
| Kanonik | `alternates.canonical` her sayfada |
| Indexleme | Anime detay sayfaları indekslenir; oynatıcı/arama/listem `noindex` |

## 3. Erişilebilirlik ve mobil

- `lang="tr"`, "İçeriğe geç" bağlantısı, tüm düğmelerde `aria-label`/`aria-pressed`/`aria-selected`
- Klavye: `/` arama, `←/→` bölüm, `1-9` kaynak, `F` tam ekran, `Esc` kapatma
- 860 px altında hamburger üst menü + sabit alt gezinme çubuğu (`env(safe-area-inset-bottom)`)
- `prefers-reduced-motion` desteği, `:focus-visible` çerçeveleri

## 4. Yayın yapılandırması

`.github/workflows/yayinla.yml`: checkout → Node 22 (+npm önbelleği) → `npm ci` → veri dosyası
kontrolü → `npm run typecheck` → `npm run build` (`BASE_PATH`, `NEXT_PUBLIC_SITE_URL`) →
`npm run yayin:hazirla` → Pages'e dağıtım.

`tools/yayin-hazirla.mjs`: `.nojekyll` yazar (aksi halde GitHub Pages Jekyll işlemcisi `_next/`
klasörünü yayınlamaz), çıktıyı tarar, uzantı dağılımını ve host limit uygunluğunu raporlar.

## 5. Nihai ölçüm tablosu

| Ölçüm | Değer |
|---|---|
| Ön-render sayfa | 6.119 |
| Çıktı boyutu / dosya sayısı | 392,46 MB / 18.377 |
| İlk yükleme JS (paylaşılan) | 103 KB |
| En büyük sayfa (one-piece) | 202 KB |
| Katalog (istemciye inen) | 1,77 MB (gzip ~450 KB) |
| `/kesfet/` ilk yükleme süresi | ~2,5 sn (yerel sunucu, 6.107 sonuç) |
| Build süresi | ~90 sn (6.119 sayfa) |
| Veri hattı süresi | 8,8 sn |
| AniList zenginleştirme | ~4 dk (117 parti, önbellekli) |

## 5b. Doğrulama turu — H-7 (sessiz veri bozulması)

Veri hattındaki `ekipBilgisiTemizle()` fonksiyonunun çevirmen metnini kırpma kuralı yanlış
kaçışlanmıştı:

```js
// YANLIŞ — `\\` tek bir ters bölü, ardından gelen `-` ARALIK kuruyor (`\` → `–`)
p.replace(/^[\s/\\-–—,.]/, '')

// DOĞRU — tire kaçışlı ve sınıfın sonunda
const SON_KIRP = /[\s/–—,.\-]+$/;
```

Etki: `"Rinrintan"` → `"R"`, `"Magic_Lord"` → `"Magic_L"`. 112.541 ekip kaydının bir kısmı sessizce
bozulmuştu; tip denetimi bunu yakalayamaz. Fonksiyon beş gerçek örnekle birim test edildi, veri
hattı yeniden koşuldu ve çıktı doğrulandı:

```
naruto 1. bölüm ekip:
  [{"g":"AniSekai","e":"Magic_Lord / Deat H Note. & S.Erturk"},
   {"g":"AniSekai-BD","e":"R.C/ Deat H Note/ Magic_Lord"},
   {"g":"Benihime Fansub-BD","e":"Rinrintan"},
   {"g":"Eski Çeviri","e":"Arfesdimas / eskiceviri.blogspot.com / kesifasya.com"}]
```

Ayrıca depoda aynı desende başka kaçışsız tire olup olmadığı tarandı:
`\[[^\]]*\\\\-[^\]]*\]` → yalnızca hatayı açıklayan yorum satırı.

## 5c. Nihai ölçüm (son derleme)

| Ölçüm | Değer |
|---|---:|
| Toplam boyut (dosya baytları) | 399,86 MB |
| Disk kullanımı (`du`) | 440 MB (küçük dosya blok tahsisi) |
| Dosya sayısı | 18.377 |
| `anime/*.html` | 239,1 MB (6.107 dosya, ortalama 39 KB) |
| `anime/*.txt` (RSC) | 109,8 MB (%27) |
| `data/*.json` | 62 MB (6.113 dosya) |
| `_next/*` | 0,98 MB |
| Tip denetimi | 0 hata |

## 6. Belgeler yazıldı

`docs/00`–`docs/10`, `docs/gunluk/*`, `docs/kararlar/ADR-0001…0006`, ayrıca kök `README.md`,
`AGENTS.md` ve `.env.example`.

## 7. Bilinen eksikler (yayın öncesi kullanıcıya not)

1. `public/data/` **commit edilmeli** — CI veri hattını çalıştıramaz (arşiv DB depoda değil).
2. `src/lib/site.ts` içindeki `SITE.url` gerçek adresle güncellenmeli.
3. GitHub deposunda **Settings → Pages → Source: GitHub Actions** seçilmeli.
4. Özet metinleri İngilizce (AniList verisi) — Türkçeleştirme yol haritasında.
5. 317 bin kaynağın %98,6'sının durumu bilinmiyor — Faz 7 taraması bekliyor.
