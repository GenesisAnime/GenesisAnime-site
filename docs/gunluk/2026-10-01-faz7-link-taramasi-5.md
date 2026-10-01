# Günlük · 2026-10-01 · Faz 7 — Altıncı oturum: %55,28 → %58,72 (ölçülebilir havuz tükendi)

## 1. İstenen

> “Kalan 10.913 my.mail.ru kaynağını tarayıp kapsamı ~%58,7'ye çıkar; sonunda veriyi yenile,
> derle ve /kunye rakamlarını doğrula.” — 5. oturumun bıraktığı yerden devam edildi.

## 2. Altıncı oturum: dilim 21–23 · %55,28 → **%58,72**

Kalan havuz tek host'tan (my.mail.ru) oluşuyordu; tempo bir önceki oturumda ölçülen
`--host-es=10 --host-aralik=100` (10 istek/sn/host) olarak korundu.

| Dilim | İstek | ok | ölü | engelli | belirsiz | Süre | Hız | Kapsam (sonra) |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| 21 | 4.940 | 4.940 | 0 | 0 | 0 | 540 sn | 9,1/sn | %56,84 |
| 22 | 4.925 | 4.925 | 0 | 0 | 0 | 541 sn | 9,1/sn | %58,39 |
| 23 | 1.048 | 1.048 | 0 | 0 | 0 | 116 sn | 9,0/sn | **%58,72** |

Toplam **10.913 istek / ~20 dakika**, ort. 148–153 ms yanıt. Üç dilimde de **sıfır engel, sıfır
ölü, sıfır belirsiz** — my.mail.ru geçmişteki ~%99,9 ok davranışını sürdürdü. 23. dilim havuzun
sonuydu; `--kuru` teyidi dilimden sonra “taranacak: 0 URL” döndü.

## 3. Sonuç, veri, derleme, doğrulama

```
$ npm run link:durum
   kontrol edilmiş     : 186.226  (%58,72)   · kendi taramamız 185.257
   dağılım             : ok 173.027 · ölü 301 · engelli 34 · belirsiz 12.864
   kesin karara varılan: %54,67

$ npm run veri && npm run typecheck && npm run build && npm run yayin:hazirla && npm test
   listelenen kaynak 316.820 · doğrulanmış rozetli 173.034 · gizlenen 326 (294 ölü + 32 engelli)
   tsc 0 hata · build 18.377 dosya / 400,8 MB · 6.107 anime sayfası · 404.html var
   yayin:hazirla: GitHub Pages + Cloudflare uygun · npm test 32/32 (~0,65 sn)
```

`/kunye/` canlı doğrulaması (Preview · `http://127.0.0.1:8000/kunye/?tazelik=186226`, python
sunucu PID 10464):

- dürüst durum: **317.132 → 186.226 (%58,72) kontrol · 173.362 kesin (%54,67) · 12.864 belirsiz**
- kartlar: **316.820 listelenen kaynak · 173.034 doğrulanmış kaynak** · 6.107 anime · 71.694 bölüm
- gizlenen: 326 (294 ölü + 32 engelli); oynatıcı tablosunda Mail.ru 88.449 tarandı / %100 ok
- `data-hata` = `null` (sayılar `public/data/saglik.json` ve `kunye.json` ile birebir aynı)

## 4. Sonraki adım

Ölçülebilir havuzun **tamamı tükendi** (bu oturumda 10.913; 01.10 toplamı 163.835 URL). Kapsamı
büyütmenin tek yolu HTTP katmanının çözemedikleri: sibnet (133.307; 0,5 istek/sn güvenli,
1 istek/sn duvar), bot duvarlı voe/dood/byse ve API gerektiren MEGA ile belirsiz kalan 12.864
kayıt. Sıradaki iş “yavaş şerit” işçisi (≤0,5 istek/sn) veya tarayıcı katmanı — ayrıntı:
docs/09 §6/§9.
