# 05 · Kalite ve Testler

> Son güncelleme: 2026-10-02

## Kontroller (CI ile aynı komutlar)

| Kontrol | Komut | Beklenen |
|---|---|---|
| Birim testleri | `npm test` | 129/129 geçer (~16 sn; ağ/DB yok) |
| Tip denetimi | `npm run typecheck` | 0 hata |
| Derleme | `npm run build` | `✓ Compiled successfully`, 7.442 statik sayfa |
| Yayın hazırlığı | `npm run yayin:hazirla` | GitHub Pages < 1 GB uygun; Cloudflare Pages **21.046 dosya ile 20.000 sınırını aşıyor** (asıl hedef GitHub Pages) |
| Veri hattı | `npm run veri` | 6.107 anime dosyası, çıktı sayıları DB ile uyuşur |
| Tarayıcı duman testi | elle / önizleme paneli | Konsolda hata yok, akış tamamlanır |
| API uçtan uca | `api && npx wrangler dev` + `npm run api:test` | 45 adım geçer (isteğe bağlı `--oran` ile 46; yerel D1 + gerçek HTTP; yönetici jetonuyla) |

## Bulunan ve düzeltilen hatalar

### H-1 · React sonsuz render döngüsü (kritik, site tamamen boş görünüyordu)

**Belirti:** Ana sayfa HTML'i sunucudan doğru geliyordu (960 KB, `<main id="icerik">` ve 540 kart
mevcut) ama tarayıcıda "Application error: a client-side exception has occurred" ekranı vardı.
DOM sorgusu içeriği gösteriyordu; ekran görüntüsü boştu — çünkü hidrasyon sırasında React tüm
ağacı söküp hata sınırı ekranını basıyordu.

**Kök neden:** `src/lib/depo/yerel.ts` içindeki `ilerlemeListesi()` her çağrıda yeni bir dizi
üretiyordu (`Object.values(...).sort(...)`). `useSyncExternalStore` anlık görüntüyü referansla
karşılaştırdığı için her render'da "değişti" sanıyor ve sürekli yeniden render ediyordu.

**Düzeltme:** `ilerlemeSirali` alanı önbelleğe eklendi; dizi yalnızca depo değiştiğinde (yazma
veya `yayinla()`) yeniden üretiliyor. `AGENTS.md` değişmezler listesine kural olarak eklendi.

**Teşhis altyapısı:** `layout.tsx` içine erken hata kaydedici eklendi — uygulama betikleri
yüklenmeden önce `error`/`unhandledrejection` olaylarını dinleyip
`document.documentElement.dataset.hata` alanına yazıyor. Statik yayında devtools olmadan hata
okumayı sağlar. Ayrıca ölçüldü: hata sayısı 0.

**Yan tuzak:** İlk düzeltmeden sonraki doğrulama yanıltıcıydı; `npm run build` Windows'ta
`EBUSY: out dizini kilitli` hatasıyla düşmüş ve eski derleme sunulmaya devam etmişti. Dizin
kilitlenmesinin nedeni `out/` klasörünü sunan Python sunucusunun çalışma dizinini tutmasıydı.
Ders: derleme hatası sessizce eski çıktıyı bırakır — derleme hatası ile test sonucunu birlikte oku.

### H-2 · `score` ölçeği (hero tamamen boş)

Ayrıntı: `docs/02-veri-pipeline.md` § Tuzaklar 1. 0–10 olan puan 0–100 varsayıldı; hero 24 kayıt
yerine 0 kayıt üretti. Düzeltme sonrası 1.581 aday.

### H-3 · Yayın boyutu 517 MB

**Belirti:** İlk derleme 517 MB / 18.375 dosya; `one-piece/index.html` 800 KB (`.txt` ile 1,2 MB).

**Kök neden:** `BolumListesi` istemci bileşenine tam `Anime` nesnesi prop olarak geçiliyordu. Bu,
her anime sayfasının hem HTML'ine hem RSC yüküne tüm bölüm-kaynak verisini serileştiriyordu
(One Piece için 1.100+ bölüm × ortalama kaynak).

**Düzeltme — iki adım:**

1. `BolumListesi` artık `BolumOzet[]` alıyor: bölüm başına `{n, no, ad, ks, fansub, ekipSayisi}`
   (~80 bayt). ➜ 517 MB → 434 MB.
2. Bölüm listesi SSR'de ilk 100 satırla sınırlandı, gerisi "bölüm daha göster" ile açılıyor
   (aynı veri istemcide zaten mevcut, ek istek yok). ➜ 434 MB → **392,46 MB**.

Sonuç: `one-piece/index.html` 800 KB → 202 KB, `naruto/index.html` → 97 KB. Ölçüm betiği:
`npm run yayin:hazirla`.

### H-4 · Hero puan rozeti yanlış konumda

Hero meta satırında `.kart-rozet` sınıfı yeniden kullanılmıştı; bu sınıf `position: absolute`
olduğu için rozet sayfanın sol üst köşesine kayıyordu. `.hero-puan` sınıfı eklendi.

### H-5 · Ekip künyesinde ayraç artıkları

`"Rinrintan / /"` gibi çıktılar `ekipBilgisiTemizle()` içinde kırpılıyor; boş kalan kayıt
yazılmıyor.

### H-7 · Regex karakter sınıfında kaçışsız tire → metinlerin sonu kesildi (sessiz veri bozulması)

**Belirti:** Çevirmen künyeleri "Rinrintan" yerine **"R"**, "Magic_Lord" yerine "Magic_L" olarak
kaydedildi. Hata fark edilmeseydi 112.541 ekip kaydının bir kısmı sessizce bozulacaktı.

