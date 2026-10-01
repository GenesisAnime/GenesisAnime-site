# 09 · Link Sağlığı Otomasyonu (Faz 7)

> Durum: **uygulandı; altı oturumda tarandı** (2026-09-30 · 2026-10-01 ×5) — ölçülebilir havuz tükendi, kapsam %58,72.
> Araç: `tools/link-tara.mjs` · Durum kaydı: `tools/cache/link-durum.jsonl`
> Karar kaydı: `docs/kararlar/ADR-0007-link-tarama-teknolojisi.md`
> Günlükler: [30.09](gunluk/2026-09-30-faz7-link-taramasi.md) · [01.10-a](gunluk/2026-10-01-faz7-link-taramasi-2.md) · [01.10-b](gunluk/2026-10-01-faz7-link-taramasi-3.md) · [01.10-c](gunluk/2026-10-01-faz7-link-taramasi-4.md) · [01.10-d](gunluk/2026-10-01-faz7-link-taramasi-5.md) · [birim testleri](gunluk/2026-10-01-faz7-birim-testleri.md)

## 1. Ne yapıldı?

`tools/link-tara.mjs` yazıldı: arşivdeki 317.132 tekil kaynak URL'sini **partiler hâlinde,
eşzamanlı, kesintiye dayanıklı** biçimde yoklayan bir tarayıcı. Sonuçlar anında diske yazılır
(`tools/cache/link-durum.jsonl`, append-only JSONL); koşu yarıda kesse bile bir sonraki çağrı
kaldığı yerden devam eder.

```bash
npm run link:durum                            # kapsam raporu (istek atmaz)
npm run link:tara -- --dilim=5000             # sıradaki 5000 URL'yi tara
npm run link:tara -- --host=my.mail.ru        # tek host
npm run link:tara -- --dalga=1,2 --dilim=2000 # öncelikli dalgalar
npm run link:tara -- --kuru                   # planı göster, istek atma
npm run link:test                             # sınıflandırıcı canlı URL sınaması (20 örnek)
npm run link:tara -- --sikistir               # durum dosyasını sıkıştır
```

Sınıflandırma kuralları, `zamanOku` (H-14) ve sicil denetimi çekirdeği ağsız birim testleriyle
çivilenmiştir: `npm test` (bkz. [docs/05](05-kalite-ve-testler.md) § Birim testleri). Dosya modül
olarak içe alındığında CLI akışı çalışmaz, durum dosyasına yazılmaz; test edilen kod üretimde
koşan kodun kendisidir.

## 2. Ölçülen durum (30.09.2026, ilk dilim)

| Ölçüm | Önce | Sonra |
|---|---:|---:|
| Kontrol edilmiş tekil URL | 4.378 (%1,38) | **37.321 (%11,77)** |
| — bunun kendi taramamız | 0 | 36.352 |
| Kesin karara varılan (ok/ölü/engelli) | 4.378 (%1,38) | **30.303 (%9,56)** |
| Çalışıyor | 1.615 | **30.124** |
| Ölü | 2.677 | **177** |
| Engelli | 86 | 2 |
| Belirsiz (gizlenmez, rozetsiz) | 0 | 7.018 |
| Sitede gizlenen kaynak | 2.754 | 170 |
| “Doğrulanmış” rozeti alan kaynak | 1.613 | **30.122** |

`/kunye/` sayfası bu tabloyu `public/data/saglik.json`'dan okur; kapsam yüzdesi tarama sonrası
`npm run veri` ile kendiliğinden güncellenir.

### 2.1 01.10.2026 oturumları: ölçülebilir host'larda yirmi üç dilim

Yalnızca HTTP kanıtı üretebilen host'lar tarandı; kanıt üretemeyenler (`video.sibnet.ru`,
`mega.nz`, `dood.watch`, `byse.sx`) ve beş kez 429 veren `yadi.sk` plan dışı bırakıldı (§6).

| Ölçüm | 30.09 | 01.10 (kapanış) |
|---|---:|---:|
| Kontrol edilmiş tekil URL | 37.321 (%11,77) | **186.226 (%58,72)** |
| — bunun kendi taramamız | 36.352 | **185.257** |
| Kesin karara varılan (ok/ölü/engelli) | 30.303 (%9,56) | **173.362 (%54,67)** |
| Çalışıyor | 30.124 | **173.027** |
| Ölü | 177 | **301** |
| Engelli | 2 | **34** |
| Belirsiz (gizlenmez, rozetsiz) | 7.018 | **12.864** |
| Sitede gizlenen kaynak | 170 | **326** (294 ölü + 32 engelli) |
| “Doğrulanmış” rozetli kaynak | 30.122 | **173.034** |

