# Günlük · 2026-10-01 · Faz 7 — Üçüncü oturum: kapsam %25,49 → %30,17

## 1. İstenen

> “Kalan 105.798 ölçülebilir kaynağı dilim dilim tarayıp kapsamı ~%30'a çıkar; sonunda veriyi
> yenile, derle ve /kunye rakamlarını doğrula.”

## 2. Başlangıç durumu

- `npm run link:durum`: **80.826/317.132 = %25,49** (kesin %26,85 değil — %22,53).
- Kalan ölçülebilir havuz (`--kuru`, sibnet/mega/dood/byse hariç): 105.798 —
  my.mail.ru 65.816 · ok.ru/odnoklassniki 25.421 · href.li 11.700 · drive.google.com 2.463 ·
  yadi.sk 398.
- Önceki oturumun H-14 düzeltmesi (`zamanOku` artık yerel biçimi ilk deniyor) yerinde;
  dilimler baştan sona yeni URL üretti.

## 3. Dilimler

```bash
npm run link:tara -- --dilim=17000 --es=20 --sure-dk=9 \
  --haric-host=video.sibnet.ru,mega.nz,dood.watch,byse.sx   # 2 kez
```

| Dilim | İstek | ok | ölü | engelli | belirsiz | Kapsam (sonra) |
|---|---:|---:|---:|---:|---:|---:|
| 6 | 8.203 | 7.545 | 1 | 14 | 643 | %28,07 |
| 7 | 6.665 | 6.150 | 2 | 1 | 512 | **%30,17** |

- Hız bu kez ~15 istek/sn: havuz 5 host'a indi, host başına 3 eşzamanlı / 250 ms sınırı geçerli
  (7 host'lu dilimlerde ~25/sn ölçülmüştü).
- **yadi.sk** dördüncü kez 429 aldı (→ 160 dk soğuma) ve kalan 396 işi dilimden düştü;
  **drive.google.com** havuzu tükendi.
- 6. dilimde ok.ru'da **14 kaynak `engelli`** (yasal/coğrafi kısıtlama) işaretlendi; kural
  gereği bunlar sitede gizlenir, “ölü” sayılmaz.
- Oturum toplamı: **14.866 yeni URL**.

## 4. Veri, derleme, /kunye doğrulaması

```
$ npm run link:durum
   kontrol edilmiş     : 95.692  (%30,17)   · kendi taramamız 94.723
   dağılım             : ok 84.846 · ölü 288 · engelli 21 · belirsiz 10.537
   kesin karara varılan: %26,85

$ npm run veri && npm run typecheck && npm run build && npm run yayin:hazirla
   tutulan kaynak 316.846 (gizlenen 281 ölü + 19 engelli = 300)
   tsc: 0 hata · build: 18.377 dosya / 400,36 MB · 6.107 anime sayfası · 404.html var
   GitHub Pages uygun · Cloudflare Pages uygun
```

`/kunye/` canlı doğrulaması (Preview · `http://127.0.0.1:8000/kunye/?tazelik=3`):

- dürüst durum kutusu: **%30,17 (95.692) kontrol · %26,85 (85.155) kesin · 10.537 belirsiz**
- kartlar: **316.846 listelenen kaynak · 84.847 doğrulanmış kaynak** · 6.107 anime · 71.694 bölüm
- gizlenen: 300 (281 ölü + 19 engelli)
- `data-hata` = `null`
- (Bu koşuda panel ekran görüntüsü alınamadı — webview kompozitlenmiyor; doğrulama DOM
  üzerinden `innerText` + `dataset.hata` ile yapıldı. Sayılar `public/data/saglik.json` ve
  `kunye.json` ile birebir aynı.)

## 5. Sonraki adım

Ölçülebilir havuz **90.534** kaynağa indi: my.mail.ru 61.682 · ok.ru 21.281 · href.li 7.571.
Aynı tempoyla ~10–11 dilim (yaklaşık 1,5 saat) kapsamı ~%55'e çıkarır. Sibnet (133.307 +
~2.594 artefakt) ve bot duvarlı host'lar hâlâ ölçek dışı; sıradaki iş ya “yavaş şerit” işçisi
(0,5 istek/sn) ya da tarayıcı katmanı — ayrıntı: [docs/09](../09-link-sagligi-otomasyonu.md) §6/§9.
