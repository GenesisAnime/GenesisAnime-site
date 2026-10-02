# 12 · Akış Köprüsü (kendi oynatıcının temeli)

Amaç: video yüzeyini kaynağın iframe'i olmaktan çıkarıp **kendi `<video>` elemanımızda** oynatmak.
Durum 03.10: **istemci bağlandı** — Mail.ru kaynaklarında (kaynakların ~%27,9'u) video artık bizim
oynatıcımızda oynuyor; çözülemeyen kaynakta bugünkü iframe yolu aynen kalıyor.
Bunun önündeki ölçülmüş engeller [04](04-oynatici-ve-kaynaklar.md) ve
[olcum/akis-2026-10-02.json](olcum/akis-2026-10-02.json) içinde; bu dosya o engellerin etrafından
dolaşan katmanı anlatır. Özet: akış adresi **sunucu tarafında** çıkarılabiliyor ve sunucumuz akışı
çekebiliyor, ama tarayıcı aynı adrese 403 alıyor → aradan geçen bir aktarım katmanı şart.

## Uçlar (`api/src/akis.mjs`)

```
GET /akis/coz?kaynak=<embed adresi>
    → { ok, kaynakAdi, tur, url, imzaBitis, aktarim }
    → embed sayfası → metadataUrl → meta ucu → imzalı akış adresi
    → sonuç imza bitişine kadar (en çok 6 saat) Cache API'de tutulur

GET|HEAD /akis/aktar?u=<imzalı akış adresi>
    → medya baytları, Range ve If-Range KORUNARAK aktarılır
```

Bugün çözümlenebilen kaynak: **Mail.ru** (kaynakların ~%27,9'u). Diğer host'lar
`{ ok:false, hata:'desteklenmiyor' }` döner; çağıran taraf iframe'e düşer. Bu bir gerileme değil,
çünkü oynatıcı zaten iki yollu tasarlanır: köprü varsa kendi `<video>`, yoksa bugünkü iframe.

## İki tasarım kararı

**1. Aktarım ucu açık proxy değildir.** Şartlar birlikte aranır: `https`, izin listesindeki medya
host'u (`my.mail.ru`, `mycdn.me`, `cloud.mail.ru`, `okcdn.ru`) ve adreste bir **imza parametresi**
(`video_key`, `sig`, `tkn`, `expires`…). Aksi hâlde bu uç herkesin bedava proxy'si olurdu; hem
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

## İstemci entegrasyonu (03.10)

Oynatıcı, Mail.ru kaynağı seçildiğinde köprüyü **kendiliğinden** deniyor (`src/lib/akis.ts` karar
kuralları + `IzleIstemci.tsx` bileşeni). Video bizim `<video>` elemanımızda, tarayıcının yerleşik
kontrolleriyle oynar (konum/ses/tam ekran/PiP); çözümleme başarısızsa **hiçbir şey değişmez** ve
kaynak bugünkü iframe yoluyla açılır.

1. Kaynak seçilir → `GET /akis/coz?kaynak=<embed>` (12 sn üst sınır; `NEXT_PUBLIC_API` tanımsızsa
   hiç denenmez). Çözümleme sürerken iframe görünür, üstünde "Mail.ru akışı hazırlanıyor…" örtüsü.
2. Akış gelirse `src = <aktarim>` + **`#t=<saniye>`**: kaynak değişiminde konum taşınır (OpenAnime'in
   ölçülen yöntemi, [13](13-openani-oynatici-analizi.md)). Kardeş önlem: bazı tarayıcılar akış
   mp4'ünde konum ekini yok sayabildiği için konum `loadedmetadata` sonrası açıkça da kurulur.
3. Video hata verirse **2 baytlık yoklama** (`Range: bytes=0-1`, `cache: no-store`) aktarım ucunun
   gerçek durumunu söyler — video elemanı HTTP kodunu göremez. **403/502** ise istemci `?t=` ile
   **seçim başına bir kez** taze çözümleme yapar (imza gece yarısını geçtiyse tek çare bu); sonuç
   yine alınamazsa kaynak iframe'e düşer, döngü kurulmaz.
4. Gerçek konum cihazda saklanır (`konumKaydet`): bölüm yeniden açıldığında kaldığı yerden başlar
   (iframe yolunda bu bilgi hiç yoktu).
5. Sunucu günlük sınırı aşarsa (429) istemci bunu ayrı anlatır ("akış servisi şu an yoğun") ve
   kaynağı iframe'de açar; kullanıcıya sessiz bir hata gösterilmez.

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

**Üretim notu:** uçlar hâlâ yalnızca test Worker'ında (`genesisanime-akis-test`). Site üretim
API'sine sorar, 404 görür ve sessizce iframe'e düşer — özellik, `cd api && npm run deploy`
çalıştırıldığı anda etkinleşir (yönetici kararı).

## Sınırlar ve riskler (dürüst liste)

1. **Cloudflare ToS / bant.** Bölüm başına ~170 MB Workers'tan geçiyor. Ücret istek başına
   (1 bölüm ≈ 1-5 aralık isteği), bant genişliği ayrıca faturalanmıyor — ama Cloudflare'in kabul
   edilebilir kullanım koşulları video dağıtımını kısıtlıyor. Ölçüm "teknik olarak çalışıyor" diyor,
   "koşullara uygun" demiyor; bu ayrı bir doğrulama ve karar. (Üçüncü seçenek: kendi VPS.)
2. **İmza ömrü.** Adresler `expire_at` ile günlük; önbellek en çok 6 saat. Gece yarısını geçen bir
   önbellek girdisi 403/502'ye düşer → istemci bunu 2 baytlık yoklamayla ayırt edip `?t=` ile bir
   kez tazeliyor; uç `?t=` görünce önbelleği atlıyor (03.10, ölçüm yukarıda).
3. **Kapsam.** Bugün yalnız Mail.ru. Odnoklassniki (%11,5) manifest'i `srcIp` (isteyenin IP'si) ile
   imzalı ve varyant yolları **göreli**; onun için aktarım ucunun manifesti çekip içindeki yolları
   kendi adresine çevirmesi gerekir. Sibnet (%42) sunucu tarafına tamamen kapalı, VK (%7,1) adresi
   yalnız özel API ile üretiliyor.
4. **Tek nokta.** Aktarım Workers'a bağlı; Workers kesintisi oynatmayı durdurur (iframe yolu
   etkilenmez, o yüzden yedek yol korunmalı).
