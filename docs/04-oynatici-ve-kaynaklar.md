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
| Fansub süzgeci | Aynı bölümde 2+ fansub grubu varsa kaynak panelinin başında grup düğmeleri; tıklayarak seçilen gruplar listelenir (`Tümünü göster` sıfırlar), sayı `(görünen / toplam)` olur |
| Doğrulanmış işareti | `✓` — yalnızca kontrol edilip çalıştığı görülen kaynaklarda |
| Klavye | `←/→` veya `N/P` bölüm, `1-9` kaynak, `F` tam ekran, `/` arama |
| Tam ekran | `requestFullscreen` oynatıcı kabına uygulanır (iframe'e cross-origin erişim yok) |
| Bölüm gezinme | Önceki/Sonraki düğmeleri + 220'ye kadar bölüm numarası ızgarası |
| İzlenen işareti | Bölüm numarasında yeşil kenarlık; detay sayfası ve listede de görünür |
| "Kaynak çalışmıyor" | URL tarayıcıda işaretlenir, kaynak listeden çıkar ve otomatik sonrakine geçer; `NEXT_PUBLIC_BILDIRIM_API` tanımlıysa bildirim Worker'a da iletilir (kuyruk çevrimdışı da dayanıklıdır) — `docs/11` |
| "Kaynağı aç" | Her zaman görünür — iframe engellenirse kaçış yolu |
| Ekip künyesi | Seçili kaynağın fansub grubu ve çevirmen/redaktör metni |

### Fansub süzgeci (neden var?)

Bazı bölümlerde 16-20 kaynak ve 6-7 farklı fansub grubu olabiliyor; düz liste hem uzuyor hem de
gözle takip edilemiyor. Süzgeç bu yüzden eklendi:

- Gruplar **o bölümdeki** kaynaklardan türetilir (kaynağı olmayan grup düğmesi gösterilmez) ve
  yanında o gruptan kaç kaynak olduğu yazar (`YuushaSubs-BD 6`).
- Künyesiz kaynaklar (arşivde fansub bilgisi olmayan ~64 bin kaynak) tek bir **Künyesiz**
  düğmesinde toplanır — istenirse listeden çıkarılabilir.
- Seçim **kalıcıdır** (`genesisanime:v1:tercih` → `fansubSuzgeci`) ve hesap açıksa cihazlar arası
  eşitlenen tercihlerin bir parçasıdır.
- Seçilen gruplardan hiçbiri o bölümde yoksa süzgeç uygulanmaz; kullanıcı boş listeyle kalmaz,
  "Seçtiğin N fansub bu bölümde yok; tüm kaynaklar listeleniyor." notu gösterilir.
- Süzgeç değişince seçili kaynak başa döner ve `1-9` kısayolları **görünen** listeye göre çalışır.

### Mobil düzen

Dar ekranda (≤860px) oynatıcı ve kaynak listesi için ayrı kurallar vardır: eylem düğmeleri iki
sütunlu ızgarada 42px yüksekliğe çıkar, süzgeç paneli kaydırırken üstte yapışık kalır, kaynak çipleri
dağınık sarmak yerine hizalı ızgaraya oturur ve uzun fansub adları kırpılmak yerine iki satıra sarar.
Anime detay sayfası ≤700px'te tek kolona iner (poster 168px ortalanır, eylem düğmeleri tam genişlik)
— önceki 130px'lik poster sütunu düğme metnini rozetlerin üstüne taşırıyordu.

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

## Köprü: postMessage API'si olan kaynaklar (ölçüldü, 2026-10-02)

Embed'ler cross-origin olduğu için video elemanına erişemiyoruz — ama bazı host'lar **resmî
postMessage API'si** yayınlıyor. Tahmin etmek yerine iki test sayfası gerçek embed'lerle
çalıştırıldı ve sonuç kayda geçti:

| Test sayfası | Soru | Sonuç |
|---|---|---|
| [`tools/kopru-test.html`](../../tools/kopru-test.html) | Host olay yayınlıyor mu? | VK ✓ · Odnoklassniki ✓ · Mail.ru ✓ · Dailymotion ✗ · Sibnet ✗ |
| [`tools/kopru-komut-test.html`](../../tools/kopru-komut-test.html) | Gönderdiğimiz komut etki ediyor mu? | Yalnız **VK** ✓ (1. denemede `seeked` + `started` + 34× `timeupdate`) |

Ölçümün üç dersi (koda da yazıldı):

1. **VK `js_api=1` olmadan konuşmuyor.** Parametre eklendiğinde `inited` (süre dahil: 1450 sn)
   ve `timeupdate`/`seeked`/`started` olayları geliyor. `referrerPolicy="no-referrer"` bu kanalı
   engellemiyor (kontrol satırıyla doğrulandı).
2. **Yükler nesne olarak gönderilmeli.** Aynı komut `JSON.stringify` ile gönderilince cevapsız
   kaldı; nesne biçiminde çalıştı. `komutlar()` bu yüzden asla metin üretmez.
3. **Komut, oynatıcı hazır olmadan gönderilirse kayboluyor.** Bu yüzden komut, onay olayı
   (`komutOnaylandi`) gelene kadar yinelenir — "gönderdim" ile "oldu" ayrı şeylerdir.

Veri kaynağında bir de sapma vardı: VK adresleri arşivde `https://href.li/?https://vk.com/…`
sarmalayıcısıyla yazılı (gerçek kayıt: `public/data/anime/009-1.json`). Köprü gerçek origin ile
konuşmak zorunda olduğu için sarmalayıcı iframe'e girmeden **çözülür** (`kopru.ts` ·
`sarmalayiciCoz`), ayrıca arada bir üçüncü taraf yönlendirici de kalkar.