Oturum özeti (`--dilim=17000–20000`, `--sure-dk=9`, `--haric-host=…`; her oturum ayrı günlükte):

| Oturum | Dilim | Tarama | Tempo | Kapsam (sonra) |
|---|---:|---:|---|---:|
| 2. (01.10-a) | 1–5 | ~60 bin istek | 3 istek/sn/host (varsayılan) | %25,49 |
| 3. (01.10-b) | 6–7 | 14.868 istek | 3 istek/sn/host | %30,17 |
| 4. (01.10-c) | 8–14 | ~50 bin istek | **6,7 istek/sn/host (ölçüldü)** | %45,88 |
| 5. (01.10-c) | 15–20 | 29.819 istek | **10 istek/sn/host (ölçüldü)** | %55,28 |
| 6. (01.10-d) | 21–23 | 10.913 istek | 10 istek/sn/host | **%58,72** |

Tempo ölçülerek yükseltildi: mail.ru ve ok.ru ~35 bin isteklik geçmişte tek bir 403/429
döndürmediği için önce 6,7 istek/sn/host (10.181 istek, sıfır engel), sonra 10 istek/sn/host
denedi (29.819 istek, sıfır engel; altıncı oturumda aynı tempoda 10.913 istek daha — toplamda
40.732 istek, sıfır engel). VK'nın “ok” oranı tempodan etkilenmedi (%68,6 @ 6,7/sn'ye
karşı %69,9 @ 3/sn) — H-11'in yük davranışı bu aralıkta tetiklenmiyor. Ayrıca ok.ru'da 4 dilimde
toplam 21, 5. oturumda 0 kaynak `engelli` (yasal/coğrafi) işaretlendi; `drive.google.com`,
`uqload`, `videoapi.my.mail.ru` ve `href.li` havuzları tükendi. Altıncı oturumda kalan **10.913**
my.mail.ru kaynağı da tarandı: üç dilimde 10.913 istek, 10.913'ü ok, **sıfır engel/ölü/belirsiz**
(dilim hızı 9,0–9,1 istek/sn) — 01.10 kapanışında ölçülebilir havuz tamamen tükendi (§7, §9).

## 3. Yöntem: gerçek tarayıcı yerine kanıt katmanı

Arşivdeki kaynakların **%82'si üç host'ta**: sibnet (133.307), mail.ru (88.450), ok.ru (36.929).
Kalibrasyon ölçümleri bu üçünün de HTTP katmanında güvenilir biçimde ayrıldığını gösterdi; ayrıca
gerçek tarayıcı 317 bin kaynak için ~3 hafta demek. Bu yüzden karar HTTP kanıt katmanı oldu
(ADR-0007); tarayıcı katmanı yalnızca “belirsiz” kalanlar için sonraki faz olarak duruyor.

Her host için karar veren **uç nokta ve imza** ölçümle belirlendi:

| Host | Yoklanan uç | Ölü kanıtı | Çalışıyor kanıtı |
|---|---|---|---|
| video.sibnet.ru | `shell.php?videoid=` (Referer yok) | HTTP 404/410 | sayfada `file :` oynatıcı kaynağı |
| my.mail.ru | `/+/video/meta/<id>` (JSON) | HTTP 404 `video_not_found` | JSON `meta`/`provider` alanı |
| my.mail.ru (yol biçimi) | `videoapi.my.mail.ru/videos/<yol>.json` | HTTP 404 | JSON `meta`/`provider` alanı |
| videoapi.my.mail.ru | `…/videos/<yol>.json` | HTTP 404 | JSON `meta`/`provider` alanı |
| ok.ru, odnoklassniki.ru | gömme sayfası | `vp_video_stub_txt` (“video yok” / “erişim kısıtlı”) | `.m3u8` + `OK.VideoPlayer` |
| vk.com (href.li sarmalı) | `video_ext.php` | HTTP 404/410 | gövdede `"mp4_<n>"` / `okcdn.ru` |
| drive.google.com | `/file/d/<id>/preview` | HTTP 404 | `<title>` = dosya adı |
| uqload.com | gömme sayfası | “is no longer available / expired” | jwplayer + `<video` |
| mp4upload.com | gömme sayfası | “File was deleted” (16 B) | `<video` + `.mp4` |
| voe.sx | gömme sayfası | HTTP 404 | (DDoS koruması → belirsiz) |
| dailymotion.com | `services/oembed` (JSON) | “Invalid video URL.” | JSON `title` |
| yadi.sk | `cloud-api.yandex.net/v1/disk/public/resources` | HTTP 404 `NotFoundError` | JSON `"type":"file"` |
| pixeldrain (turkanime.tv köprüsü) | `api/file/<id>/info` | HTTP 404 | JSON `"success":true` |
| mega.nz | — | HTTP 404 | — (HTTP kanıtı yok → belirsiz) |
| dood.watch, byse.sx | gömme sayfası | — | — (bot duvarı → belirsiz) |