**Kök neden:** Ayraç kırpma için yazılan karakter sınıfı `[\s/\\-–—,.]` idi. Burada `\\` **tek bir
kaçışlı ters bölü** anlamına gelir ve onu izleyen `-` bir **aralık** tanımlar: `\` (U+005C) ile `–`
(U+2013) arasındaki **tüm** karakterler sınıfa girer. Bu aralık küçük harfleri, rakamları ve `_`
gibi pek çok karakteri kapsar; `$` ile birlikte kullanıldığında kelimenin sonundaki harfleri
sırayla siler:

```
"Rinrintan / /"  →  [karakter sınıfı]  →  "R"      (0x52 'R', aralığın dışında kaldığı için durdu)
"Magic_Lord"     →  [karakter sınıfı]  →  "Magic_L"
```

**Düzeltme:** Tire kaçışlı ve sınıfın sonunda konumlandırıldı, ifade tekrar kullanılabilir iki sabite
ayrıldı ve tuzak koda yorum olarak yazıldı:

```js
const BAS_KIRP = /^[\s/–—,.\-]+/;
const SON_KIRP = /[\s/–—,.\-]+$/;
```

**Doğrulama:** Fonksiyon beş gerçek örnek üzerinde birim test edildi:

```
"Rinrintan / /"                        -> "Rinrintan"      ✓
"Magic_Lord / Deat H Note. & S.E"      -> değişmedi        ✓
"Çeviri: Fei - Encode&Upload: Vuats - https://…"  -> "Çeviri: Fei - Encode&Upload: Vuats"  ✓
"https://a.com/x https://b.com/y"      -> ""              (boş kayıt yazılmaz)  ✓
"R.C/ Deat H Note/ Magic_Lord"          -> değişmedi        ✓
```

Ayrıca depoda aynı desende başka kaçışsız tire olup olmadığı tarandı:
`\[[^\]]*\\\\-[^\]]*\]` → yalnızca bu hatayı açıklayan yorum satırı bulundu.

**Ders:** Karakter sınıfı yazarken tireyi her zaman kaçışla (`\-`) veya sınıfın en sonunda yaz.
Sessiz veri bozulması üretebilir ve tip denetimi bunu yakalayamaz. Bu tür dönüşümler için gerçek
örneklerle birim test yazılmalı.

### H-8 · `DURUM_ESLEME`'de `"ok"` eşlemesi yoktu (sessiz rozet kaybı)

Link tarayıcısı durum dosyasına `durum: "ok"` yazıyor; arşivdeki eski araç ise `"çalışıyor"`
kullanıyor. Eşleme tablosunda yalnızca ikincisi vardı, bu yüzden **kendi taramamızın 30.124 kaydı
`bilinmiyor` sayıldı**: hiçbir rozet verilmedi ve `/kunye` dağılımı “ok 943” gösterdi. Teşhis,
`npm run link:durum` çıktısındaki dağılımın taranan ok sayısıyla uyuşmamasıyla yapıldı.

**Ders:** Durum sözlüğü tek bir yerde tanımlı ve iki üreteç aynı sözlüğü besliyor; yeni bir durum
yazan her araç, eşlemeyi de güncellemeli. Dağılımı yazdıran bir komut (`--durum`) bu sınıf hatayı
görünür kılar.

### H-9 · Soğumaya alınan host işleri sayacı düşürmüyordu (koşu asılı kaldı)

Tarama motoru, engel yiyen bir host'un kalan işlerini partiden düşürüyordu ama `bekleyen` sayacını
azaltmıyordu; işçiler “iş yok ama sayaç sıfır değil” durumunda sonsuz bekledi. İlk koşu 400 sn'de
kesildi. Düzeltme sonrası aynı senaryo 2 sn'de tamamlanıyor.

### H-10 · Sınıflandırma arşiv host'una göre yapılıyordu (22.431 kayıt etkilendi)

`href.li/?https://vk.com/...` kayıtlarında sarmal açılıp VK'ya gidiliyordu ama kurallar hâlâ
`href.li` host'u üzerinden seçiliyordu; VK'ya özel kural hiç çalışmadı ve sayfalar genel kurala
düştü. Düzeltme: karar hem arşiv host'una hem **nihai (yönlendirme sonrası) host'a** bakar.

### H-11 · VK'da “dosya listesi yok” → ölü demek yanlıştı (%30 yanlış ölüm)

Ölçüm: VK, yük altında **canlı** videolar için de 64–65 KB'lik dosyasız JS kabuğu döndürüyor.
Sakin koşulda yeniden ölçülen 20 “ölü” kaydın 6'sı canlı çıktı. 1.129 kayıt yeniden tarandı
(220 canlı, 909 belirsiz) ve kural sıkılaştırıldı: VK'da yalnızca HTTP 404/410 ölü sayılır.

**Ders:** Bir karar kuralı, hedef sitenin **yük altındaki** davranışıyla sınanmadan “ölü”
diyemez. Ölü kararı linki siteden gizlediği için bu sınıf hata en pahalı hatadır; şüphede kalınan
her durum `belirsiz` olmalıdır (bkz. `docs/09` §5).

### H-12 · MEGA gömme sayfası sahte “çalışıyor” rozeti üretiyordu

MEGA'nın `/embed/` sayfası HTTP'de her zaman oynatıcı JS'i ile gelir; genel “oynatıcı işareti”
kuralı 356 kayda haksız “doğrulanmış” rozeti verecekti. MEGA artık bilinçli olarak `belirsiz`.

### H-13 · Açık dosya tanıtıcısı Windows'ta `rename` işlemini bloklar

`--sikistir` modu geçici dosyayı asıl dosyanın üzerine taşırken `EPERM` aldı: aynı dosya
başlangıçta append için açılıyordu. Düzeltme: sıkıştırma modunda dosya açılmıyor.

### H-14 · `zamanOku` kendi yazdığımız tarihi ay/gün karıştırarak okuyordu (kapsam artışını durdurdu)

**Belirti:** İkinci tarama dilimi neredeyse hiç yeni URL üretmedi: 14.000 istek atıldı, kapsam
%15,12 → %15,23 arttı (yani **13.654 istek boşa gitti**).

**Kök neden:** `zamanOku()` önce `Date.parse()` deniyordu; V8, `"01.10.2026 14:23:45"` metnini
ay/gün karıştırarak **10 Ocak 2026** diye okuyor. 30 günlük geçerlilik denetimi taze kayıtları
“eski” sayıp aynı URL'leri yeniden taramaya gönderiyordu. Hata yalnızca günü 12'den küçük
tarihlerde tetikleniyordu (`30.09.2026` gibi tarihler `Date.parse`'ta `NaN` dönüp regex yedeğine
düştüğü için ilk oturumun 29.334 kaydı doğru okunmuştu).

**Düzeltme:** Yerel biçim regex'i artık **ilk** deneniyor, `Date.parse` yedeğe alındı. Ölçüm:
düzeltmeden sonraki dilimde 12.875 isteğin 12.281'i yeni URL'ydi.

**Koruma:** Bu hata artık `npm test` içinde çivilidir (`zamanOku` testleri; yıl/ay/gün bileşenleri
ve “bugün yazılan kayıt taze sayılır” ölçümü). Ayrıntı: `docs/09` §4.4.

### H-6 · "Sonraki bölüm" düğmesi seçili görünüyordu

`tercihler.otomatikSonraki` değeri düğmeye `.etkin` sınıfı veriyordu; kullanıcıya "seçili" gibi
görünüyordu. Düğme artık `sonrakiVar` durumuna göre birincil/ikincil stil alıyor.