### Yetenek farkındalıklı oynatıcı şeridi

Ölçüm sonucu arayüzü belirler (`src/lib/kopru.ts` · `KOPRULER`):

| Host | Kaynak payı | Telemetri (gerçek saniye/süre) | Komut (oynat/duraklat/sar) |
|---|---:|---|---|
| VK | %7,1 | ✓ | ✓ |
| Odnoklassniki | %11,5 | ✗ (yalnız `inited`) | ✗ |
| Mail.ru | %27,9 | ✗ (yalnız `inited`) | ✗ |
| Sibnet, Drive, Uqload, … | %53,5 | ✗ | ✗ |

Kural: **kanıtlanmamış yetenek için düğme gösterilmez.** Ölü "oynat" düğmesi, düğmesizlikten
kötüdür. Opak kaynakta şerit "bu kaynak kendi oynatıcısını kullanır; oynatma konumu okunamaz"
notunu gösterir. Köprü yalnız VK için gerçek konum/süre verir; **gerçek konum cihazda**
(`genesisanime:v1:konum:<slug>:<bölüm>`) tutulur ve hesap eşitlemesine karıştırılmaz — sunucudaki
`saniye` alanı "sayfada geçirilen süre" demektir, ikisi ayrı anlamdır.

Bu, oynatıcının **kendi olması** yolunda atılabilecek adımın sınırıdır: embed'i çözüp kendi
`<video>`'muzda oynatmak video barındırma/proxyleme demek olurdu ve proje kapsamı dışıdır
(`docs/10`, ADR-0005). Kaynağı değiştirmeden iyileştirilebilen kısım — bölüm gezinme, kaynak
çipleri, tam ekran, gerçek konum — bizim katmanımızda ve artık uygulanıyor.

## İlerleme kaydı ve sınırı

```
sayfa açılış → sayaç başlar
  her 15 sn ve sayfadan çıkışta → localStorage: { slug, bolum, bolumAdi, saniye, zaman }
  90 sn sonra                    → bölüm "izlendi" olarak işaretlenir
  "İzledim" düğmesi              → elle işaretleme
```

**Neden varsayılan olarak süre, neden konum değil:** video farklı bir kaynakta (cross-origin)
çalıştığı için `currentTime` / `duration` genel olarak okunamaz; köprü yayınlayan host'ta (VK)
ise okunur ve şerit gerçek `konum / süre` gösterir. Diğer kaynaklarda yüzdelik ilerleme çubuğu
yerine "son bölüm + ne zaman" gösterilir. Hesap tabanlı senkronizasyon (Faz 5) geldiğinde de
bu ayrım korunur (sunucu `saniye` alanı sayfada geçirilen süredir); kullanıcı "izledim"
işaretlemesiyle telafi edilebilir.

## Bilinen kısıtlar

1. Iframe içinde reklam/sekme açılması player'ın politikasıdır; engellenemez, yalnızca kaynak
   değiştirilerek azaltılabilir.
2. Bölüm bitişinin otomatik algılanması imkânsızdır; otomatik sonraki bölüm sunulmaz, bunun yerine
   belirgin "Sonraki" düğmesi ve `→` kısayolu vardır.
3. Ölü kaynak işaretlemeleri yalnızca tarayıcıda tutulur; sunucuya gönderilmez (Faz 5 ile değişecek).
