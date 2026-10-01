# Günlük · 2026-10-01 · Faz 7 — Dördüncü ve beşinci oturum: %30,17 → %55,28

## 1. İstenen

> “Kalan 90.534 ölçülebilir kaynağı dilim dilim tarayıp kapsamı ~%55'e çıkar; sonunda veriyi
> yenile, derle ve /kunye rakamlarını doğrula.” — 4. oturum %45,88'de oturum sınırına takıldı,
> 5. oturumda kaldığı yerden sürdürüldü.

## 2. Dördüncü oturum (kesildi): dilim 8–14 · %30,17 → %45,88

- Kalan havuz 90.930 → ölçülebilir host'lar: my.mail.ru 61.682 · ok.ru 21.281 · href.li 11.700 ·
  drive 2.463 · yadi.sk 396.
- **yadi.sk** beşinci kez 429 aldı; her dilimde ~400 işi boşa düşürdüğü için kalıcı olarak
  dışlandı (`--haric-host=…,yadi.sk`).
- **`drive.google.com`** (2.463) ve **`href.li`/VK** (11.700) havuzları tükendi; ok.ru'da dilim
  başına 0–14 kaynak `engelli` (yasal/coğrafi kısıtlama) işaretlendi — sitede gizlenir.
- Tempo ölçümü: `--host-es=6 --host-aralik=150` (6,7 istek/sn/host) → 10.181 istekte **sıfır
  engel**, ~19 istek/sn (varsayılanın 1,64 katı). VK'nın “ok” oranı korundu (%68,6 vs %69,9),
  yani H-11'deki yük davranışı bu tempoda tetiklenmiyor.
- Oturum sınırında kesildi; durum dosyası append-only olduğu için hiçbir sonuç kaybolmadı ve
  5. oturum kaldığı yerden devam etti.

## 3. Beşinci oturum (tamamlama): dilim 15–20 · %45,88 → **%55,28**

Havuz tek host'a (my.mail.ru) indiği için tempo bir kademe daha ölçüldü:
`--host-es=10 --host-aralik=100` (10 istek/sn/host) → 29.819 istekte **sıfır engel**, ~9,5 istek/sn.

| Dilim | İstek | ok | ölü | belirsiz | Kapsam (sonra) |
|---|---:|---:|---:|---:|---:|
| 15 | 5.129 | 5.129 | 0 | 0 | %47,50 |
| 16 | 5.115 | 5.114 | 0 | 0 | %49,05 |
| 17 | 4.940 | 4.939 | 1 | 0 | %50,61 |
| 18 | 4.940 | 4.939 | 0 | 1 | %52,16 |
| 19 | 4.948 | 4.947 | 0 | 1 | %53,72 |
| 20 | 4.938 | 4.938 | 0 | 0 | **%55,28** |

Not: bu oturumda karşılaştırma için ölçülen tempo, `taranan/süre` oranı 9,5/sn (tek host olduğu
için toplam hız da 9,5/sn). Varsayılan (3 istek/sn/host) korunuyor: yükseltme yalnızca havuz
tükenirken ve ölçüm temizken yapıldı (bkz. docs/09 §6).

## 4. Sonuç, veri, derleme, doğrulama

```
$ npm run link:durum
   kontrol edilmiş     : 175.313  (%55,28)   · kendi taramamız 174.344
   dağılım             : ok 162.114 · ölü 301 · engelli 34 · belirsiz 12.864
   kesin karara varılan: %51,22

$ npm run veri && npm run typecheck && npm run build && npm run yayin:hazirla && npm test
   listelenen kaynak 316.820 · doğrulanmış rozetli 162.121 · gizlenen 326 (294 ölü + 32 engelli)
   tsc 0 hata · build 18.377 dosya / 400,75 MB · 6.107 anime sayfası
   npm test 32/32
```

`/kunye/` canlı doğrulaması (Preview · `http://127.0.0.1:8000/kunye/`):

- dürüst durum: **317.132 → 175.313 (%55,28) kontrol · 162.449 kesin (%51,22) · 12.864 belirsiz**
- kartlar: **316.820 listelenen kaynak · 162.121 doğrulanmış kaynak** · 6.107 anime ·
  71.694 bölüm
- gizlenen: 326 (294 ölü + 32 engelli)
- `data-hata` = `null`
- (Panel ekran görüntüsü bu koşuda alınamadı — webview kompozitlenmiyor; doğrulama DOM üzerinden
  `innerText` + `dataset.hata` ile yapıldı ve sayılar `public/data/saglik.json` ile birebir aynı.)

## 5. Sonraki adım

Ölçülebilir havuz **10.913** kaynağa indi (tamamı my.mail.ru; ~20 dakika, kapsam ~%58,7).
Sibnet (133.307) ve bot duvarlı host'lar (voe, dood, byse, MEGA, yadi.sk) hâlâ ölçek dışı:
sıradaki iş “yavaş şerit” işçisi (≤0,5 istek/sn) veya tarayıcı katmanı — ayrıntı: docs/09 §6/§9.