Genel kural tüm host'larda geçerlidir: **404/410 → ölü**, `<video`/`file:`/`.m3u8`/jwplayer →
çalışıyor, **403/429/bot duvarı/5xx/zaman aşımı → belirsiz** (asla ölü değil).

## 4. Bulgular (ölçümle kanıtlanmış)

### 4.1 Eski sibnet verisi bir oran sınırı artefaktıydı

Arşivdeki eski araç 23.09.2026 20:50–22:55 arasında sibnet'i taramış. Kayıtların zaman sırasına
bakıldığında kırılma noktası net:

| Kayıt aralığı | Saat | çalışıyor | ölü |
|---|---|---:|---:|
| 0–799 | 20:50–21:08 | 800 | 0 |
| 800–999 | 21:08 | 125 | 75 |
| 1000–3399 | 21:16–22:55 | 0 | 2.400 |

Yani sibnet ~1,7 istek/sn'yi aşınca IP'yi duvar arkasına alıyor (`403 Request forbidden by
administrative rules`, 93 B) ve eski araç bu yanıtı “player bulunamadı” diye **ölü** yazmış. Bugün
aynı URL'ler 200 dönüyor ve oynatıcı işareti içeriyor (kendini test + 8 örnekli yoklamada 6 canlı).
Bu yüzden `--sicil-denetim` ucu eklendi: bozulmuş oturumlardaki **2.594 kayıt** `belirsiz` olarak
işaretlendi (link yeniden görünür, rozet yok) ve gerçek doğrulama sırasına (dalga 1) alındı.
Eski dosya değiştirilmedi; karar ayrı dosyaya yazıldı.

### 4.2 “Ölü” demek için kanıt şart: VK örneği

İlk taramada VK için “sayfada dosya listesi yok” kuralı **ölü** sonucu üretiyordu. Denetim, VK'nın
yük altında **canlı videolar için de** dosyasız 64–65 KB JS kabuğu döndürdüğünü gösterdi: sakin
koşulda yeniden ölçülen 20 kaydın **6'sı canlı** çıktı (%30 yanlış ölüm). Kural değiştirildi:
VK'da yalnızca HTTP 404/410 ölü sayılır, dosya listesi yoksa **belirsiz**. 1.129 kayıt yeniden
tarandı: 220'si çalışıyor, 909'u belirsiz.

### 4.3 Diğer düzeltmeler

- **MEGA**: gömme sayfası HTTP'de her zaman oynatıcı JS'i ile geldiği için yanlış “çalışıyor”
  rozeti üretiyordu; artık bilinçli olarak belirsiz (dosya kimliği AES anahtarı taşır, MEGA API'si
  oturum/handle dönüşümü ister).
- **mail.ru yol biçimi** (`my.mail.ru/mail/<kullanıcı>/video/embed/...`) hiç işlenmiyordu; JSON ucu
  bulundu ve 667 kayıt doğrulandı.
- **href.li sarmalı**: sınıflandırma artık *nihai* host'a göre yapılır (sarmal açıldıktan sonra
  vk.com kuralları uygulanır).
- **`ok` eşlemesi**: kendi durum dosyamızdaki `"ok"` değeri `DURUM_ESLEME`'de yoktu; 30 bin kayıt
  “bilinmiyor” sayılıyor ve rozet alamıyordu (H-8).

### 4.4 H-14: kendi kayıtlarımızın tarihi yanlış okunuyordu (kapsam artışını durdurdu)

