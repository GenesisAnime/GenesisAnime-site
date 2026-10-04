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

**Dağıtım durumu (04.10):** bu turdaki kapsam uç noktası, genel statik resolver ve site-player
seçim/listeleri yalnız yerel kaynak değişiklikleridir; üretim Worker'ına veya siteye dağıtılmadı.
Üretimde eski Worker'a bağlanan derlemede `/akis/kapsam` 404 verebilir; Mail.ru dışı kaynakların
çalıştığı varsayılamaz. `NEXT_PUBLIC_API` adresi olan mevcut sitelerde kullanıcı arayüzü değişikliği
yeni site build gerektirir; yeni resolver için Worker da güncellenmelidir.

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
   iframe'e düşer — sessiz gerileme yok. Kalan: istek sayacı ve başarısızlık oranı (gözlemlenebilirlik).

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
3. **Gözlemlenebilirlik:** resolver başarı oranı, gecikme ve aktarım hataları (kişisel veri saklamadan).
4. **Kendi kontrol katmanı:** tarayıcı kontrolleri şu an temel arayüz; markalı çubuk/önizleme sonra.
