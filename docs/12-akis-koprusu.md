# 12 · Akış Köprüsü (kendi oynatıcının temeli)

Amaç: kullanıcının seçimine göre kaynağın iframe oynatıcısını veya bizim `<video>` elemanımızı
kullanmak. Mail.ru çözümleme/aktarım yolu daha önce ölçüldü; diğer katalog playerları için bu
çalışma güvenli, statik MP4/WebM adaylarını deneyen ek bir resolver yolu getirir. **Katalogda tanınan
host, oynatılabildiği doğrulanmış kaynak demek değildir.** Çalışan/başarısız kaynak listesi yalnız
kullanıcının bu bölümdeki gerçek denemesine göre oluşur. Önceki ölçümlerin ayrıntısı
[04](04-oynatici-ve-kaynaklar.md) ve [olcum/akis-2026-10-02.json](olcum/akis-2026-10-02.json)
içindedir.

## Uçlar (`api/src/akis.mjs`)

```
GET /akis/kapsam
    → { ok, surum, hostlar } (denenebilir resolver host kapsamı; uyumluluk garantisi değil)

GET /akis/coz?kaynak=<embed adresi>
    → { ok, kaynakAdi, tur, url, imzaBitis, aktarim }
    → Mail.ru için metadata ucu; diğer tanımlı sağlayıcılarda embed HTML'indeki açık statik MP4/WebM
    → sonuç imza bitişine kadar (en çok 6 saat) Cache API'de tutulur

GET|HEAD /akis/aktar?u=<imzalı akış adresi>
    → medya baytları, Range ve If-Range KORUNARAK aktarılır
```

Bunların yanında hata telemetrisi uçları `api/src/index.mjs` içinde tanımlıdır:
`POST /akis/hata` (istemci bildirimi) ve `GET /akis/hata?gun=7&limit=40` (yönetici özeti) —
ayrıntı “Hata telemetrisi” bölümünde.

Resolver host tablosu katalogdaki 21 player türünü tanır; bu yalnızca sunucuya **deneme adayı**
olarak gönderilebilecek hostları bildirir. Mail.ru dışında HTML'de açıkça ilan edilen, HTTPS ve
izinli medya hostundan gelen imzalı MP4/WebM aranır. Kaynak JS çalıştırılmaz; HLS/DASH manifesti,
özel API ile üretilen bağlantı, imzasız/genel URL ve izinli olmayan CDN çözülmez. Bu nedenle bazı
denemeler başarısız veya desteklenmiyor dönecektir. Kaynak iframe'i her zaman ayrı seçenek ve yedek
yoldur; çözümleme başarısızsa kaynak playerını ayrıca açmak gerekir.

## İki tasarım kararı

**1. Aktarım ucu açık proxy değildir.** Şartlar birlikte aranır: `https`, izin listesindeki medya
host'u (Mail.ru/OK CDN'leri, MP4Upload, HDvid, Yandex Disk ve izin listesindeki medya CDN'leri)
ve adreste bir **imza veya sağlayıcıya özgü imzalı yol** (`video_key`, `sig`, `tkn`, `expires`…)
aranır. Aksi hâlde bu uç herkesin bedava proxy'si olurdu; hem
kötüye kullanım hem bant maliyeti demek. İzin verilmeyen adres için **hiç ağ isteği yapılmaz**
(`akis-api.test.mjs` bunu doğrular).

**2. Medya olmayan yanıt geçirilmez.** Kaynak HTML hata sayfası döndürürse (403/404 gövdesi)
`502 medya-degil` döner — yoksa tarayıcı video sanıp `MEDIA_ERR` verirdi.

## Ölçümler (02.10)