`zamanOku()` önce `Date.parse()` deniyordu. V8, kendi yazdığımız yerel biçimi
(`01.10.2026 14:23:45`) **ay/gün karıştırarak 10 Ocak 2026** diye okuyor; 30 günlük geçerlilik
denetimi bu kayıtları “eski” sayıp aynı URL'leri yeniden taramaya gönderiyordu. Hata yalnızca
günü 12'den küçük tarihlerde tetikleniyordu (`30.09.2026` gibi tarihler `Date.parse`'ta `NaN`
dönüp regex yedeğine düşüyordu; ilk oturumun 29.334 kaydı bu yüzden doğru okunmuştu).

Ölçüm: ikinci dilimde 14.000 istek atıldı, kapsam yalnızca %15,12 → %15,23 arttı — yani
**13.654 istek boşa gitti**. Düzeltme: yerel biçim regex'i artık **ilk** deneniyor, `Date.parse`
yedeğe alındı. Düzeltmeden sonraki dilimde 12.875 isteğin 12.281'i yeni URL'ydi (kapsam
%15,23 → %19,10). `--sicil-denetim`'in oturum sınırı sezgisi de bundan faydalanır: eski
dosyadaki `01.09.2026` gibi kayıtlar da önceden yanlış yaşta hesaplanıyordu.

## 5. Karar politikası

```
404/410 · alan adı yok · hosta özgü "silindi" imzası   → olu      (sitede gizlenir)
oynatıcı kaynağı imzası                                → ok       (rozet + öne alma)
403/429 · bot/DDoS duvarı · 5xx · zaman aşımı · JS kabuğu → belirsiz (görünür, rozetsiz)
```

- `belirsiz` **gizlenmez**; şüphede kalınan hiçbir kaynak kullanıcıdan saklanmaz (ADR-0003).
- Aynı URL iki kez taranabilir; dosyada **son satır geçerli** (sonraki ölçüm kazanır).
- Kesin sonuçlar 30 gün geçerli (`--gecerlilik`), belirsizler 6 saat sonra yeniden denenir (`--yenile`).

## 6. Kaynak koruma (nazik tarama)

- Genel eşzamanlılık varsayılan 16; **host başına eşzamanlılık 3**, host başına istek aralığı 250 ms.
- Ek bir güvenlik katmanı **soğuma**: bir host arka arkaya bot duvarı/oran sınırı dönerse o host
  koşudan çıkarılır ve `tools/cache/link-tarama-host.json` içine cooldown yazılır. Süre her yeni
  engelde iki katına çıkar (20 dk → 12 saat üst sınır). Ölçüm: sibnet ~6 istek sonra duvara giriyor,
  yadi.sk 429 döndü. Sunucuya yük bindirmek yerine host dinlenmeye bırakılır.
- Sıralama host'lar arasında harmanlanır (round-robin): tek bir host'un bir partiyi tümüyle
  işgal etmesi engellenir.

- **Sibnet hız ölçümü (01.10):** 0,5 istek/sn'de (1 eşzamanlı, 2 sn aralık) 20/20 istek
  200 + oynatıcı işareti döndü; 1 istek/sn'de (1 eşzamanlı, 1 sn aralık) 6 istekten sonra
  HTTP 403 duvarı geldi. Kırılma noktası 0,5–1 istek/sn arasında; 133.307 sibnet kaydı bu
  hızda ~74 saat sürer. Bu yüzden sibnet bu oturumda bilinçli olarak plan dışı bırakıldı.
- **Tempo denemeleri (01.10):** mail.ru/ok.ru için 6,7 ve 10 istek/sn/host denendi; hiçbir
  403/429 alınmadı ve karar kalitesi bozulmadı (§2.1). Buna rağmen **varsayılan 3 istek/sn/host
  korunur**: tempo yükseltmek yalnızca havuz tükenirken ve ölçüm temiz çıkarken tercih edilir;
  şüphede kalınırsa host dinlenmeye bırakılır.

## 7. Performans

| Ölçüm | Değer |
|---|---|
| Tipik hız (20 eşzamanlı, 25 host) | ~50 URL/sn |
| 6.000 URL'lik parti | ~2 dakika |
| Ölçülmüş hız (3–7 host · 3 istek/sn/host) | 12–28 URL/sn |
| Ölçülmüş hız (2 host · 6,7 istek/sn/host) | ~19 URL/sn |
| Ölçülmüş hız (1 host · 10 istek/sn/host) | ~9,0–9,5 URL/sn (23 dilim ortalaması) |
| Tek dilim (9 dk süre sınırı) | ~5–13 bin URL |
| Tam arşiv (317 bin URL) | ~2 saat saf iş + host soğumaları |