## Tarayıcıda doğrulanan akış (2026-09-30)

| Adım | Sonuç |
|---|---|
| `/` | Hero (banner + puan + tür + özet + 3 düğme), 19 satır, 541 kart, `data-hata` boş |
| `/anime/naruto/` | 8 künye rozeti, 8 Türkçe tür etiketi, özet, YouTube fragman, 100 bölüm satırı, 220 bölüm kaydı |
| `/izle/?a=naruto&b=1` | Uqload otomatik seçildi, video yüklendi, 17 çip, 220 bölüm düğmesi, güvenilirlik çubukları |
| `/ara/?q=naruto` | 19 sonuç, alaka sıralı, vurgulama çalışıyor |
| `/kesfet/` | 6.107 sonuç, 5 filtre kutusu, 60 kart, 2,5 sn içinde yüklendi |
| `/kunye/` | Kapsam tablosu doğru (%1,38), player güvenilirlik tablosu dolu |
| `/kunye/` (Faz 7 sonrası) | %11,77 kontrol · %9,56 kesin · 170 gizlenen ölü · 7.018 belirsiz; tablo “kesin karar” ve “belirsiz” kolonlarıyla |
| `/izle/?a=naruto&b=1` (Faz 7 sonrası) | Doğrulanmış Mail.ru kaynağı (%100) otomatik seçildi |
| `/kunye/` (01.10 · kapanış) | **%58,72** kontrol (186.226) · %54,67 kesin · 12.864 belirsiz · **173.034** doğrulanmış rozetli · 326 gizlenen; `data-hata` null |
| `/` (01.10 · tur A) | Hero'da **▶ Fragman** ve **Şansıma ne çıkarsa**; fragman tıklanınca `youtube-nocookie` iframe'i `.katman` içinde açıldı, Escape kapattı, gövde kilidi çözüldü; rastgele düğme `/izle/?a=kusuriya-no-hitorigoto&b=14` sayfasını açtı; `data-hata` null |
| `/seriler/` (01.10 · tur D) | 961 satır, ilk üç: One Piece 42 · Magic Kaito 1412 41 · Dragon Ball 40 |
| `/seri/one-piece/` | Başlık “One Piece serisi”, 42 kronolojik kart |
| `/anime/naruto/` | `/seri/naruto/` bağlantısı + 8 fansub çipi (`/fansub/…`); ham player URL'i HTML'de yok |
| `/fansub/varsayilan/` | 1.943 yapım · 21.400 bölüm katkısı; katalog ızgarası dolu |
| `/hesap/` (01.10 · tur C) | API kapalıyken “Hesaplar bu kurulumda kapalı” paneli, veri indirme + yerel temizleme düğmeleri; KVKK bölümü; parola alanı yok; `data-hata` null |
| `/manifest.webmanifest`, `/sw.js`, `/og.png`, `/ikon/*.png` | 200 · doğru boyut ve içerik (curl + `cikti.test.mjs`) |

### Birim ve veri bütünlüğü testleri (`npm test`)

`tools/testler/` altındaki altı dosya Node'un yerleşik `node:test` koşucusuyla çalışır — **ek
bağımlılık yoktur**; hepsi ağsızdır ve SQLite'a dokunmaz.

**`tarama.test.mjs`** link tarayıcısının saf mantığını sınar: tüm HTTP yanıtları sentetik
kurulur, kararlar doğrudan fonksiyon çağrısıyla doğrulanır.

| Kapsam | Ne doğrulanır |
|---|---|
| `zamanOku` / `zamanMetni` | H-14: yerel biçim ay/gün karıştırılmadan okunur · gidiş-dönüş kayıpsız · bugün yazılan kayıt taze sayılır · bozuk girdi `null` |
| `hostAl` | Küçük harf, `www.` atma, port, alt alan adı, sarmalayıcı host, bozuk adres |
| `hedefBelirle` | href.li açma, mail.ru iki URL biçimi, Yandex Disk/pixeldrain/Dailymotion uçları, bilinmeyen host |
| `genelKural` (politika) | 404/410 ölü · 451 engelli · 403/429 “belirsiz + soğuma sebebi” · 5xx ve ağ hatası asla ölü · oynatıcı işareti “ok” |
| Host kuralları | sibnet, mail.ru, ok.ru (silinmiş/kısıtlı ayrımı), Drive, uqload, mp4upload, voe, Yandex Disk, Dailymotion, pixeldrain |
| Regresyon çivileri | H-10 (karar nihai host'a da bakar) · H-11 (VK'da “dosya listesi yok” ≠ ölü) · H-12 (MEGA asla “ok”) · H-8 (`"çalışıyor"` ve `"ok"` eşlemesi) |
| `KURALLAR` tablosu | Her kural isimli, host listesi dolu ve **host çakışması yok** (yeni kural eskisini sessizce gölgeleyemez) |
| `sicilArtefaktlari` | 20 ardışık “ölü” sonrası damga · 30 dk boşluk = yeni oturum · canlı kayıt sayacı sıfırlar · başka host karışmaz |

Ölçüm: **32 test / 32 geçti** (tarama dosyası), ~0,6 sn.

**`veri.test.mjs`** üretilmiş sitenin bütünlüğünü sınar: `public/data/` çıktısını link sağlık
kaydıyla (`tools/cache/link-durum.jsonl` + arşiv geçmişi) karşılaştırır; SQLite ve ağ yok.

| Kapsam | Ne doğrulanır |
|---|---|
| Katalog sözleşmesi | `kolonlar` sırası, satır biçimi, ISO üretim damgası |
| Katalog ↔ dosya | Kayıt sayısı = `anime/*.json` sayısı; slug kümeleri birebir; tekrarlanan slug yok (dosya sessizce ezilmesin) |
| Anime sayaçları | `bolumSayisi`, `kaynakSayisi`, bölüm `ks` ve sırası `n`, bölüm verisiyle tutarlı |
| Kaynak girdisi | Her `src` girdisi `[player, fansub, url(, "ok")]` biçiminde; URL `new URL()` ile ayrıştırılabilir http(s) olmalı |
| Ölü/engelli sızıntısı | Hiçbir dosyada `olu`/`engelli` URL yok — çıkarsa üretilmiş veri sağlık kaydından geri kalmıştır; çözümü `npm run veri` |
| Künye toplamları | `kunye.json` (kaynak/tekil/rozetli/bölüm/seriGrubu/`banner4k`) gerçek dosyalarla birebir |
| TMDB banner katmanları | `banner4k` yalnızca ≥3000 px TMDB `original` adresi ve genişliği (`banner4kGenislik`); `bannerTmdb` (HD) ise AniList banner'ı yokken ≥1280, varken ≥1900 olmalı ve **4K varken yazılamaz**. Adres yokken genişlik de olmamalı; ana sayfa kartlarında `ban4k`/`bw` yarım dolu olamaz (tarayıcı yanlış `srcSet` adayı seçer) |
| `anilist` alanı | Her anime dosyasında bulunmalı (sayı ya da `null`) — eşleme araçları kimliği buradan okur, eksikse 4K kapsamı sessizce düşer |
| Seri grupları | `seriler.json`: geçerli slug, en az 2 üye, her üye katalogda, hiçbir yapım iki grupta; `anime.seri` alanı gruplarla **simetrik** |
| Fansub grupları | `fansublar.json`: tekil slug/ad, `taksonomi.fansublar` ile aynı slug kümesi, kaynaklarda geçen her grup adı dizinde var |

