# Günlük · 2026-10-01 · Faz 7 — İkinci tarama oturumu: kapsam %11,77 → %25,49

## 1. İstenen

> “Siteyi nasıl açıyorduk? Bir açar mısın? Link taramasını sürdür ve kapsamı %11,77'den anlamlı
> biçimde yukarı taşı (dilim dilim, host soğumalarına uyarak); sonunda veriyi yenile, derle ve
> /kunye rakamlarını doğrula.”

## 2. Site nasıl açılıyor?

Statik dışa aktarım tek başına yeterli — sunucu gerekmez:

```bash
cd site/genesisanime
python -m http.server 8000 --directory out     # http://127.0.0.1:8000/
```

Panelde `http://127.0.0.1:8000/` açıldı. **Veri değişikliğinden önce sunucu kapatılır:** python
sunucusu `out/` klasörünü tutarken `next build` `EBUSY: rmdir 'out'` ile düşer ve tarayıcı eski
çıktıyı göstermeye devam eder (AGENTS.md §4). Bu oturumda da öyle yapıldı: tarama boyunca sunucu
açık kaldı (tarama `public/data`'ya dokunmaz), `npm run veri` öncesi kapatıldı (PID 34752),
derlemeden sonra yeniden açıldı (PID 35404).

## 3. Ölçüm ve plan

- `npm run link:durum`: **37.321/317.132 = %11,77** (kesin %9,56) — başlangıç noktası.
- `--kuru`: dalga 1 (eski şüpheli) 2.616 · dalga 2 (tazeleme) 1.016 · dalga 4 (hiç bakılmamış) 284.166.
- Ölçülebilir havuz (sibnet/mega/dood/byse hariç) **152.922** URL: my.mail.ru 73.943 ·
  ok.ru/odnoklassniki 33.543 · href.li 19.805 · drive.google.com 10.472 · videoapi.my.mail.ru 7.739 ·
  uqload 3.995 · voe.sx 2.523 · mp4upload 498 · yadi.sk 403.

Dilimler bilinçli olarak **kanıt üretebilen host'lara** odaklandı; kanıt üretemeyenler dışlandı
(`--haric-host=video.sibnet.ru,mega.nz,dood.watch,byse.sx`).

## 4. Sibnet: “HTTP ile ölçek yok” iddiası yeniden ölçüldü

| Koşu | Ayarlar | Sonuç |
|---|---|---|
| 20 URL | 1 eşzamanlı · 2.000 ms aralık (0,5 istek/sn) | **20/20 ok** (ortalama 152 ms, oynatıcı işareti) |
| 60 URL | 1 eşzamanlı · 1.000 ms aralık (1 istek/sn) | 6 ok → **HTTP 403**, host soğumaya alındı |

Yani kırılma noktası 0,5–1 istek/sn arasında; docs/09'daki “~6 istek sonra duvar” gözlemi
doğrulandı. 133.307 sibnet kaydı 0,5 istek/sn'de ~74 saat sürer; bu oturumda sibnet dalga 1'de
beklemeye bırakıldı ve plan dışı tutuldu.

## 5. H-14: kendi kayıtlarımızın tarihi yanlış okunuyordu

İkinci dilim neredeyse hiç yeni URL üretmedi (kapsam %15,12 → %15,23). Kök neden `zamanOku()`:

```
node -e "console.log(Date.parse('01.10.2026 14:23:45'))"
→ 1768044225000  (2026-01-10T11:23:45Z)   // ay/gün karıştı
node -e "console.log(Date.parse('30.09.2026 10:21:56'))"
→ NaN                                     // regex yedeği doğru çalışmış
```

“1 Ekim” diye yazdığımız kayıtlar “10 Ocak” diye okunuyor, 30 günlük geçerlilik denetiminde
“eski” sayılıp aynı URL'ler yeniden taranıyordu. Ölçüm: 14.000 istek atıldı, yalnızca **346'sı
yeni** URL'ydi; 13.654 istek boşa gitti. Düzeltme: yerel biçim regex'i artık ilk deneniyor,
`Date.parse` yedeğe alındı (`tools/link-tara.mjs`). Düzeltmeden sonraki dilimde 12.875 isteğin
12.281'i yeni URL'ydi. Yan kazanç: `--sicil-denetim`'in oturum sınırı sezgisi de artık
`01.09.2026` gibi eski kayıtları doğru yaşta hesaplıyor.

## 6. Dilimler

| Dilim | İstek | ok | ölü | belirsiz | Kapsam (sonra) |
|---|---:|---:|---:|---:|---:|
| 1 | 13.600 | 10.259 | 34 | 3.307 | %15,12 |
| 2 (H-14 öncesi) | 14.000 | 10.582 | 35 | 3.383 | %15,23 — 13.654 istek tekrar |
| 3 | 12.875 | 11.504 | 66 | 1.305 | %19,10 |
| 4 | 10.324 | 9.680 | 0 | 641 | %22,36 |
| 5 | 9.922 | 9.243 | 7 | 671 | **%25,49** |

Ölçülen hız 18–28 istek/sn. Host soğumaları: **yadi.sk** iki kez daha 429 aldı (3. engel → 80 dk
soğuma), dilim başına ~400 işi düşürdü; **sibnet** bölüm 4'te soğumaya alındı; dood/byse
geçmişten soğumada. Toplam: bu oturumda **43.505 yeni URL** doğrulandı.

## 7. Veri, derleme, /kunye doğrulaması

```
$ npm run link:durum
   kontrol edilmiş     : 80.826  (%25,49)   · kendi taramamız 79.857
   dağılım             : ok 71.151 · ölü 285 · engelli 6 · belirsiz 9.384
   kesin karara varılan: %22,53

$ npm run veri && npm run typecheck && npm run build && npm run yayin:hazirla
   atılan ölü kaynak: 278 · engelli: 4 · tutulan: 316.864
   tsc: 0 hata · build: 18.377 dosya / 400,3 MB · 6.107 anime sayfası · 404.html var
```

`/kunye/` canlı doğrulaması (Preview, `http://127.0.0.1:8000/kunye/`):

- dürüst durum: **317.132 → 80.826 (%25,49) kontrol · 71.442 kesin (%22,53) · 9.384 belirsiz**
- kartlar: 6.107 anime · 71.694 bölüm · **316.864 listelenen kaynak** · **71.152 doğrulanmış kaynak**
- gizlenen: 282 (278 ölü + 4 engelli)
- `document.documentElement.dataset.hata` = `null`
- ek kontrol: `/izle/?a=naruto&b=1` doğrulanmış Mail.ru kaynağını otomatik seçti, iframe yüklendi,
  17 kaynak çipi, konsol hatası yok.

**Not:** Python sunucusu `Cache-Control` göndermediği için tarayıcı `/kunye/` HTML'ini önbellekten
gösterdi; doğrulama `?tazelik=1` sorgusuyla (ve `out/kunye/index.html` içeriğiyle) teyit edildi.

## 8. Sonraki adım

Ölçülebilir havuz 105.798 kaynağa indi: my.mail.ru 65.816 · ok.ru 25.421 · href.li 11.700 ·
drive.google.com 2.463 · yadi.sk 398. Aynı yöntemle 5–6 dilimde kapsam ~%30'a çıkar. Sibnet
(133.307) ve bot duvarlı host'lar ise yavaş şerit / farklı çıkış IP'si / tarayıcı katmanı
gerektiriyor; ayrıntı: [docs/09](../09-link-sagligi-otomasyonu.md) §9.