Ölçülebilir havuzun tamamı (**163.835 URL**) 01.10 oturumlarında tükendi — son üç dilim kalan
10.913 my.mail.ru kaynağını 20 dakikada taradı (sıfır engel). Kapsam artık %58,72'de duruyor:
bunu yükseltmenin tek yolu sibnet (133.307) ve bot duvarlı host'lardır. Sınır hız değil host
başına istek aralığıdır; sibnet 0,5–1 istek/sn'de kırılıyor (§6), MEGA HTTP katmanında kanıt
üretmiyor.

## 8. İşletim planı

| Sıklık | İş |
|---|---|
| Günlük/haftalık | `npm run link:tara -- --dilim=5000 --es=20` (dalga 1→2→3→4 sırası korunur) |
| Karar kuralı değişince | `--host=<etkilenen> --durum-filtre=olu,engelli --zorla` ile yalnızca etkilenenleri yeniden tara |
| Aylık | `npm run veri && npm run build && npm run yayin:hazirla`; `/kunye` kapsamı güncellenir |
| Dosya şişince | `npm run link:tara -- --sikistir` |

## 9. Sıradaki işler (dürüst liste)

1. **Sibnet**: 133.307 kaydın 2.594'ü artefakt damgalı, ~130 bini hiç ölçülmedi. Ölçüm (01.10):
   0,5 istek/sn güvenli, 1 istek/sn duvara giriyor (§6). Seçenekler: ≤0,5 istek/sn “yavaş şerit”
   (kesintili koşan bir işçi, ~74 saat), farklı çıkış IP'si ya da tarayıcı katmanı.
2. **Tarayıcı katmanı (Playwright)**: yalnızca `belirsiz` kalanlar (bugün 12.864; VK ~6,4 bin,
   voe ~2,5 bin, MEGA ~0,7 bin, sibnet artefaktı ~1 bin) için.
   Bağımlılık eklemeden önce `docs/kararlar/ADR-0007`'deki ölçütlere bakın.
3. **MEGA** için API tabanlı doğrulama (handle dönüşümü + dosya listesi).
4. **Kullanıcı bildirimleri** — ✅ uygulandı (01.10): oynatıcıdaki “Kaynak çalışmıyor” düğmesi
   kaynağı yerelde gizler (localStorage) **ve** `api/` Worker'ına bildirir; `npm run link:bildirim`
   kayıtları `tools/cache/bildirim.jsonl`'e aktarır, `npm run link:tara -- --bildirim` bu URL'leri
   kuyruğun önüne alır. Bildirim **karar değil önceliktir**: URL yine taranır ve durum yalnızca
   somut HTTP kanıtıyla belirlenir (AGENTS §1.4b). Ayrıntı: [11](11-hesaplar-uygulama.md).
5. **~~Kalan ölçülebilir havuz (10.913)~~ — tamamlandı (01.10-d):** tamamı my.mail.ru; üç dilimde
   (9 + 9 + 2 dk) toplam 20 dakikada tarandı; hepsi ok, sıfır engel. Kapsam %55,28 → **%58,72**,
   kesin %51,22 → **%54,67**, doğrulanmış rozetli 162.121 → **173.034**. Tüm ölçülebilir host
   havuzları (drive, yadi.sk, href.li, uqload, videoapi, ok.ru, videa, dailymotion vb.) tükendi;
   kapsamı büyütebilecek tek yol yukarıdaki 1–3. maddelerdir.

## 10. Otomatik döngü (günlük) ve yönetim paneli

İki parçalı tasarım — **politika sunucuda, iş yerel makinede**:

| Katman | Nerede | Ne yapar |
|---|---|---|
| Politika + kayıt | **D1** (`tarama_ayar`, `tarama_kosu`, `tarama_kalp`) | Panelden ayar tutar; koşu geçmişini ve makine kalp atışlarını saklar |
| Panel | Site: **`/yonetim/`** (noindex, ADMIN_TOKEN) | Dilim/saat/açık-kapalı/push ayarları, "şimdi çalıştır", koşu geçmişi + adım özeti |
| İş | **Yerel makine** (`tools/gunluk-dongu.mjs`) | Tarama → site verisi → derleme → yayın hazırlığı → (istenirse) commit/push; sonucu panele yazar |
| Uyandırıcı | Windows Görev Zamanlayıcısı / cron | Saatte bir `tools/dongu.cmd` çağrılır; kararı döngü verir |