Ölçüt tartışması: arşivde 5 eski kayıtta URL boşluk taşır (dördünde sondaki boşluk, birinde sorgu
içi); tarayıcı ve `new URL()` bunları normalize ettiği için biçim ölçütü “ayrıştırılabilirlik”
olarak tanımlandı. İlk `\S+` regex sürümü tam da bu 5 kaydı yakalayıp kırmızıya dönmüş, ölçüm
sonrası gerçek çalışma sözleşmesine çekilmiştir.

**`cikti.test.mjs`** derleme sonrası `out/` ağacını denetler: `npm run build` çıktısındaki veriyi
ve html/txt dosyalarını link sağlık kaydıyla karşılaştırır; `out/` yoksa testler atlanır (önce
`npm run build`).

| Kapsam | Ne doğrulanır |
|---|---|
| out/data ↔ public/data | Anime dosya kümesi birebir; `katalog/kunye/saglik/ana-sayfa/taksonomi.json` yayında; bayat artık yok |
| Ölü/engelli sızıntısı | Ne yayına giden veride ne de `out/` html/txt dosyalarında gizlenmesi gereken URL var |
| Rozet denetimi | `"ok"` işareti yalnızca sağlık kaydı gerçekten ok olan kaynakta; tersi de geçerli (ok kaynak rozetsiz kalmaz) |
| PWA/OG varlıkları | `manifest.webmanifest` (standalone + maskable ikon), `sw.js` sürüm damgası, ikon PNG imzaları ve boyutları, `og.png` 1200×630 |
| Seri/fansub sayfaları | Üretilen `/seri/<slug>/` ve `/fansub/<slug>/` sayfa kümeleri veriyle birebir (ne eksik ne fazla); `/seriler/`, `/fansublar/`, `/hesap/`, `404.html` yayında |
| Hesap sayfası | KVKK metni var; `ADMIN_TOKEN`/`JWT_SECRET`/`Bearer ` gibi gizli değer HTML'e sızmamış |

