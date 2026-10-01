# ADR-0006 · Ön-render kapsamı ve indexleme politikası

- **Tarih:** 2026-09-30
- **Durum:** Kabul edildi
- **İlgili:** [ADR-0001](ADR-0001-nextjs-statik-export.md), [ADR-0005](ADR-0005-oynatici-url-semasi.md)

## Bağlam

Statik export'ta her sayfa derleme zamanında üretilir. Hangisinin üretileceği, hangisinin
istemciye bırakılacağı ve hangisinin arama motorlarına açık olacağı bir maliyet/kazanç kararıdır.

## Karar

### Ön-render edilenler (gerçek HTML + SEO)

| Rota | Sayı | Gerekçe |
|---|---:|---|
| `/anime/<slug>/` | 6.107 | Uzun kuyruk trafiğinin ana kaynağı; bölüm adlarını da listeler |
| `/`, `/kesfet/`, `/fansublar/`, `/kunye/` | 4 | Sabit sayfalar |
| `sitemap.xml`, `robots.txt`, `404.html` | 3 | Metadata rotaları |

Toplam: **6.119 ön-render sayfa**.

### İstemciye bırakılanlar (tek statik kabuk)

| Rota | Veri kaynağı | Gerekçe |
|---|---|---|
| `/izle/?a=&b=` | `public/data/anime/<slug>.json` (istek üzerine) | 71.694 sayfa üretmek ölçeklenmez (ADR-0005) |
| `/ara/?q=` | `public/data/katalog.json` (ilk etkileşimde) | Sorgu kombinasyonları sınırsız; indeks istemcide |
| `/listem/` | localStorage | Kişisel veri; sunucuda yok |

### Indexleme politikası

```ts
// /izle, /ara, /listem
robots: { index: false, follow: true }
```

| Rota | Index | Follow | Gerekçe |
|---|---|---|---|
| Anime detayı | ✅ | ✅ | Gerçek, tekil, değerli içerik |
| Ana sayfa, keşfet, fansublar, künye | ✅ | ✅ | Sitelink ve marka |
| Oynatıcı | ❌ | ✅ | Tek kabuk, sorgu bazlı; indekslenirse yinelenen/ince içerik |
| Arama | ❌ | ✅ | Sonsuz sorgu uzayı, ince içerik |
| İzleme listem | ❌ | ✅ | Kullanıcıya özel, sunucuda içerik yok |

`robots.txt` bu üç yolu ayrıca `Disallow` eder; `noindex` + `disallow` birlikte kullanılır ki
sayfalar bağlantı takibini sürdürsün ama dizine girmesin.

## Gerekçe

1. **Maliyet:** 71.694 HTML üretmek çıktıyı gigabaytlara çıkarır ve GitHub Pages 1 GB sınırını aşar.
2. **Değer yoğunluğu:** Anime detayı tekil içerik taşır (özet, tür, bölüm listesi, fansub künyesi);
   oynatıcı sayfası ise aynı verinin istemci tarafı görünümüdür.
3. **Yinelenen içerik:** 6.107 anime için ek 71.694 neredeyse-boş oynatıcı sayfası üretmek arama
   motorlarında kalite sinyalini düşürür.
4. **Kullanıcı deneyimi:** Paylaşılan oynatıcı bağlantıları çalışır; yalnızca arama sonuçlarında
   görünmez. Bu ticari bir kayıp değil, arşiv keşfi zaten anime sayfalarından yapılır.

## Sonuçlar

- `sitemap.xml` 6.111 URL içerir (yalnızca indekslenen sayfalar), boyut 1,17 MB.
- Her anime sayfasında JSON-LD (`TVSeries`/`Movie` + `AggregateRating`) ve OG görseli bulunur.
- Bölüm listesinin SSR'de ilk 100 satırı basılır, gerisi istemcide açılır (ilk 100 bölümün adı
  indekslenir; bu H-3 boyut sorununun çözümüyle bilinçli bir denge).

## Yeniden değerlendirme tetikleyicileri

- Host Cloudflare Pages'e taşınırsa ve dosya limiti sorun olursa bölüm sayfaları yine gündeme gelmez,
  aksine katalog tarafı sadeleşir.
- Yol tabanlı oynatıcı adresleri (404 yedeği) uygulanırsa indeksleme kararı değişmez — değişen
  yalnızca adres biçimi olur (ADR-0005'in iyileştirme bölümü).
- Arama motorlarından bölüm bazlı trafik ölçülür ve anlamlı çıkarsa, en popüler ilk 500 yapım için
  bölüm sayfaları ön-render edilebilir (yaklaşık 25 bin sayfa, ~600 MB).