Neden iş yerelde? `npm run veri` arşiv SQLite dosyasını okur ve o dosya depoda yoktur (ADR-0004);
316 bin kaynağın rozet durumu tam da o adımda site verisine işlenir. CI bu adımı koşamaz.

```bash
npm run dongu:gunluk                       # panel ayarına göre karar ver, gerekirse koş
npm run dongu:gunluk -- --zorla            # ayarı yok say, hemen koş
npm run dongu:gunluk -- --kalp             # yalnızca kalp atışı + karar (iş yapmaz)
npm run dongu:gunluk -- --dilim=3000       # bu koşu için dilimi değiştir
npm run dongu:gunluk -- --yayinla --push   # commit + push (panel ayarını geçersiz kılar)
npm run dongu:gunluk -- --kuru             # yalnızca tara (veri/derleme yok)
npm run dongu:gunluk -- --deneme           # hiçbir adımı koşma, planı yaz
npm run dongu:gunluk -- --yerel            # panele hiç sorma, varsayılanlarla koş
```

Karar mantığı `tools/lib/dongu.mjs` içinde **saftır** ve ağsız test edilir
(`tools/testler/dongu.test.mjs`): panel kapalıysa koşmaz; bugün başarıyla koştıysa tekrar koşmaz;
başarısız koşudan sonra 3 saat bekler; makine gece kapalıydıysa gün içinde açıldığında koşuyu
kaçırmaz (görev saatte bir uyandığı için). Koşu ayrıca `tools/rapor/gunluk-dongu.jsonl` ve
`docs/gunluk/kayit.jsonl` dosyalarına birer satır yazar; tarama kesintiye dayanıklıdır.

### Yönetici jetonu ve derleme ortamı (iki kere yaşanan tuzak)

1. **Jeton:** döngü ve panel aynı `ADMIN_TOKEN`ı kullanır. Döngü jetonu sırayla `--token=`,
   `GENESIS_ADMIN_TOKEN`/`ADMIN_TOKEN` ortam değişkeni ve kök **`.env`** dosyasından okur.
   `api/.dev.vars` **kullanılmaz**: oradaki jeton yerel `wrangler dev` içindir, üretimdekiyle aynı
   değildir ve sessizce `yetkisiz` hatası üretir (yaşandı).
2. **Derleme ortamı:** döngü `npm run build` çağırır; `NEXT_PUBLIC_API` gibi değerler derleme anında
   HTML'e gömülür. Bu değerler yoksa döngünün ürettiği site **hesapsız/API'siz** olur (bir kez
   yaşandı: panel "API kapalı" gösterdi). Çözüm: CI ile aynı dört değişkeni kök `.env` dosyasına
   yazmak — Next.js `.env`i kendiliğinden okur. Döngü bu iki değişkeni eksik görürse log'a ve panel
   kaydına **UYARI** satırı koyar.

### Paneli yerelde açma

Panel statik bir sayfadır; yayına çıktıktan sonra `…/GenesisAnime/yonetim/` adresinden açılır.
Push öncesi denemek için öneksiz bir derleme + basit sunucu yeterlidir:

```bash
BASE_PATH= npm run build      # .env'deki öneki ez (boş önek = kök göreli yollar)
cd out && python -m http.server 8010
# → http://127.0.0.1:8010/yonetim/  (jeton: üretimdeki ADMIN_TOKEN)
```

> Sunucu `out/` klasörünü tutarken döngünün derleme adımı `EBUSY: rmdir 'out'` ile düşebilir;
> denemeyi bitirince sunucuyu kapat (§ Doğrulama). Döngü bir sonraki uyanışında `out/`'u zaten
> yeniden üretir (önekiyle), yani bu geçici derleme kalıcı bir sapma bırakmaz.

### Neden GitHub Actions değil?

