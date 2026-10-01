# Günlük · 2026-10-01 · Faz 7 — Veri bütünlüğü testleri (`veri.test.mjs`)

## 1. İstenen

> “Ağsız test koşucusuna veri bütünlüğü testleri ekle: katalog ↔ anime dosya sayısı, ölü URL
> sızıntısı ve her kaynak girdisinin geçerli biçimde olması.”

## 2. Ne yapıldı?

Yeni dosya: `tools/testler/veri.test.mjs` — `npm test` koşucusuna 6 test ekledi (toplam 32 → **38**).
Ağ ve SQLite yok; yalnızca üretilmiş `public/data/*` ile link sağlık kaydı okunur. Tüm anime
dosyaları **tek geçişte** taranır (6.107 dosya, ~1,4 sn) ve sonuç testler arasında paylaşılır.

| Test | Ne doğrular |
|---|---|
| Katalog sözleşmesi | `kolonlar` sırası (12 kolon), satır biçimi, ISO üretim damgası |
| Katalog ↔ dosya | Kayıt sayısı = `anime/*.json` sayısı; slug kümeleri birebir; **tekrarlanan slug yok** (biri dosyayı sessizce ezerdi) |
| Anime sayaçları | `bolumSayisi`, `kaynakSayisi`, bölüm `ks` ve sırası `n` bölüm verisiyle tutarlı; katalog satırındaki sayaçlar dosyayla aynı |
| Kaynak girdisi | Her `src` girdisi `[player, fansub, url(, "ok")]`; URL `new URL()` ile ayrıştırılabilir http(s), 4. eleman yalnızca `"ok"`; `ekip` girdileri `{g, e|null}` |
| Ölü/engelli sızıntısı | Hiçbir dosyada `olu`/`engelli` URL yok — sağlık kaydı boşsa test kendini anlamsız sayıp hata verir |
| Künye toplamları | `kunye.json`: anime/bölüm/kaynak/tekil/rozetli sayıları gerçek dosyalarla **birebir** (316.820 · 316.806 · 173.034 · 71.694) |

## 3. Bulgu: 5 boşluklu URL ve ölçüt kararı

İlk sürüm URL'de `\S+` (boşluksuz) istiyordu ve **5 eski kayıtta kırmızıya döndü**: dördünde
sondaki boşluk (`…/_myvideo/141.html `), birinde sorgu içi boşluk (`video_ext.php? oid=…`).
Tarayıcı da `new URL()` de bunları yüzde-kodlayarak normalize eder; `new URL` ile hepsi geçerli
http(s) adresine çözülür. Ölçüt, gerçek çalışma sözleşmesine çekildi: **ayrıştırılabilirlik**
(`new URL()` + http/https protokolü + host). Boşluklu kayıtlar kaynak veride kalır
(arşiv salt okunur); testte gerekçesiyle belgelendi.

## 4. Doğrulama

```
$ npm test
   tests 38 · pass 38 · fail 0   (~1,6 sn; ağır tarama ~1,4 sn, eski süite ~0,6 sn)
```

Ayırt edicilik ölçümü (testin gerçekten hata yakaladığının kanıtı): `naruto.json`'a bilerek
`["MAIL", null, <ölü URL>]` enjekte edilince **üç test birden kırmızıya döndü** — sayaç
(`kaynakSayisi 639 ≠ 640`), ölü URL sızıntısı ve künye toplamları; biçim testi doğru şekilde
yeşil kaldı. Deney sonrası dosya yedekten birebir geri yüklendi (`cmp` temiz).

## 5. Belgeler

- [docs/05](../05-kalite-ve-testler.md) § Birim ve veri bütünlüğü testleri: iki dosya ayrımı,
  `veri.test.mjs` kapsam tablosu, boşluk bulgusu, 38 test ölçümü
- AGENTS.md §4: `npm test` artık “birim + veri bütünlüğü”; sızıntı hatasının çözümü `npm run veri`
  (kaynak verisi elle düzeltilmez)
- README komut tablosu ve docs/10 (Faz 7 satırı; “hemen yapılabilecekler”den veri bütünlüğü testi
  maddesi düştü)

## 6. Sonraki adım

Sıradaki doğal adım `public/data` dışındaki sözleşmeleri de çivilemek: üretilen `out/` HTML'inde
ölü URL sızıntısı denetimi (build sonrası) veya `katalog.json` ile `ana-sayfa.json`/`taksonomi.json`
arasında çapraz tutarlılık. Büyük kapsam işi hâlâ sibnet “yavaş şerit”inde.
