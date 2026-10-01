# Günlük · 2026-09-30 · Faz 7 — Link taraması aracı ve ilk dilim

## 1. İstenen

> “317 bin bağlantıyı partiler halinde tarayan, kesintiye dayanıklı ve eşzamanlı çalışan link
> sağlığı aracını yaz ve ilk dilimi gerçekten tara; kapsam yüzdesi /kunye sayfasında güncellensin.”

## 2. Önce ölçüm: hangi host'ta hangi kanıt var?

Araç yazmadan önce 25 host'un tamamı gerçek URL'lerle yoklandı (`.gecici/` altındaki geçici
betikler). Kritik keşifler:

- **sibnet**: `Referer` gönderilince 403; gönderilmezse 200 + `file :` işareti. Ayrıca eski aracın
  “ölü” kayıtları tam olarak bir oran sınırı kırılmasına denk geliyor (docs/09 §4.1).
- **mail.ru**: gömme sayfası karar vermiyor (JS uygulaması, sözlükte “notAvailable” metni her
  sayfada var) ama `/+video/meta/<id>` ve `videoapi.my.mail.ru/videos/<yol>.json` uçları ölü videoda
  404 `video_not_found` döndürüyor. 88.450 kaynağın tamamı böylece doğrulanabilir hâle geldi.
- **ok.ru**: ölü videoda `vp_video_stub_txt` (“Видео не найдено” / “Bu videoya erişim kısıtlanmıştır”),
  canlı videoda `.m3u8` + `OK.VideoPlayer`.
- **VK**: canlı videoda gövdede `"files":{"mp4_144":…okcdn.ru}`, yoksa 64–65 KB JS kabuğu —
  ama yük altında canlı video için de kabuk dönebiliyor (bkz. §4).
- **Google Drive**: `/preview` 404 = dosya yok; 200'de `<title>` dosya adını veriyor.
- **Dailymotion / Yandex Disk / pixeldrain**: resmî JSON uçları 200/404 ile kesin karar veriyor.
- **voe / dood / byse**: bot-DDoS duvarı → HTTP ile karar yok.

## 3. Araç: `tools/link-tara.mjs`

Tek dosya, sıfır bağımlılık (`fetch` + `node:sqlite`). Ana parçalar:

| Parça | İş |
|---|---|
| `planKur()` | DB'den 317.132 tekil URL + player + puan; 4 öncelik dalgası; host harmanlama |
| `hedefBelirle()` | host'a özgü kanıt ucu (meta JSON, oEmbed, genel API, sarmal açma) |
| `KURALLAR` + `genelKural()` | ölçülmüş imzalara dayalı sınıflandırma |
| `Zamanlayici` | genel eşzamanlılık + host başına eşzamanlılık/aralık + soğuma |
| `durumYaz()` | her sonucu anında `tools/cache/link-durum.jsonl`'e ekler (append-only) |
| `--kendini-test` | 20 canlı URL ile sınıflandırıcı sınaması |

CLI: `--dilim`, `--es`, `--host-es`, `--host-aralik`, `--sure-dk`, `--yenile`, `--gecerlilik`,
`--dalga`, `--host`, `--haric-host`, `--durum-filtre`, `--zorla`, `--kuru`, `--durum`, `--rapor`,
`--sicil-denetim`, `--sikistir`, `--kendini-test`.

## 4. Denetimler ve düzeltmeler (bu iş sırasında bulunan hatalar)

| Kod | Hata | Etki | Düzeltme |
|---|---|---|---|
| H-9 | Host soğumaya alınınca kalan işler `bekleyen` sayacından düşülmüyordu | İşçiler hiç bitmeyen döngüde bekliyordu (ilk koşu 400 sn'de kesildi) | `hostuDurdur()` sayacı da azaltıyor |
| H-10 | Sınıflandırma arşiv host'una göre yapılıyordu | `href.li` sarmalındaki 22.431 VK kaydı için VK kuralları hiç çalışmadı | Karar artık **nihai host**'a da bakıyor |
| H-11 | VK'da “dosya listesi yok → ölü” | **1.129 kaydın 220'si canlı çıktı** (%30 yanlış ölüm); ölçüm: sakin koşulda 20 örneğin 6'sı canlı | VK'da yalnızca 404/410 ölü; diğerleri belirsiz |
| H-12 | MEGA gömme sayfası oynatıcı JS'i içeriyor → yanlış “çalışıyor” rozeti | 356 kayıt haksız rozet alacaktı | MEGA bilinçli olarak belirsiz |
| H-8 | `DURUM_ESLEME`'de `"ok"` eşlemesi yoktu | Kendi taramamızın 30.124 “ok” kaydı “bilinmiyor” sayılıyor, rozet alamıyordu | `'ok': DURUM.OK` eklendi |
| H-13 | `--sikistir` açık dosya tanıtıcısı yüzünden Windows'ta `rename` hatası verdi | Sıkıştırma çalışmıyordu | Akış `--sikistir` modunda açılmıyor |
| — | mail.ru yol biçimi (`/mail/<kullanıcı>/video/embed/...`) işlenmiyordu | 667 kayıt belirsiz kalıyordu | JSON ucu eklendi, doğrulandı |

Ayrıca eski sibnet verisindeki **2.594 oran sınırı artefaktı** `--sicil-denetim` ile `belirsiz`
işaretlendi (linkler yeniden görünür, rozet yok); eski dosyaya dokunulmadı.

## 5. Tarama sonucu

```
$ npm run link:tara -- --dilim=6000 --es=20 …
   5632/6000 · ok 4942 · ölü 21 · belirsiz 669 · 50.3/sn
$ npm run link:durum
   arşivdeki tekil URL : 317.132
   kontrol edilmiş     : 37.321  (%11,77)
     · kendi taramamız : 36.352
   dağılım             : ok 30.124 · ölü 177 · engelli 2 · belirsiz 7.018
   kesin karara varılan: %9,56
```

`npm run veri` + `npm run build` + `npm run yayin:hazirla` sonrası:

- listelenen kaynak 314.392 → **316.976**, gizlenen ölü kaynak 2.754 → **170**
- “doğrulanmış” rozetli kaynak 1.613 → **30.122**
- `/kunye/` dürüst durum kutusu: %11,77 kontrol · %9,56 kesin · 7.018 belirsiz
- `/izle/?a=naruto&b=1` artık doğrulanmış **Mail.ru** kaynağını (%100) otomatik seçiyor
  (önceki seçim doğrulanmamış Uqload'dı)

## 6. Sonraki adım

Sibnet (133.307 kaynak) bu yöntemle ölçeklenemiyor: host ~6 istek sonra duvar arıyor. Tarayıcı
katmanı ya da farklı çıkış IP'si gerekiyor; ilk dilim taramasında bu host dalga 1'de bekliyor.