`npm run veri` (`tools/export-data.mjs`) arşiv **SQLite** dosyasını okur ve bu dosya depoda tutulmaz
([ADR-0004](kararlar/ADR-0004-veri-dizini.md)); 316 bin kaynağın rozet durumu tam da bu adımda
site verisine işlenir. CI bu adımı koşamaz, bu yüzden iş **arşivin bulunduğu makinede** koşar.
CI'da koşan şey derleme + testtir (`yayinla.yml`): veriyi tazeleyemez, yalnızca doğrular.
Gerçek "sunucuda yaşayan" bir tarama istenirse yol bellidir: kaynak sırası ve durum D1'e taşınır,
tarama bir Worker cron tetikleyicisinde koşar ve site rozetleri API'den okunur (henüz yapılmadı —
`docs/10`). Bugünkü tasarım bunun yarısını zaten kurmuş durumda: **durum ve politika D1'de**, iş
ise yerelde.

### Zamanlayıcı kurulumu

Görev **saatte bir** uyanır; "günde bir" kuralını döngü uygular. Böylece makine gece kapalıysa koşu
kaçmaz, gün içinde açıldığı anda yapılır.

```bat
MSYS_NO_PATHCONV=1 schtasks /Create /TN "GenesisAnime gunluk dongu" /SC HOURLY /MO 1 ^
  /TR "\"C:\yol\site\genesisanime\tools\dongu.cmd\"" /F
```

> Git Bash'te `MSYS_NO_PATHCONV=1` şart: aksi hâlde `/Create` argümanı
> `C:/Program Files/Git/Create` yoluna çevrilir ve görev oluşmaz.

Durum kontrolü ve elle tetikleme:

```bat
schtasks /Query /TN "GenesisAnime gunluk dongu" /FO LIST /V
schtasks /Run   /TN "GenesisAnime gunluk dongu"
```

Günlük çıktı `tools/rapor/gunluk-dongu.log` dosyasındadır (sarmalayıcı oraya yönlendirir);
sonuç ve adım özeti ayrıca panelde görünür. **Bu makinede kuruldu ve doğrulandı (01.10.2026):**
hemen çalıştır → 250 kaynak tarandı → veri + derleme + yayın hazırlığı → koşu panelde göründü
(`ok`, 112 sn, kapsam `ok 173.030 · ölü 301 · engelli 34 · belirsiz 12.861`), kalp atışı yazıldı;
görev "Next Run Time" ile saatlik duruyor.

Zamanlayıcının **kendi zamanlamasıyla** çalıştığı da ayrıca sınandı (elle `/Run` olmadan): bir
kerelik bir sınama görevi kuruldu, saat gelince kendiliğinden açıldı ve silindi. Günlükte
`[18:11:01] dongu basladi` → `panel: dilim 1500 · saat 4 · açık` → `karar: bugün zaten koştu` →
`iş yapılmadı (bugun-kostu)` satırları, panelde ise kalp atışının `18:11:02`ye ilerlediği görüldü
(`son_karar: bugun-kostu`). Yani hem uyandırma hem karar hem kalp atışı yolu insan eli değmeden
çalışıyor. **Dürüst sınır:** "gece boyunca koştu" iddiası ancak birkaç ardıl günün koşu kaydıyla
kanıtlanır; bugünkü kanıt uyandırma + karar + kayıt zincirinin tamamının kurulu olduğudur.

macOS / Linux (`crontab -e`):

```
0 4 * * * cd /yol/site/genesisanime && npm run dongu:gunluk -- --yayinla --push >> /tmp/genesis-dongu.log 2>&1
```

> İpucu: `--yayinla` commit atar, `--push` yayın iş akışını tetikler. Zamanlayıcıya bağlamadan önce
> birkaç gece `--yayinla` vermeden koşup `tools/rapor/gunluk-dongu.jsonl` satırlarını oku.

## 11. Riskler

- **Yanlış pozitif gizleme:** en pahalı hata. Karşılığı: ölü için somut kanıt şartı, `belirsiz`
  durumu ve kural değişikliklerinde canlı sınama (`npm run link:test`).
- **Hedef sitelerin engellemesi:** nazik hız + soğuma + dürüst “taranamadı” kaydı.
- **Veri kaybı:** durum dosyası sürüm kontrolündedir (`.gitignore` istisnası); kaybolursa 30 binden
  fazla rozet sessizce kaybolurdu.
- **Telif/hukuk:** tarama yalnızca “sayfa oynatıcı yükledi mi” sorusunu yanıtlar; içerik indirilmez,
  kopyalanmaz, depolanmaz.
