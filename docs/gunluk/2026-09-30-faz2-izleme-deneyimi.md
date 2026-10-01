# Günlük · 2026-09-30 · Faz 2 — İzleme deneyimi

## 1. Tasarım sistemi

`src/app/globals.css` — harici CSS çatısı yok, ~1100 satır: belirteçler, yerleşim, üst bar, hero,
satır/kart, ızgara, bölüm listesi, oynatıcı düzeni, çipler, filtreler, alt bilgi, mobil menü,
iskeletler, duyarlılık (`1100px`, `860px`), `prefers-reduced-motion`.

## 2. Yardımcı katmanlar

| Dosya | Görev |
|---|---|
| `src/lib/tipler.ts` | Veri sözleşmeleri (katalog satırı, anime, bölüm, kaynak, taksonomi, depo tipleri) |
| `src/lib/bicim.ts` | Türkçe normalizasyon, `Intl` biçimlendirme, player adları, gömülebilirlik, arama puanlama |
| `src/lib/yollar.ts` | basePath uyumlu yol yardımcıları |
| `src/lib/veri.ts` | Build zamanı veri okuma (yalnızca sunucu) |
| `src/lib/istemci/katalog.ts` | Katalog tembel yükleme + arama/filtre motoru (2 MB, tek indirme) |
| `src/lib/depo/yerel.ts` | localStorage sürücüsü + değişiklik yayını |
| `src/lib/depo/kanca.ts` | `useSyncExternalStore` tabanlı React kancaları |

## 3. Bileşenler ve sayfalar

Bileşenler: `Ikon`, `Kart`, `Satir` (oklarla kaydırma), `Hero` (otomatik dönen vitrin),
`IzlemeyeDevam`, `AnimeEylemler`, `BolumListesi`, `IzleIstemci`, `UstBar` (anlık arama + `/` kısayolu),
`AltBilgi`, `AltMenu`, `KesfetIstemci`, `AraIstemci`, `ListemIstemci`, `FansubIstemci`.

Sayfalar: `/`, `/kesfet/`, `/ara/`, `/anime/[slug]/`, `/izle/`, `/listem/`, `/fansublar/`, `/kunye/`,
`not-found`, `sitemap.ts`, `robots.ts`.

## 4. İlk derleme ve iki kritik hata

### Koşu 1

```
$ npm run build
 ✓ Compiled successfully in 9.2s
Failed to compile. ./src/components/Hero.tsx:123:59
Type error: Property 'durum' does not exist on type 'AnaSayfaKarti'.
```

`Hero` içinde `AnaSayfaKarti`'da bulunmayan `durum` alanı kullanılmıştı; kullanılmayan satır ve
import kaldırıldı.

### Koşu 2

```
✓ Generating static pages (6119/6119)
✓ Exporting (2/2)
Route (app)          Size  First Load JS
/                    2.22 kB   112 kB
/anime/[slug]        1.86 kB   111 kB
/izle                4.81 kB   114 kB
+ First Load JS shared by all   103 kB
```

## 5. Tarayıcı testi — H-1: React sonsuz render döngüsü

Önizleme panelinde sayfa "Application error: a client-side exception has occurred" gösterdi.
DOM sorgusu ise içeriğin **yerinde** olduğunu söylüyordu:

```
{ heroAd: "Shingeki no Kyojin Season 3 Part 2", satir: 19, kart: 540 }   // DOM dolu
Ancak ekran: Application error                                            // hidrasyon söküyor
```

Sunucu HTML'i (960 KB) `<main id="icerik">`, `.hero-ad` ve 19 satır içeriyordu — yani sorun sunucuda
değil, hidrasyondaydı.

**Kök neden:** `depo/yerel.ts` içindeki `ilerlemeListesi()` her çağrıda `Object.values(...).sort(...)`
ile **yeni bir dizi** döndürüyordu. `useSyncExternalStore` anlık görüntüyü referansla karşılaştırdığı
için "değişti" sanıp sonsuz döngüye giriyor, React hata sınırı tüm ağacı söküyordu.

**Teşhis için eklenen altyapı:** `layout.tsx` içine, uygulama betiklerinden önce çalışan erken hata
kaydedici konuldu — `error` / `unhandledrejection` olaylarını `document.documentElement.dataset.hata`
alanına yazar. Statik yayında devtools olmadan hata okumayı sağlar ve kalıcı olarak bırakıldı.

**Düzeltme:** `onbellekler.ilerlemeSirali` alanı eklendi; dizi yalnızca yazma/yayın sırasında
geçersiz kılınıyor. Sonuç: `data-hata = null`, 540 kart hidrasyondan sonra da ayakta.

**Yan tuzak:** Düzeltmeden sonraki ilk doğrulama yanıltıcıydı çünkü derleme Windows'ta
`EBUSY: rmdir 'out'` ile düşmüş, eski çıktı sunulmaya devam etmişti (`out/` klasörünü sunan Python
süreci dizini kilitliyordu). Dizin kilitlenmesi çözülüp yeniden derlendikten sonra doğrulama geçti.

## 6. Tarayıcıda doğrulanan akış

| Adres | Sonuç |
|---|---|
| `/` | Hero + 19 satır + 540 kart, hata yok |
| `/anime/naruto/` | 8 künye rozeti, 8 Türkçe tür, özet, YouTube fragman, 100 bölüm satırı |
| `/izle/?a=naruto&b=1` | Uqload otomatik seçildi ve **video yüklendi (Türkçe altyazılı)**, 17 çip, 220 bölüm düğmesi |
| `/ara/?q=naruto` | 19 sonuç, vurgulama |
| `/kesfet/` | 6.107 sonuç, 5 filtre, 60 kart |
| `/kunye/` | Kapsam %1,38 ve player tablosu doğru |

Kaynak grupları ve güvenilirlik: `Uqload %99 · Voe %97 · Mail.ru %95 · Videa %75 · VK · Sibnet %27`.

## 7. Görsel düzeltmeler

- Hero puan rozeti `.kart-rozet` (mutlak konumlu) yeniden kullanıldığı için sol üste kayıyordu →
  `.hero-puan` sınıfı eklendi.
- Ekip künyesindeki `"Rinrintan / /"` artıkları `ekipBilgisiTemizle()` içinde kırpıldı.
- "Sonraki bölüm" düğmesi `.etkin` (seçili) görünüyordu → birincil/ikincil stile çevrildi.
- Künye sayfasındaki iki istatistik kutusunun metin akışı düzeltildi.

## 8. Kararlar

- Oynatıcı adres şeması (`?a=&b=`) → [ADR-0005](../kararlar/ADR-0005-oynatici-url-semasi.md)
- Ön-render kapsamı ve `noindex` politikası → [ADR-0006](../kararlar/ADR-0006-onrender-ve-indexleme.md)
- Ölü/engelli kaynak gizleme → [ADR-0003](../kararlar/ADR-0003-link-sagligi-stratejisi.md)

## 9. Sonraki adım

Faz 3–4: yayın boyutu optimizasyonu, SEO, yayın yapılandırması.