5. **Kötüye kullanım yüzeyi.** ✅ 03.10: `/akis/coz` için **günlük IP sınırı** var (300 gerçek
   çözümleme/gün; önbellek vuruşları sayılmaz). Aşılırsa 429 döner ve istemci bunu ayrı anlatıp
   iframe'e düşer — sessiz gerileme yok. Kalan: istek sayacı ve başarısızlık oranı (gözlemlenebilirlik).

## Test Worker'ı

Ölçüm için `genesisanime-akis-test` adlı **ayrı** Worker yayınlandı; üretim Worker'ı
(`genesisanime-api`) bu değişikliklerle henüz yeniden yayınlanmadı. Silmek için:

```
cd api && npx wrangler delete --name genesisanime-akis-test
```

Üretime almak (yönetici kararı): `cd api && npm run deploy` — yeni uçlar eklemeli, mevcut uçlara
dokunmaz.

## Sonraki adımlar

1. ~~İstemci entegrasyonu~~ ✅ 03.10 (yukarıda). **Etkinleştirme adımı kaldı:** üretim Worker'ı
   (`genesisanime-api`) bu uçlarla yeniden yayınlanmadı; o yayın yapılana kadar site köprüyü
   deneyip iframe'e düşer (`cd api && npm run deploy`, yönetici kararı).
2. ~~Yeniden çözümleme~~ ✅ 03.10: 403/502'de seçim başına bir kez `?t=` ile taze adres.
3. ~~Orana sınır~~ ✅ 03.10 (günlük 300, önbellek vuruşu ücretsiz) — kalan: istek sayacı ve
   başarısızlık oranı (gözlemlenebilirlik).
4. **Odnoklassniki çözümleyicisi:** manifesti aktarım ucundan servis edip göreli yolları çevirmek.
5. **Kendi kontrol katmanı:** bugün tarayıcının yerleşik kontrolleri kullanılıyor (bedava gelen
   konum/ses/tam ekran/PiP); markalı çubuk, sprite önizlemesi ve klavye kısayolları sonraki iş.