Kısmi harita kuralı: arşiv sağlık dosyası yoksa (ör. CI'da, depo dışında kalır) kaydı bulunamayan
rozet “yanlış” değil “doğrulanamadı” sayılır ve koşu raporunda sayısı bildirilir; sızıntı, sayaç ve
küme denetimleri tam çalışır. `npm test` CI'da derlemeden **sonra** koşar
(`.github/workflows/yayinla.yml`), böylece yayınlanacak artefakt denetlenir.

**`bildirim.test.mjs`** (24) bildirim + yönetici hattını sınar: kuyruk süzgeçleri (geçersiz/yaşlı/tekrar),
URL–host doğrulaması (IP, localhost, `.local` ve tek etiketli adlar reddedilir), host'un URL'den
türetilmesi, `yolCoz` yönlendirme tablosu, PBKDF2 gidiş-dönüşü ve hatalı parola reddi, sabit süreli
karşılaştırma, IP tuzlama (ham IP saklanmaz), CORS denetimi, admin jetonu, oran penceresi ve
24 saat tekilleştirme (sentetik sahte D1 ile; ağ yok). H-18/H-19/H-20 regresyonları: Worker giriş
modülü handler dışında değer dışa aktaramaz (workerd sözleşmesi), blob taşıma sınırı blob sınırını
gölgelememeli ve PBKDF2 iterasyon sayısı platform tavanını aşmamalı (tavan üstü kayıt doğrulamada
hata fırlatmadan reddedilir). H-21 regresyonu: 10 paralel istekte oran sınırı **tam olarak** sınır
kadarını geçirmeli (atomiğin `meta.changes` kararı sahte D1'de taklit edilir).

**`dongu.test.mjs`** (8) günlük döngü kararını sınar (ağsız, panel yok): gün anahtarının **yerel**
(açık saat dilimi) hesaplanması ve gece yarısı sınırı, panel kapalıyken koşmama, ayarlanan saat
gelmeden koşmama, aynı gün ikinci kez koşmama, başarısız koşudan sonra 3 saat bekleme,
`hemen`/`--zorla` bayraklarının kararı ezmesi, panel ayarı okunamazsa güvenli (koşmayan) davranış
ve karar metninin kararlı olması. Ret veren her dal için girdi sentetik olarak kurulur.

**`derleme.test.mjs`** (14) derleme adımının kilit/tekrar mantığını sınar (ağsız, gerçek dosya yok,
gecikme yok): kilit hatalarının tanınması (`EBUSY`/`EPERM`/`EACCES`/`ENOTEMPTY` ve Windows'un
“being used by another process” metni), gerçek derleme hatalarının kilit **sanılmaması** (tip hatası,
eksik modül, boş disk), beklemelerin artan sırası ve sınırda durması, kilit geçiciyse bekleyip
başarıya ulaşılması, kilit sürerse sınırlı denemeyle `hata` dönülmesi, kilit dışı hatanın **tekrar
edilmemesi** (gerçek hata gizlenmez) ve `out/` sökümünün kilit dışı hatada beklemeden dönmesi.
Sahte `fs` + sahte `bekle` kullanılır; testler ne diske ne saate dokunur (gerçek kilitli klasörle
ölçüm H-27'de).

**`tmdb.test.mjs`** (17) 4K banner hazırlığının saf kısmını sınar (ağ yok): AniList kimliğinin üç CDN
şemasından çıkarılması (`banner/123-hash`, `banner/n6682-hash`, `cover/large/bx1-hash`; bu dosya
ilk koşuda `n` önekli şemayı yakaladı ve kimlik ayrıştırıcısı düzeltildi), TMDB
eşleme alanının dizi/film ayrımıyla okunması ve bozuk alanın “eşleşme yok” sayılması, backdrop CDN
adresinin kurulması, **en geniş** backdrop'un seçilip 4K eşiğinin altının `yeterli:false`
işaretlenmesi ve kırpım matematiği (`kirpimOrani`: 16:9 kaynak 7,8:1 bantta dikey eksenin yalnızca
%23'ünü korur, hero bandında %82'sini — yani “4K'ya geçince görsel değişir” iddiası ölçülür).
Ayrıca anime detay bandının ölçüsü `globals.css`'ten okunur (`.anime-bant` yüksekliği, `.kap`
genişliği, `.bilgi-izgara` kolonları) ve 16:9 kaynağın **≥%50'sinin** görünmesi şart koşulur: CSS
değişip kırpım bozulursa test kırmızıya döner, ölçü sessizce kaymaz. Arama tabanlı eşlemenin
yargı kısmı da burada korunur (H-30): başlık normalizasyonu (diakritik, noktalama, “Season 2”
atımı, romen rakamı), başlık benzerliği (kapsama durumu 1 değil 0,9 ağırlıklı), `formatTip` ve
`aramaEslesmesi`nin üç şartı — animasyon türü, benzerlik eşiği, yıl ±1. Birebir başlıkta bile beş
yıl uzak bir aday reddedilir; animasyon türü olmayan aday asla kabul edilmez.

**`hesap.test.mjs`** (7) yerel/sunucu birleştirmesini sınar: “en yeni kazanır” (ilerleme,
izlenen, liste), eşit zamanda yerel üstünlüğü, tercihlerde yerel kazanması, çalışmayanlar
birleşimi + 500 sınırı, boş sunucu kopyasının yerel veriyi silmemesi.

**`bicim.test.mjs`** (6) biçimlendirme ve gömme kurallarını sınar: `damgaBicim` sabit biçim ve UTC
etiketi, **saat dilimi bağımsızlığı** (aynı yardımcı `TZ=UTC`, `America/Los_Angeles`,
`Pacific/Kiritimati` altında ayrı süreçlerde birebir aynı metni üretmeli — dosya doğrudan
`src/lib/bicim.ts` içe aktarılır, bu Node ≥ 22.18'in TypeScript şerit açmasını gerektirir ve
desteklenmiyorsa test atlanır), `jsonLdGuvenli` kaçışı ve JSON anlamının korunması, ayrıca iki
yapısal denetim: sunucu bileşenlerinde `new Date(…).toLocale*` bulunmamalı, iframe izin listeleri
`fullscreen` içermeli ve `allowFullScreen` kullanılmamalı.

Ölçüm: **129 test / 129 geçti**, yerelde ~16 sn (derleme hemen sonrası ölçüm; dosya dağılımı: tarama 32 · bildirim 24 ·
tmdb 17 · derleme 14 · veri 11 · döngü 8 · çıktı 7 · hesap 7 · biçim 6 · api-dokumani 3; soğuk disk önbelleğinde böyle — out verisi
~1,4 sn + html/txt taraması ~2,9 sn + veri taraması ~1,9 sn, kalanı 6 bin anime/961 seri dosyası;
sıcakta ~7 sn); CI simülasyonunda (arşiv sağlık dosyası yokken)
aynı sonuç — 941 rozet “doğrulanamadı” olarak raporlanır. Testlerin gerçekten hata yakaladığı üç yoldan ölçüldü:
(1) H-14 öncesi kod aynı girdide (`01.10.2026 14:23:45`) yanlış milisaniyeyi döndürüyor, mevcut
kod doğrusunu; (2) `veri.test.mjs`'e bilerek sahte bir ölü kaynak enjekte edilince sayaç, sızıntı
ve künye testleri aynı anda kırmızıya döndü; (3) `out/data` kopyasına ölü URL + sahte/eksik rozet
enjekte edilince üç çıktı denetimi kırmızıya döndü (her iki deneyde dosyalar birebir geri
yüklendi) — yani hata geri gelirse CI kontrolleri kırmızıya döner.

Test edilen kod ile üretimde koşan kod aynı dosyadır: `link-tara.mjs` modül olarak içe alındığında
CLI akışını çalıştırmaz ve durum dosyasına yazma tanıtıcısı açmaz (mantığın ikinci bir kopyası
tutulmaz).

### H-15 · API slug doğrulaması gerçek slug'ları reddediyordu

Bildirim ucunda slug deseni `^[a-z0-9][a-z0-9-]{0,79}$` idi (80 karakter). `veri.test.mjs`'e eklenen
seri grubu denetimi ilk koşuda `one-piece-episode-of-sabo-…` (85 karakter) slug'ında kırmızıya
döndü; ölçüm arşivdeki en uzun slug'ın **144 karakter** olduğunu gösterdi. Sınır üç yerde (Worker,
`tools/bildirim-cek.mjs`, test) 200'e çekildi. Ders: desen sınırları gerçek veriyle ölçülmeden
yazılmamalı.

### H-16 · Yeni `seriGrubu` alanı künye sayfasında görünmüyordu

Veri üretildi (`kunye.seriGrubu = 961`) ama `/kunye/` yalnızca `fansubGrubu` kartını basıyordu;
tarayıcı doğrulamasında fark edildi ve “seri (franchise) grubu” kartı eklendi.

### H-17 · API kapalıyken hesap sayfası işlemeyen form gösteriyordu

`NEXT_PUBLIC_API` boşken giriş/kayıt formu gösteriliyor, gönderim sessizce başarısız oluyordu.
Artık bu durumda form yerine yerel-öncelikli bilgilendirme + veri indirme/temizleme paneli
gösterilir; form yalnızca servis yapılandırıldığında çıkar.

### H-18 · Worker giriş modülü sabit dışa aktardığı için hiç açılmıyordu (kritik)

`wrangler dev` şu hatayla düşüyordu: “The Workers runtime failed to start” ve ayrıntıda
`Incorrect type for map entry 'BILDIRIM_GUNLUK_SINIR': the provided value is not of type
'function or ExportedHandler'`. Neden: workerd, işçinin GİRİŞ modülünden yalnızca fonksiyon ya da
ExportedHandler biçimli dışa aktarıma izin verir; `api/src/index.mjs` ise sabitleri ve saf
yardımcıları test edilebilirlik için dışa aktarıyordu. Deploy'da da aynı hatayla açılmazdı.
Düzeltme: tüm sabit + yardımcı katman `api/src/yardimci.mjs`'e taşındı; giriş yalnızca varsayılan
fetch'i dışa aktarır. Regresyon: `bildirim.test.mjs` giriş modülünün her dışa aktarımının
handler olduğunu denetler (bu test, hata geri gelirse `npm test`'i kırmızıya döndürür).

### H-19 · 512 KB blob sınırı ulaşılamazdı; büyük senkron paketleri kaydedilemiyordu

`govdeOku` her istekte 64 KB gövde sınırı uyguluyordu; `/me/durum`'daki 512 KB blob denetimi bu
yüzden hiç çalışmıyor, 64 KB üstü senkron paketleri `400 govde-buyuk` ile reddediliyordu
(belgelerde söz verilen `413 veri-buyuk` yolu ölü koddu). Düzeltme: `govdeOku(istek, sinir)`
sınırı parametreleşti; `/me/durum` taşıma sınırını (JSON tırnak kaçışı ~2 katına şişirebildiği için
blob sınırının iki katı + pay) geçirir ve blob ölçüsü artık **UTF-8 baytı** ile yapılır (D1 satır
sınırı bayt cinsindendir: 2 MB). Uçtan uca test 513 KB gövdenin `413 veri-buyuk` döndüğünü
kanıtlar; birim test iki sınırın ilişkisini çiviler.

### H-20 · PBKDF2 iterasyon sayısı üretimin izin verdiğinin üzerindeydi (kritik, yalnızca gerçek deploy'da görünür)

İlk gerçek dağıtımda `/auth/kayit` ve `/auth/giris` **500 sunucu-hatasi** döndü; `wrangler tail`
gerçek nedeni verdi:

```
NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 210000).
```

Yerel `wrangler dev` bu sınırı **uygulamaz**: 210.000 iterasyonla bütün yerel uçtan uca testler
(45/45) ve birim testleri geçiyordu, çünkü sınır yalnızca üretim işçisindedir. Düzeltme: `PBKDF2_TUR`
platform tavanı olan **100.000**'e çekildi (`PBKDF2_TAVAN`), tavandan yüksek iterasyonlu kayıtlar için
`parolaDogrula` hata fırlatmak yerine reddeder (`false`). Regresyon testi iterasyon sayısının
tavanı aşmadığını ve tavan üstü kaydın temiz reddedildiğini çiviler; `npm test` artık bu hatayı
yerelde yakalar. Ders: **platform sınırları yerel çalışma zamanında görünmeyebilir — ilk gerçek deploy bir
test adımıdır.** Ölçüm: aynı istekte `cpuTime 28 ms`, `wallTime 265 ms`, `outcome ok` (bu değer
ücretsiz planın 10 ms CPU bütçesinin üzerindedir; hesap Workers Paid tarafında olmalı).
Ayrıntı: [06](06-yayin-ve-deploy.md), [11](11-hesaplar-uygulama.md), ADR-0008.

### H-21 · Oran sınırı atomik değildi (eşzamanlı istekler sayacı atlatıyordu)

`oranAsildi` penceresi önce `SELECT` ile okunuyor, sınır uygunsa ardından `UPDATE` ile artırılıyordu.
İki adım arasında aynı anahtarla gelen paralel istekler aynı `sayi` değerini okuyup hepsi geçebiliyor:
**sınır eşzamanlı yükte aşılıyordu** (klasik check-then-act yarış koşulu). Düzeltme tek atomik
koşullu artırmaya çevrildi: pencere tazelenir (`INSERT … ON CONFLICT DO UPDATE`, pencere eşitse sayaç
korunur), sonra `UPDATE oran SET sayi = sayi + 1 WHERE anahtar = ? AND pencere = ? AND sayi < ?`
koşuluyla artırılır; `meta.changes === 0` ise sınır aşılmıştır ve istek reddedilir. Artık karar
veritabanının kendi yazma kilidinde veriliyor.
Regresyon testi 10 paralel istek gönderip **tam olarak** sınır kadarının geçtiğini çiviler. Negatif
kontrol: eski algoritma izole edilip aynı 10 paralel istek verildiğinde engellenen = 0, sayaç = 1
oldu — yani test eski kodu gerçekten yakalıyor. Üretimde `--oran` ile doğrulandı: 31 ardışık bildirim
sonrası 429 `cok-fazla-istek` (`api:test` 46/46).

### H-22 · iframe izin listesinde `fullscreen` yoktu (konsol uyarısı)

Üç iframe hem `allow="…"` hem `allowFullScreen` (eski `allowfullscreen`) taşıyordu; `allow`
dışında kalan `fullscreen` izni verilmediği için tarayıcı her gömmede
`Allow attribute will take precedence over 'allowfullscreen'` uyarısını basıyordu (anime sayfasında
5 kez). İzin listelerine `fullscreen` eklendi, eski öznitelik kaldırıldı. Doğrulama yalnızca uyarının
kaybolması değil: `iframe.featurePolicy.allowsFeature('fullscreen')` tarayıcıda **true** dönüyor,
yani tam ekran yetkisi gerçekten açık (kullanıcıya görünen davranış değişmiyor). Yapısal test
`allowfullscreen` kalıntısını ve `fullscreen`'siz izin listesini CI'da engeller.

### H-23 · Derleme damgası yerel saat dilimine bağlıydı (CI ile yerel farklı HTML üretiyordu)

Altbilgi ve künye sayfası `new Date(kunye.uretim).toLocaleDateString/toLocaleString('tr-TR')`
kullanıyordu. Bu metin **derleme sırasında** üretilir: GitHub Actions UTC, geliştirici makinesi UTC+3
olduğu için aynı kaynak koddan farklı HTML çıkıyor (aynı damga: `1 Ekim 2026` / `30 Eylül 2026`
— ABD batı yakası için bir gün öncesi). Tekrarlanabilir derlemeyi bozan bu bağımlılık `damgaBicim`
ile kaldırıldı: biçim `timeZone: 'UTC'` ile sabitleniyor ve çıktıya `(UTC)` eklenerek okurun yanlış
yorumlaması engelleniyor. Test, aynı yardımcıyı ayrı Node süreçlerinde `TZ=UTC`,
`America/Los_Angeles`, `Pacific/Kiritimati` ile çalıştırıp çıktının **birebir aynı** olduğunu
çiviler; negatif kontrol eski kodun Los Angeles'ta `30 Eylül 2026` ürettiğini gösterdi.

### H-24 · JSON-LD gövdesi kaçışsız gömülüyordu (latent XSS)

Anime sayfası `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}` kullanıyordu;
`JSON.stringify` `<` karakterini kaçırmaz, yani veriye giren tek bir `</script>` alanı betik etiketini
erken kapatıp sayfaya HTML enjekte edebilir. Bugünkü veride böyle bir dizi yok (bu yüzden olgu
değil, **latent** risk), ancak arşiv dış kaynaklardan zenginleştiriliyor. `jsonLdGuvenli` eklendi:
`<` karakteri `\u003c` olarak yazılır (JSON anlamı değişmez, tarayıcıda aynı değere çözülür ama
betik etiketi kapanmaz). Test hem kaçışı hem `JSON.parse` sonrası değerin birebir korunduğunu
denetler; kaynak kodda ham `JSON.stringify` ile gömmenin geri gelmesi de CI'da engellenir.

### H-25 · Ana sayfada `canonical` yoktu

Diğer tüm sayfalarda `alternates.canonical` vardı (7.436/7.442), ana sayfada yoktu;
`href="…/GenesisAnime/"` etiketi artık üretiliyor. Aynı adresin iki biçimi (`/index.html`,
`?utm=…`) arama motorunda tek sayfaya toplanır ve kopya içerik riski kalkar.

### H-26 · Mobilde anime detay sayfası taşıyordu (≤860px)

Dar ekranda `.bilgi-izgara` `130px 1fr` iki kolona iniyordu: poster 130px'lik sütunda kalırken
eylem düğmeleri ("1. Bölüm", "Listeme ekle") `white-space: nowrap` yüzünden bu sütundan taşıp
yanındaki künye rozetlerinin üstüne biniyordu. ≤700px için yeni kırılım eklendi: tek kolon, poster
168px ve ortada, düğmeler tam genişlik 44px, rozetler eşit bölüşen ızgarada. Aynı geçişte oynatıcı
sayfası da düzeltildi: eylem düğmeleri iki sütunlu ızgarada 42px'e çıktı, kaynak çipleri dağınık
sarmak yerine hizalı ızgaraya oturdu (dar ekranda 2×152px), uzun fansub adları kırpılmak yerine iki
satıra sarıyor. Ölçüm (390×844, üretim derlemesi): taşan düğme 0 · `scrollWidth 373 < 390` ·
ana sayfa/keşfet/künye sayfalarında da yatay taşma yok.

### H-27 · `out/` kilidi gecelik derlemeyi düşürüyordu (koşu boşa gidiyordu)

Gecelik döngü statik çıktıyı baştan yazarken `out/` klasörü başka bir süreçte açıksa (yerel önizleme
sunucusu, açık dosya gezgini, senkron aracı) Node Windows'ta `EBUSY`/`EPERM` verir. Tarama ve veri
adımları tamamlanmış olmasına rağmen koşu `hata` damgası alıyor ve “hata sonrası 3 saat bekle”
kuralı yüzünden gün boşa gidiyordu. Düzeltme: derlemeden **önce** `out/` sökümü 5 sn arayla 6 kez
denenir; derleme yine kilit hatasıyla düşerse 15 ve 45 sn beklenerek en çok 3 denemeye çıkar. Kilit
dışı hatalar (tip hatası, eksik modül, boş disk) **tekrar edilmez** — gerçek hata gizlenmez. Kilit
yine sürerse koşu `hata` olur ama panel notuna nedeni ve çözüm önerisi yazılır.

**Ölçüm (gerçek kilit):** projenin kendi `out/`u riske atılmadan, aynı düzeni taklit eden geçici bir
klasörde çalışma dizini o klasör olan ayrı bir süreçle kilit kuruldu. Kilit sürerken
söküm 3 denemede `ok:false` döndü ve `kilit:true` işaretlendi; kilit kalkınca 6. denemede `ok:true`
ve klasör gerçekten silindi (≈6 sn bekleme). Dikkat çeken ayrıntı: Windows bu senaryoda `EBUSY`
değil **`EPERM, Permission denied`** verdi — algılama bu yüzden tek bir koda değil, kilit sınıfına
bakıyor. Ayrıntı: `tools/lib/derleme.mjs`, testler `tools/testler/derleme.test.mjs` (14).

### H-28 · Testin beklentisi yerel saat dilimine bağlıydı (CI kırmızı, yayın dağıtımı durdu)

`dongu.test.mjs` içindeki gün anahtarı testi sabit bir UTC anını (`2026-10-01T22:30:00.000Z`) yerel
güne çevirip `2026-10-02` bekliyordu. Bu beklenti yalnızca UTC+2 ve doğusunda doğrudur; GitHub
koşucuları UTC'de çalıştığı için aynı an orada `2026-10-01` döndü ve **iki yayın koşusu da**
(`62ffc09`, `a347d7f`) test adımında düştü: `expected '2026-10-02', actual '2026-10-01'`. Derleme
başarılı olduğu hâlde `yayinla` işi (`needs: derle`) hiç çalışmadı — yani saat dilimi hatası siteyi
iki kez yayınlatmadı. Düzeltme: beklenti artık anın kendisinden türetiliyor; test `yerelGun()`in
yerel bileşenleri kullandığını doğruluyor ve UTC günü ayrıştığında sabit bir gün değil
**eşitsizliği** sınıyor. Kanıt: aynı dosya `TZ=UTC node --test …` altında 8/8, tam kapı
`TZ=UTC npm test` ile 129/129 geçiyor. Ders: yerele/saat dilimine bağlı beklenti yalnızca yazıldığı
makinede doğrudur; CI'ı yerelde taklit etmenin en ucuz yolu `TZ=UTC npm test`.

### H-29 · TMDB eşlemesi kimliği yalnızca banner URL'inden çıkarıyordu (kapsamın üçte biri dışarıda)

4K banner hattının ilk sürümü (01.10) AniList kimliğini **banner URL'inden** çıkarıyordu ve kapsamı
“banner'lı 4.075 animenin %91,4'ü” diye raporluyordu. Cümle doğruydu ama yanıltıcıydı: arşivde
**2.032 yapımın banner'ı yok** ve o sayfalar eşlemeye hiç girmiyordu (bantları da boş kalıyordu).
Yeni ölçüm aracı (`npm run tmdb:kapsam`) gerçek tabloyu gösterdi: 6.107 yapımın **5.850'sinde
AniList kimliği var** (arşiv DB'si `anime_meta.anilist_id`), ama yalnızca 4.075'inde banner var — yani
kimliğin ölçütü banner değil, veridir.

Düzeltme iki parçalı: (1) `anilist` kimliği artık anime JSON'una yazılıyor (provenans), eşleme onu
okuyor, banner URL'inden çıkarma yalnızca geriye dönük yedek kalıyor; (2) 3000 px eşiğinin altındaki
TMDB backdrop'ları için **HD katmanı** (`bannerTmdb`) açıldı — AniList banner'ı yoksa boş bandı
doldurur, varsa yalnızca AniList tavanını (1900 px) geçtiğinde tercih edilir.

Ölçüm (öncesi → sonrası):

| Ölçüt | Önce | Sonra |
|---|---|---|
| TMDB kimliği | 3.724 (%61,0) | **4.907 (%80,4)** |
| Backdrop kaydı | 3.689 | **4.779** |
| 4K katmanı (≥3000 px) | 2.060 (%33,7) | **2.403 (%39,3)** |
| Bandı dolu anime sayfası | 4.075 (%66,7) | **5.164 (%84,6)** |
| Bandı boş anime | 2.032 | **943** |

Kalan 943 yapımın Fribb eşlemesinde karşılığı yok (257'sinin AniList kimliği de yok); onlar için arama
tabanlı eşleme (TMDB `/search`) gerekiyor. Ders: paydası yazılmayan bir kapsam oranı yanıltır —
“%91,4” hangi kümenin içinde ölçüldüğü söylenmeden bir başarı gibi okunuyordu.

### H-30 · Veri kümesinde karşılığı olmayan yapımlar için aramanın riski ölçülmeden kullanılamazdı

Fribb `anime-list` 943 yapımı kapsamıyor (çoğu OVA/ONA/özel bölüm). Onlar için TMDB arama ucu
gerekiyordu ama arama "en iyi tahmin" üretir: **yanlış yapımı bağlamak, bandı boş bırakmaktan
kötüdür** (sayfada başka bir yapımın görseli görünür). Bu yüzden kabul üç bağımsız şarta bağlandı —
animasyon türü (`genre_ids` içinde 16), başlık benzerliği ≥0,85 ve **yıl ±1** — ve güven etiketi
yazıldı (`tam`/`yakin`). Benzerlik fonksiyonu "biri diğerini kapsıyor" durumunu bilinçli olarak 1
değil 0,9 sayar: "X" ile "X: Alt Başlık" sık sık aynı yapımdır ama yıl kontrolü olmadan
"Naruto"/"Naruto: Shippuuden" gibi çiftleri karıştırır.

**Riskin ölçülmesi (`npm run tmdb:ara -- --golge=200`).** Ölçüm, hattın kendisiyle yapıldı: veri
kümesinde karşılığı **olan** 200 yapımda arama gizlice çalıştırıldı (Fribb kimliği saklandı), sonra
bulunan kimlik Fribb'in kimliğiyle karşılaştırıldı.

| Sonuç | Adet | Sınıf |
|---|---:|---|
| Aynı kimlik | 141/200 (%70,5) | doğru |
| Farklı kimlik, çapraz tip (film↔dizi, aynı ad+yıl) | 11 | granülerlik farkı — Fribb dizinin kimliğini verirken arama asıl film kaydını buluyor |
| Farklı kimlik, aynı tip | 1 | TMDB'de çift kayıt (`saint-seiya-soul-of-gold`) — incelenmeli sınıfı |
| Bulunamadı | 47/200 (%23,5) | kapsam kaybı, yanlış eşleşme değil |

Ölçülen **yanlış yapım bağlama oranı %0**: "farklı kimlik" sınıfının tamamı aynı başlık ve yılı
taşıyan farklı granülerlikteki kayıtlardı. Ders: bir sezgisel (heuristik) hattı üretime almadan
önce, **doğru cevabı bilinen bir örneklemde** ölçmek gerekiyor — gölge modu bunun için kalıcı bir
araçtır, tek seferlik bir deney değil.

**Tam koşu ve kapattığı boşluk.** 943 hedefin **359'u** kabul edildi (%38,1: `tam` 193 · `yakin` 166),
584'ünde TMDB'de karşılık yok (çoğu tek bölümlük OVA/özel bölüm — TMDB bunları ana dizinin içine
gömüyor). Kabul edilen 359 kaydın 102'si "çapraz tip": arşiv kaydı OVA/SPECIAL derken TMDB aynı
eseri film sayıyor (`Ark IX (2013)` gibi) — örneklemde hepsi **aynı ad + aynı yıl** taşıyordu.

| Ölçüt | Arama öncesi | Arama sonrası |
|---|---|---|
| TMDB kimliği | 4.907 (%80,4) | **5.266 (%86,2)** |
| Backdrop kaydı | 4.779 | **5.079** |
| 4K katmanı (≥3000 px) | 2.403 | **2.495 (%40,9)** |
| HD katmanı (<3000 px) | 2.094 | **2.269** |
| Bandı dolu anime sayfası | 5.164 (%84,6) | **5.306 (%86,9)** |
| Bandı boş anime | 943 | **801** |

**`api-dokumani.test.mjs`** (3) yayınlanan API belgesinin koddan kopmadığını sınar (ağ yok):
`src/app/api-dokumani/page.tsx` içindeki her `YÖNTEM /yol` satırı gerçekten yönlendiriliyor mu
(`yolCoz` → “yok”/“yontem-yok” çıkarsa test düşer), belge ile `api/src/index.mjs` başlık yorumundaki
kanonik uç listesi **birebir** aynı mı (üç kaynak: belge ↔ yorum ↔ yönlendirici), ve belgede zorunlu
başlıklar (`Bearer`, `ADMIN_TOKEN`, `CORS`, `429`, `409`) yazılı mı. Böylece yeni bir uç eklenip
belge unutulursa CI uyarır — belge ayrı bir doğruluk kaynağı olarak yaşlanamaz.

### Link tarama testleri

`npm run link:test` sınıflandırıcıyı **canlı URL'lerle** sınar (20 örnek: canlı/ölü/belirsiz
beklentileri karışık). Kural değişikliğinden sonra bu komut çalıştırılmadan iş bitmiş sayılmaz;
beklentisi canlı koşullara bağlı örnekler (sibnet oran sınırı, VK yük davranışı) iki sonucu da
kabul edecek biçimde tanımlıdır.

## Yapılacaklar (test altyapısı)

- **Kural:** yeni bir karar kuralı/imza eklerken `tools/testler/tarama.test.mjs` içine sentetik bir
  örnek yazılır; testler ağsız koşmalıdır (canlı sınama `npm run link:test`'in işidir)
- Otomatik uçtan uca test (Playwright): ana sayfa → arama → detay → oynatıcı → kaynak değiştir
- Veri bütünlüğü testi: `katalog.json` satır sayısı = anime dosyası sayısı = 6.107;
  her `src` girdisinin `tip` değeri `url`; ölü URL'lerin hiçbir dosyada geçmediği kontrolü
- Lighthouse CI (performans/erişilebilirlik bütçesi)
- Görsel regresyon: hero, kart, oynatıcı ekran görüntüleri
