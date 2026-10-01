# 04 · Oynatıcı ve Kaynak Politikası

> Son güncelleme: 2026-09-30 · Dosya: `src/components/IzleIstemci.tsx`

## Adres şeması

```
/izle/?a=<anime-slug>&b=<bölüm sırası>
```

- `b` **1 tabanlı sıra numarasıdır**, slug'dan çıkarılan numara değil. Nedeni: arşivde 3.808 bölüm
  slug'ı sayı içermiyor (`-special`, `-movie`), 1.911'i hiç "bolum" kelimesi taşımıyor. Sıra
  numarası her durumda çalışır; görüntülenen etiket yine gerçek numaradır (`no`).
- `b` verilmezse kayıtlı ilerlemeden devam edilir; o da yoksa 1. bölüm açılır.
- Adres `router.replace` ile bölüm değişiminde güncellenir (geçmiş kirletilmez).

Yol tabanlı (`/izle/naruto/1`) alternatif bilinçli olarak seçilmedi: statik export'ta 71.694 dosya
üretirdi (ADR-0005).

## Kaynak akışı

```
anime/<slug>.json  →  bölümün src dizisi
        │
        ├─ kullanıcının "çalışmıyor" dediği URL'ler çıkarılır (localStorage)
        │     (hepsi çıkarılırsa orijinal liste kullanılır — boş ekran göstermemek için)
        │
        ├─ sıralama:
        │     1. doğrulanmış çalışanlar (src[3] === "ok")
        │     2. tercih edilen player (kullanıcı tercihi)
        │     3. üreteçten gelen sıra (player güvenilirliği → URL)
        │
        └─ varsayılan seçim: ilk kaynak (pratikte en güvenilir doğrulanmış kaynak)
```

## Güvenilirlik göstergesi

Player güvenilirliği, link kontrol verisinden hesaplanır ve oynatıcıda çubuk + yüzde olarak
gösterilir. Doğrulama örneklemindeki sonuçlar:

| Player | Toplam kaynak | Kontrol | Çalışıyor | Güvenilirlik |
|---|---:|---:|---:|---:|
| Uqload | 7.282 | 498 | 493 | %99 |
| Voe | 2.644 | 70 | 69 | %97 |
| CyberFile | 1.150 | 30 | 30 | %97 |
| Mail.ru | 88.450 | 41 | 40 | %95 |
| Mega | 733 | 8 | 8 | %90 |
| Videa | 1.288 | 2 | 2 | %75 |
| Sibnet | 133.307 | 3.556 | 941 | %27 |
| Odnoklassniki | 36.393 | 34 | 0 | %3 |

> Bu tablo **kontrol edilen örneklem**tir, tüm kaynakların gerçek durumu değil. Sibnet'in düşük
> oranı hem örneklemin eski olmasından hem de yüklemeli sayfaların otomatik kontrol tarafından
> "ölü" sayılmasından kaynaklanıyor olabilir; Faz 7'de yeniden tarama planlanıyor.

## Oynatıcı özellikleri

| Özellik | Uygulama |
|---|---|
| Kaynak seçimi | Player bazında gruplanmış çipler (`#1`, `#2`, …), güvenilirlik çubuğu |
| Doğrulanmış işareti | `✓` — yalnızca kontrol edilip çalıştığı görülen kaynaklarda |
| Klavye | `←/→` veya `N/P` bölüm, `1-9` kaynak, `F` tam ekran, `/` arama |
| Tam ekran | `requestFullscreen` oynatıcı kabına uygulanır (iframe'e cross-origin erişim yok) |
| Bölüm gezinme | Önceki/Sonraki düğmeleri + 220'ye kadar bölüm numarası ızgarası |
| İzlenen işareti | Bölüm numarasında yeşil kenarlık; detay sayfası ve listede de görünür |
| "Kaynak çalışmıyor" | URL tarayıcıda işaretlenir, kaynak listeden çıkar ve otomatik sonrakine geçer; `NEXT_PUBLIC_BILDIRIM_API` tanımlıysa bildirim Worker'a da iletilir (kuyruk çevrimdışı da dayanıklıdır) — `docs/11` |
| "Kaynağı aç" | Her zaman görünür — iframe engellenirse kaçış yolu |
| Ekip künyesi | Seçili kaynağın fansub grubu ve çevirmen/redaktör metni |

## Gömüleme (embed) politikası

Iframe nitelikleri:

```html
<iframe
  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
  allowFullScreen referrerPolicy="no-referrer"
  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
/>
```

`sandbox` bilinçli olarak sınırlayıcıdır: üst pencereye erişim, form dışı gezinme veya eklenti
çalıştırma izni verilmez. `allow-popups` reklam/oynatıcı davranışı için gereklidir.

**Gömülemeyen kaynaklar:** `embedUygun()` fonksiyonu `mega.nz`, `pixeldrain.com`, `yandex` host'larını
gömülemez olarak işaretler; bu kaynaklar seçildiğinde iframe yerine "Bu kaynak siteye gömülemiyor"
kartı ve "Yeni sekmede aç" düğmesi gösterilir.

## Doğrulanan gerçek davranış (2026-09-30 tarayıcı testi)

```
/izle/?a=naruto&b=1
  iframe src     : https://uqload.com/embed-60xerams6mcz.html   (en güvenilir player otomatik seçildi)
  kaynak çipleri : 17
  bölüm ızgarası : 220
  gruplar        : Uqload %99 · Voe %97 · Mail.ru %95 · Videa %75 · VK · Sibnet %27
  ekip künyesi   : Benihime Fansub-BD → Rinrintan
  sonuç          : oynatıcı videoyu yükledi (Türkçe altyazılı); reCAPTCHA kapısı
                   player'ın kendi davranışı, sitemizin değil
```

## İlerleme kaydı ve sınırı

```
sayfa açılış → sayaç başlar
  her 15 sn ve sayfadan çıkışta → localStorage: { slug, bolum, bolumAdi, saniye, zaman }
  90 sn sonra                    → bölüm "izlendi" olarak işaretlenir
  "İzledim" düğmesi              → elle işaretleme
```

**Neden süre, neden konum değil:** video farklı bir kaynakta (cross-origin) çalıştığı için
`currentTime` / `duration` okunamaz. Bu nedenle yüzdelik ilerleme çubuğu yerine "son bölüm + ne
zaman" gösterilir. Bu, hesap tabanlı senkronizasyon (Faz 5) geldiğinde de değişmeyecek bir dış
kısıttır; ancak kullanıcı "izledim" işaretlemesiyle telafi edilebilir.

## Bilinen kısıtlar

1. Iframe içinde reklam/sekme açılması player'ın politikasıdır; engellenemez, yalnızca kaynak
   değiştirilerek azaltılabilir.
2. Bölüm bitişinin otomatik algılanması imkânsızdır; otomatik sonraki bölüm sunulmaz, bunun yerine
   belirgin "Sonraki" düğmesi ve `→` kısayolu vardır.
3. Ölü kaynak işaretlemeleri yalnızca tarayıcıda tutulur; sunucuya gönderilmez (Faz 5 ile değişecek).