| Ölçüm | Yerel (`wrangler dev`) | Cloudflare edge (test Worker) |
|---|---|---|
| `/akis/coz` (embed + meta, iki gidiş-dönüş) | 2,3 sn | 2,8 sn |
| `/akis/aktar` `bytes=0-2047` | 206 · video/mp4 · 0,3 sn | 206 · video/mp4 · 0,9 sn |
| İleri sarma `bytes=1000000-1002047` | 206 · 0,1 sn | 206 · 0,1 sn |
| Açık uçlu `bytes=0-` (tarayıcının ilk isteği) | — | 206 · **169.600.484 bayt / 20,4 sn ≈ 8 MB/sn** |
| Tarayıcı `<video>` ile oynatma | `readyState 4`, `duration 1451`, `854×480` | aynı **+ oynatıldı** (`currentTime` 5,9 sn'ye ilerledi) |

Yani zincir uçtan uca çalışıyor: **GitHub Pages'teki sayfa + Workers'taki aktarım + kendi `<video>`**.
Mail.ru CDN'i Cloudflare IP'lerini kabul ediyor; imza tahrif edilirse 403, süresi geçerse 403
(imza gerçekten denetleniyor).

## İstemci entegrasyonu

Kaynak panelinde “Kaynağın playerı” (varsayılan) ve “Sitenin playerı” modları bulunur. Sitenin
playerı seçilince, sunucunun bildirdiği kapsamda olan kaynaklar tek tek çözülür; kapsam dışındakiler
kullanıcı “Dene” dediğinde açıkça zorlanabilir. Her kaynak için aynı anda tek çözümleme yapılır,
tüm katalog topluca taranmaz. Panel; gerçek `<video>` oynatımı doğrulananları, denenmekte olanları,
deneme bekleyenleri, başarısız olanları ve API bekleyenleri birbirinden ayırır. Başarısız bir
çözümleme kaynak iframe'inin de başarısız olduğu anlamına gelmez; mod düğmesiyle iframe'e geçilir.

**Otomatik zincir (04.10):** Sitenin playerında bir kaynak açılmazsa sıradaki kaynak kendiliğinden
denenir; kullanıcı "hiçbiri açılmıyor" duvarına çarpmaz. Aday sırası mevcut sıradan başlar ve şöyle
dizilir: bu oturumda çalıştığı görülen kaynak → kapsam içi host'lar → kalanlar; bilinen
başarısızlar atlanır. Zincir, ilk denemeden sonra en çok **8 kaynağı** otomatik dener (900 ms
aralıkla): `/akis/coz` IP başına günde 300 istekle sınırlı olduğundan tek bölümde kota
tüketilmez. Akış çözülüp de video **20 saniyede** oynamaya başlamazsa kaynak başarısız sayılır
(takılma koruması); 429 gelirse zincir durur ve durum satırı bunu söyler. Panelde açma/kapama
anahtarı vardır: başarıda "çalışan kaynağı buldu (n kaynak denendi)", tükenişte "kalanları elle
deneyebilirsin" yazar.

**Cihaz hafızası (04.10):** Zincirin ilk denemesi artık cihazın kendi deneyimiyle başlar:
`src/lib/akis-kayit.ts` host bazında başarı/başarısızlık sayar (localStorage,
`genesisanime:v1:akis-hostlar`; 30 gün ömür, 60 host sınırı). Bu cihazda en az bir kez oynamış host
“kanıtlı” sayılır ve sonraki bölümlerde “Sitenin playerı”na geçildiği anda **ilk deneme kanıtlı
host'la başlar**; zincirde sıra oturum içi kanıt → cihazda kanıtlı host → kapsam içi → kalanlar
şeklindedir. Tercih, mod düğmesiyle aynı tıklamada (tek render'da) uygulanır — canlı testte ilk
isteğin boşa varsayılan kaynağa gittiği görülüp düzeltildi. Zincir, çözümlemesi başlayan kaynağı
“denendi” sayar; fansub süzgeci karşılaştırması da **içerik** üzerinden yapılır, çünkü tercih
deposunun yeniden yüklenmesi dizi kimliğini değiştirip seçimi sıfırlıyor ve aynı kaynağı ikinci kez
denettiriyordu (canlı test: 7 kaynak, 8 istek). Hiç kanıt yoksa varsayılan seçim değişmez. Veri
cihazdan çıkmaz; kullanıcı elle kaynak seçince otomatik tercih kapanır.

**Hata telemetrisi (04.10):** Sitenin playerında çözülemeyen, türü desteklenmeyen ya da akışı
duran kaynaklar `POST /akis/hata` ile Worker'a bildirilir: `{url, hata, anime?, bolum?}`;
`hata` ∈ `cozulemedi · tur-desteklenmiyor · akis-durdu · akis-erisilemedi · medya-desteklemiyor`.
İstemci kaydı önce cihazdaki kuyruğa yazar (ağ yoksa kaybolmaz, `online` olayında gönderilir);
gönderilen kayıt bir saatliğine “gönderildi defteri”ne işlenir, aynı kaynak+kod bu sürede ikinci
kez yazılmaz. Sunucu da IP başına **200/gün** sınırı ve aynı IP+kaynak+kod için 1 saat
tekilleştirme uygular; IP yalnızca tuzlu SHA-256 özetiyle saklanır. Kayıtlar `akis_hata`
tablosunda (migration `0002-akis-hata.sql`) toplanır; `GET /akis/hata?gun=7&limit=40`
(ADMIN_TOKEN) host bazında toplam + son kayıtları döndürür ve `/yonetim/` panelindeki
**“Sitenin playerı: çözülemeyen kaynaklar”** bölümünü besler. Böylece “hangi host hangi bölümde
çözülemiyor” sorusu gerçek veriyle yanıtlanır — kapsam listesi zamanla ölçümle beslenir.

1. Kullanıcı “Sitenin playerı”nı seçer; seçili kaynak kapsamdaysa `GET /akis/coz?kaynak=<embed>`
   (12 sn üst sınır) başlar. Başka kaynaklar topluca taranmaz. Kapsam dışındakiler “Dene” düğmesiyle
   birer birer zorlanabilir.
2. `NEXT_PUBLIC_API` derleme anında gömülür. Yerel başlatıcı `127.0.0.1:8789` Workers API'yi ve
   `127.0.0.1:3000` siteyi beraber çalıştırır; API CORS'u yalnız bu yerel origin'e açılır. Elle
   çalıştırmada `api/README.md` yerel Worker adımları ve site derlemesine API adresi geçirme
   gereklidir. API'siz derlemede kaynaklar “API bekleniyor” olarak kalır; başarısız kaynak diye
   işaretlenmez.
3. Çözüm MP4/WebM verirse aktarım URL'si `<video>`'ya yüklenir. Yalnız `canplay` olayı gelince
   “çalışan” listesine alınır. Çözümleme/aktarımı başarısız kaynaklar ayrı gösterilir; kullanıcı
   isterse kaynak playerına döner.
4. Akış gelirse `src = <aktarim>` + **`#t=<saniye>`**: kaynak değişiminde konum taşınır (OpenAnime'in
   ölçülen yöntemi, [13](13-openani-oynatici-analizi.md)). Kardeş önlem: bazı tarayıcılar akış
   mp4'ünde konum ekini yok sayabildiği için konum `loadedmetadata` sonrası açıkça da kurulur.
5. Video hata verirse **2 baytlık yoklama** (`Range: bytes=0-1`, `cache: no-store`) aktarım ucunun
   gerçek durumunu söyler — video elemanı HTTP kodunu göremez. **403/502** ise istemci `?t=` ile
   **seçim başına bir kez** taze çözümleme yapar; sonuç yine alınamazsa site playerı hata verir,
   kaynak playerına dönüş düğmesi kalır ve döngü kurulmaz.
6. Gerçek konum cihazda saklanır (`konumKaydet`): bölüm yeniden açıldığında kaldığı yerden başlar
   (iframe yolunda bu bilgi hiç yoktu).
7. Sunucu günlük sınırı aşarsa (429) istemci bunu ayrı anlatır ("akış servisi şu an yoğun") ve
   kaynak playerına geçme seçeneği verir.

| Ölçüm (03.10, tarayıcı) | Sonuç |
|---|---|
| Kendi `<video>` ile oynatma | `readyState 4` · `854×480` · süre **1450,78 sn** · oynuyor |
| Kaynak değişiminde konum koruma (`#t=`) | 305. saniyede kaynak değişti → yeni adres `#t=305`, oynatma **310**'dan devam etti |
| 403/502 → taze çözümleme | imza bozuldu → sıra: `coz` → `aktar` (502) → `coz(taze)` → **324**'ten devam, şerit: "bağlantı tazelendi" |
| Taze deneme de başarısız | döngü kurulmadı: iframe'e düştü + gerekçe satırı göründü |
| Bölüm yeniden açılışı | cihazdaki konum `#t=357` ile uygulandı (oynatma 357'den) |

Sunucu tarafında bu tur eklenenler: `/akis/coz` `?t=<rastgele>` görürse **önbelleği atlar** ve yeni
sonucu yazar (= tazeleme); `/akis/aktar` yanıtları `Access-Control-Expose-Headers` ile aralık
başlıklarını JS'e açar; CORS izinli başlıklara `Range` eklendi (yoklama ön uçuş ister).

**Dağıtım durumu (04.10):** Worker `genesisanime-api` yeni kapsam ucu, genişletilmiş resolver ve
`SITE_ORIGIN=https://genesisanime.github.io` ile üretime alındı; site
`https://genesisanime.github.io/GenesisAnime-site/` adresine GitHub Actions ile dağıtıldı.
Canlı doğrulama: `/akis/kapsam` 200; sitenin playerında **Mail.ru akışı oynadı** (`/akis/aktar`
206 Media, 0:24 / 22:55); VK kaynağı çözülemedi ve "sitenin playerında çalışmayan" listesinde ayrı
göründü. Yani canlıda yalnız Mail.ru yolu kanıtlıdır; diğer host'lar desteklenen **aday**
listesindedir, doğrulanmış değil.

## Sınırlar ve riskler (dürüst liste)

1. **Cloudflare ToS / bant.** Bölüm başına ~170 MB Workers'tan geçiyor. Ücret istek başına
   (1 bölüm ≈ 1-5 aralık isteği), bant genişliği ayrıca faturalanmıyor — ama Cloudflare'in kabul
   edilebilir kullanım koşulları video dağıtımını kısıtlıyor. Ölçüm "teknik olarak çalışıyor" diyor,
   "koşullara uygun" demiyor; bu ayrı bir doğrulama ve karar. (Üçüncü seçenek: kendi VPS.)
2. **İmza ömrü.** Adresler `expire_at` ile günlük; önbellek en çok 6 saat. Gece yarısını geçen bir
   önbellek girdisi 403/502'ye düşer → istemci bunu 2 baytlık yoklamayla ayırt edip `?t=` ile bir
   kez tazeliyor; uç `?t=` görünce önbelleği atlıyor (03.10, ölçüm yukarıda).
3. **Kapsam.** Host tablosunda tanınmak oynatılabilirlik garantisi değildir. Genel resolver yalnız
   HTML'de açıkça bulunan güvenli, imzalı statik MP4/WebM'yi alır; JS/API playerları, HLS/DASH,
   göreli manifest parçaları ve tarayıcı/IP oturumu isteyen akışlar ayrı resolver/manifest desteği
   ister. Bu kapsamda henüz ölçülmüş başarı oranı yoktur.
4. **Tek nokta.** Aktarım Workers'a bağlı; Workers kesintisi oynatmayı durdurur (iframe yolu
   etkilenmez, o yüzden yedek yol korunmalı).
5. **Kötüye kullanım yüzeyi.** ✅ 03.10: `/akis/coz` için **günlük IP sınırı** var (300 gerçek
   çözümleme/gün; önbellek vuruşları sayılmaz). Aşılırsa 429 döner ve istemci bunu ayrı anlatıp
   iframe'e düşer — sessiz gerileme yok. ✅ 04.10: çözülemeyen kaynak bildirimi (`/akis/hata`,
   IP başına 200/gün) ve panelde host bazında özet. Kalan: başarı oranı ve gecikme sayacı.

## Bu değişikliğin dağıtım sınırı

Bu çalışma üretim servisine dokunmaz. Yerel testler Worker sözleşmesini doğrular; gerçek üçüncü taraf
kaynak oynatımının her player türü için çalıştığını kanıtlamaz. Canlı doğrulama ve Worker dağıtımı
ayrı adımdır; bu dosyadaki eski 03.10 ölçümleri yalnız o tarihte test edilen Mail.ru yoluna aittir.

**Paylaşılan önbellek dersi (H-35):** Cache API aynı zone'daki (`*.workers.dev`) worker'lar
arasında paylaşılıyor — test Worker'ının ölçüm sırasında yazdığı girdiler üretimde servis edildi ve
`aktarim` adresi test Worker'ına işaret etti. Canlı doğrulama yakaladı; önbellek anahtarı `v=2`'ye
sürümlenerek eski girdiler görünmez kılındı. Test Worker'ı silinince yazan taraf da tek kalır.

## Sonraki adımlar

1. **Canlı doğrulama:** Worker/site dağıtımından sonra her sağlayıcı türünden örneklerle; başarı ve
   hata nedenlerini ölç, yalnız doğrulanmış oynatımları desteklenen olarak belgele.
2. **Özel playerlar:** gerekirse yasal/teknik erişimi olan HLS/DASH ve sağlayıcı API/manifest akışları.
3. **Gözlemlenebilirlik:** ✅ 04.10 hata bildirimi + host bazında panel özeti; kalan: resolver başarı
   oranı, gecikme ve aktarım hatalarının sayacı (kişisel veri saklamadan).
4. **Kendi kontrol katmanı:** tarayıcı kontrolleri şu an temel arayüz; markalı çubuk/önizleme sonra.

## 04.10 · Sağlayıcı kapsamı canlı ölçümü (kim çözülüyor, kim çözülemiyor)

Canlı telemetri (`/akis/hata`, son 7 gün) hangi host'un çözülemediğini gösterdi: sibnet 16, drive 3,
ok.ru 3, vk 3, uqload 2, mail 2, videa 1, mp4upload 1. Bu listeye göre çözümleyiciler yazıldı ve
**dağıtılmış Worker'dan** tek tek doğrulandı (`/akis/coz` → `/akis/aktar` 64 KB aralık isteği):

| Sağlayıcı | Çıkarım | Canlı sonuç |
|---|---|---|
| my.mail.ru, videoapi.my.mail.ru | embed → `metadataUrl` → imzalı mp4 | ✅ 206 `video/mp4` |
| vk.com, myvi.tv | embed içi `"files"` JSON (720p'ye kadar) | ✅ 206 `video/mp4` |
| ok.ru, odnoklassniki.ru | embed içi `"videos"` JSON (hd→mobile) | ✅ 206 `video/mp4` |
| drive.google.com, docs.google.com | dosya kimliği → `drive.usercontent.google.com` (`confirm=t`) | ✅ 206 `video/mp4` |
| yadi.sk, disk.yandex.* | herkese açık API → imzalı `href` | ✅ 206 `video/mp4` |
| uqload.*, luluvdo.* | paket (Dean Edwards) çözülür → imzalı HLS master | ✅ 200 liste, parçalar aktarımdan |
| sibnet | — | ⛔ sunucu **tüm** veri merkezi isteklerine 403 (“administrative rules”) |
| mp4upload | — | ⛔ medya sunucusu çıkışa **kararsız** 403 (aynı URL bir kez 206, sonra 4×403) |
| dailymotion | metadata API imzalı manifest verir | ⛔ manifest veri merkezi çıkışına 403 |
| voe / dood / byse / ghbrisk / cda / videa | — | ⛔ oynatıcı adresi yalnız istemci JS'iyle kurulur (videa `player/xml` sunucuya 403) |
| mega | — | ⛔ uçtan uca şifreli (sunucu çözemez) |
| hdvid / cyberfile / pixeldrain | — | ⛔ origin 523 / dosya adı kaçışsız `&` / aracı sayfa akış vermiyor |

**Sonuç ve dürüst sınır:** katalogdaki kaynakların çoğu (sibnet ≈ 55 bin kayıt) *sunucudan*
çözülemiyor — bu bir kod eksiği değil, sağlayıcının IP politikası. Sibnet gibi erişimi kapalı
host'lar **kendi `<video>` oynatıcımıza alınamaz**; oyuncularda iframe yolu kalır. Buna karşılık
mail/VK/OK/Drive/Yandex/uqload/luluvdo yolları artık kendi oynatıcımızda oynuyor.

**HLS desteği (yeni):** uqload/luluvdo ailesi akışı HLS master listesi olarak veriyor. `/akis/aktar`
listeyi **yeniden yazıyor** (düz satırlar + `#…URI="…"` öznitelikleri kendi ucumuza çevrilir, imza
ve CORS engeli böyle aşılır), istemcide Safari yerel oynatır, diğer tarayıcılarda `hls.js` yalnız
gerektiğinde dinamik yüklenir.

**Sağlayıcı yeteneği sunucuda (`cozulebilir`):** `/akis/kapsam` artık `hostlar` (denenebilir) ve
`kapsamDisi` (gerekçesiyle çözülemezler) döner. Zincir, sunucu kapsamı okunduysa **kapsam dışı
host'ları hiç denemez** — site modunda 900 ms'lik boş turlar ve “takıldı” hissi böyle kalkar.
Kapsam okunamazsa eleme yapılmaz (bilgi yoksa varsayılmaz).

**Aktarım dürüstlüğü:** yukarı akış ≥400 dönerse artık medya sanılmaz; yanıt 502 `kaynak-reddetti`
+ `ayrinti: upstream-<kod>` olur (boş HLS listesi de 200 diye geçirilmez).

## 04.10 · Sürüm çubuğu ve kanıt penceresi

- **Sürüm çubuğu:** `sw.js` yeni sürümü `skipWaiting()` ile devralınca açık sekme eski chunk'ta
  kalıyordu. `controllerchange` (sayfa **önceden de** kontrollüyse) alt çubuğu çıkarır:
  “Yeni sürüm hazır — yenile”. Kayıt 30 dakikada bir ve sekme görünür olduğunda yoklanır.
  Metin/karar `src/lib/surum.ts` içinde; bileşen metni kendi yazmaz.
- **Kanıt penceresi:** cihazdaki “bu host oynadı” kanıtı artık **14 gün** sonra düşer (`sonOk`).
  Ölü URL tekrarları iyi bir host'u hemen demote etmez: hata sayısı başarıların ~3 katını (artı 3
  taban) geçmedikçe kanıt korunur. Puan her 14 günde yarılanan tazelikle çarpılır.

## 04.10 · Kaydırma kasması (jank) — ölçüm ve düzeltme

Kullanıcının bildirdiği "site kasıyor" şikâyeti canlı sayfada ölçümle kaynağına
kadar izlendi. İki bağımsız yük vardı:

### 1 · Bin küsur `backdrop-filter` katmanı

`document.querySelectorAll('*')` üzerinde hesaplanan stil taraması ana sayfada
**1.085** bulanık katman gösterdi: 540 kart × 2 rozet (`.kart-rozet`), sabit üst
bar (`.ust`) ve sabit alt menü (`.alt-menu`). Her bulanık katman kaydırma
karesinde arkasındaki içeriği yeniden rasterlamak zorunda olduğundan mobil
GPU'da kare düşüşünün doğrudan sebebiydi.

Düzeltme: rozetler ve iki sabit çubuk opak zemine geçti; bulanık katman
yalnızca **tek seferlik** katmanlarda kaldı (fragman penceresi `.katman`,
ikincil düğme `.dugme-ikincil`). Canlı doğrulama: **1.085 → 4**.

### 2 · Tam boy posterler

Kartlar 142–178 px genişliğinde, ama arşivdeki MAL posterleri 225×319 ve
ortalama ~36 KB. 540 kart birlikte ~19 MB görsel demekti. MyAnimeList CDN'i
`/r/<GxY>/images/...` yolunda gerçek küçültme sunuyor:

| varyant | ölçü | ort. boyut |
|---|---|---|
| `/images/...` | 225×319 | ~36 KB |
| `/r/356x508/images/...` | 356×508 | ~47 KB (retina adayı) |
| `/r/178x254/images/...` | 178×254 | ~14 KB |

`srcSet` üç adayı bildirir, tarayıcı DPR'a göre seçer. Ölçülen tasarruf:
**%62** (240 kartlık ilk açılış 8,5 MB → 3,2 MB). 9.762 poster tarandı;
küçültülemeyen adres yok (Kitsu/Simkl/ANN zaten küçük varyant servis ediyor).

**`sizes` tuzağı:** çıplak uzunluk listesi (`"142px, 178px"`) geçersiz bir
`sizes` değeridir — tarayıcı son değeri (178px) uygular ve mobilde büyük
varyantı indirir (canlı ölçüm: kart 142 px görünürken 340×481 indi). Doğru
biçim medya koşulludur: `(max-width: 860px) 142px, 178px`.

### 3 · Doğrulama

| ölçüm | önce | sonra |
|---|---|---|
| ana sayfa bulanık katman | 1.085 | 4 |
| keşfet bulanık katman | — | 1 |
| oynatıcı sayfası bulanık katman | — | 0 |
| ana sayfa tam boy poster isteği | 240 | 0 |
| ilk açılış poster baytı (240 kart) | ~8,5 MB | ~3,2 MB |
| kaydırma boyunca uzun görev (long task) | — | 2 (toplam 107 ms) |

Kurallar `tools/testler/kasma.test.mjs` ile kilitlendi (bulanık katman bütçesi,
poster küçültme, `sizes` medya koşulu, `contain: paint`).

### 4 · Sürüm çubuğu mobilde

Sabit alt menü 68 px yüksekliğinde ölçüldü; çubuk 70 px'lik varsayımla
konumlanınca metin menüye değiyordu. Taban 88 px'e alındı (`calc(88px +
env(safe-area-inset-bottom))`) — canlı doğrulama: menü üstü 776 px, çubuk altı
766 px, **10 px boşluk**. Ölçü `tools/testler/surum.test.mjs` içinde alt menü
yüksekliğine bağlandı.

## 04.10 · Çözüm önbelleği: aynı kaynak ikinci kez taranmaz

Sitenin playerı modu her seçimde adayları baştan tarıyordu: `/akis/coz` +
upstream + HLS manifesti. Oysa çözülmüş bir adres bir süre geçerli kalır; aynı
kaynağa dönmek yeniden taramayı gerektirmez.

`src/lib/akis-kayit.ts` içine — kanıt kaydının yanına — çözüm önbelleği eklendi:

| kural | değer | gerekçe |
|---|---|---|
| anahtar | `genesisanime:v1:akis-cozum` | host hafızasından ayrı; silinse bile site çalışır |
| sınır | 80 adres | kullanıcı başına tek satır; yerel depo şişmez |
| ömür | imza varsa `imzaBitis − 30 sn`, yoksa 6 saat | akış adresleri imzalı; süresi geçen adres 403 döner |
| yazma anı | `onCanPlay` | kanıt oynatmadır: yalnız çözülüp oynatılmayan adres kaydedilmez |
| zincir puanı | 0,5 | kanıtlı hosttan (1) önce, taranmamıştan sonra denenir |

Okuma yolu seçim anındadır: `cozumOku(adres)` doluysa oynatma doğrudan kurulur
ve **hiç ağ isteği yapılmaz**. Bayat kayıt kendini tedavi eder: `<video>`
403/502 alırsa mevcut tazeleme yolu adresi yeniden çözer ve yeni sonucu yazar.

Ölçüm (yerel derleme, `/akis` gerçek Worker'a vekillenerek; 11eyes 1. bölüm):

| senaryo | `/akis/coz` | sonuç |
|---|---|---|
| soğuk (önbellek yok, site modu) | 1 — yalnız uqload | oynatma başladı, `readyState` 4 |
| sıcak (aynı kaynak yeniden seçildi) | 0 | oynatma kaldığı yerden sürdü (34 segment `/akis/aktar`) |

İmza payı 2 dakikadan 30 saniyeye çekildi: 2 dakikalık pay, kalan ömrü 2
dakikanın altına düşmüş her imzayı kullanılamaz sayıyordu ve önbellek
neredeyse hiç tutmuyordu (test yakaladı). Testler:
`tools/testler/akis-kayit.test.mjs` (imza payı, monoton sıralama, sınır, bozuk
kayıt) — 5 yeni test.

## 04.10 · Site modunda yalnız erişilebilen hostlar (Sibnet gizlendi)

Sitenin playerı kaynağı **bizim sunucumuzdan** çeker; sunucunun erişemediği
host orada hiçbir zaman çalışmaz. Buna rağmen liste onları gösteriyordu ve
denemesi boşa gidiyordu.

- kapsam (`/akis/kapsam` → `kapsamDisi`) yüklüyse site modunda yalnız kapsam
  içi kaynaklar listelenir; oynatıcı süzgeci (Sibnet/Uqload düğmeleri) de
  kapsam dışını atlar, yani hiçbir zaman boşa taranmaz.
- kapsam dışı hostlar tamamen kaybolmaz: "N kaynak bu modda gösterilmiyor
  (sunucumuz o host'a erişemiyor)" notu ve tek tıkla Kaynağın playerı'na dönen
  bağlantı kalır. Süzme sonrası liste boşalırsa eski davranışa düşülür — liste
  asla boş görünmez.
- Kaynağın playerı modu değişmez: Sibnet orada görünmeye devam eder, çünkü
  videoyu Sibnet'in kendi oynatıcısı açar.

Canlı/yerel doğrulama (11eyes 1. bölüm: 3 Sibnet + 1 Uqload):

| mod | listede | `/akis/coz` (soğuk) |
|---|---|---|
| Kaynağın playerı | 4 kaynak; Sibnet'ler "Kullanım dışı" | 0 |
| Sitenin playerı | 1 kaynak (Uqload); not: "3 kaynak bu modda gösterilmiyor" | 1 — yalnız uqload |

## 04.10 · Ana sayfa: kademeli satır yükleme (981 KB → 290 KB)

18 satır × 30 kart = 540 kart tek HTML'de geliyordu; tarayıcı yalnız ekranın
üstünü gösterse de tamamını ayrıştırıp hidrasyon yapıyordu.

| ölçüm | önce | sonra |
|---|---|---|
| HTML (ham / gzip) | 981 KB / 89 KB | 290 KB / 36 KB |
| DOM düğümü (ilk açılış) | 6.907 | 1.596 |
| `<img>` sayısı | 544 | 91 |
| kaynak isteği | 250 | 40 |
| ilk açılışta gerçek kart | 540 | 90 (3 satır) |

Mekanik:

1. İlk 3 satır sunucuda render edilir (`HEMEN_SATIR`); kalan 15 satır başlık +
   "Tümünü gör" + 6 iskelet kart olarak basılır — JS hiç çalışmasa bile sayfa
   yapısı ve bağlantılar durur.
2. `TembelSatirlar` gözcüsü **sınırda** durur: yüklenmiş satırların hemen
   ardında, yer tutuculardan önce. Gözcü görüş alanına 900 px yaklaşınca
   `ana-sayfa-kartlar.json` (100 KB ham / 15 KB gzip; tam dosya 369 KB / 99 KB)
   bir kez indirilir, satırlar üçerli gruplar hâlinde eklenir.
3. Konum ölçümü `scroll`/`resize` üzerinde `requestAnimationFrame` ile
   kısıtlanır ve her büyümeden sonra yinelenir; sayfa sonuna atlayan kullanıcıda
   da grup grup yakınsar. Veri indirilemezse yer tutucular olduğu gibi kalır.
4. Kart alanları `tools/ana-sayfa-kartlar.mjs` içinde kırpılır
   (`KART_ALANLARI`); `veri.test.mjs` kırpılmış dosyanın `ana-sayfa.json` ile
   birebir olduğunu ve 128 KB'ı aşmadığını doğrular.

Ölçüm (390×844, yerel derleme): ilk açılışta 180 kart (3 sunucu + 1 grup),
kaydırdıkça 270 → 450 → 540; her grup yalnız gözcü sınıra yaklaşınca eklendi.
Sayfa yüksekliği 9.540 → 9.565 px (iskelet satırı gerçek satırdan birkaç piksel
kısa; kaydırma zıplamıyor).
