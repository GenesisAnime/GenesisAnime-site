# 12 · Akış Köprüsü (kendi oynatıcının temeli)

Amaç: video yüzeyini kaynağın iframe'i olmaktan çıkarıp **kendi `<video>` elemanımızda** oynatmak.
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

## Sınırlar ve riskler (dürüst liste)

1. **Cloudflare ToS / bant.** Bölüm başına ~170 MB Workers'tan geçiyor. Ücret istek başına
   (1 bölüm ≈ 1-5 aralık isteği), bant genişliği ayrıca faturalanmıyor — ama Cloudflare'in kabul
   edilebilir kullanım koşulları video dağıtımını kısıtlıyor. Ölçüm "teknik olarak çalışıyor" diyor,
   "koşullara uygun" demiyor; bu ayrı bir doğrulama ve karar. (Üçüncü seçenek: kendi VPS.)
2. **İmza ömrü.** Adresler `expire_at` ile günlük; önbellek en çok 6 saat. Gece yarısını geçen bir
   önbellek girdisi 403'e düşer → istemci 403/502 görürse **yeniden çözümlemeli** (uç `?t=` ile
   önbelleği atlayabilir; istemci entegrasyonunda bu "yeniden dene" adımı yazılmalı).
3. **Kapsam.** Bugün yalnız Mail.ru. Odnoklassniki (%11,5) manifest'i `srcIp` (isteyenin IP'si) ile
   imzalı ve varyant yolları **göreli**; onun için aktarım ucunun manifesti çekip içindeki yolları
   kendi adresine çevirmesi gerekir. Sibnet (%42) sunucu tarafına tamamen kapalı, VK (%7,1) adresi
   yalnız özel API ile üretiliyor.
4. **Tek nokta.** Aktarım Workers'a bağlı; Workers kesintisi oynatmayı durdurur (iframe yolu
   etkilenmez, o yüzden yedek yol korunmalı).
5. **Kötüye kullanım yüzeyi.** `/akis/coz` dış kaynağa iki istek yapıyor; orana sınır konmadı.
   Entegrasyondan önce IP başına sınır (mevcut `oranAsildi` yardımcısı) eklenmeli.

## Test Worker'ı

Ölçüm için `genesisanime-akis-test` adlı **ayrı** Worker yayınlandı; üretim Worker'ı
(`genesisanime-api`) bu değişikliklerle henüz yeniden yayınlanmadı. Silmek için:

```
cd api && npx wrangler delete --name genesisanime-akis-test
```

Üretime almak (yönetici kararı): `cd api && npm run deploy` — yeni uçlar eklemeli, mevcut uçlara
dokunmaz.

## Sonraki adımlar

1. **İstemci entegrasyonu:** oynatıcı önce `/akis/coz` denesin; akış gelirse kendi `<video>` +
   kendi kontrol çubuğu, gelmezse bugünkü iframe. (`src/lib/akis.ts` + oynatıcı bileşeni.)
2. **Yeniden çözümleme:** 403/502 durumunda bir kez `?t=<rastgele>` ile taze adres.
3. **Orana sınır + gözlemlenebilirlik:** `/akis/*` için istek sayacı ve başarısızlık oranı.
4. **Odnoklassniki çözümleyicisi:** manifesti aktarım ucundan servis edip göreli yolları çevirmek.
