# Günlük · 2026-10-01 · Faz 7 — Derleme çıktısı denetimi (`cikti.test.mjs`) + CI entegrasyonu

## 1. İstenen

> “Derleme sonrası çıktıyı denetleyen bir test ekle: üretilen `out/` HTML'inde sitede gizlenmesi
> gereken ölü/engelli URL ve bilinmeyen kaynak işareti sızıntısı olmasın.”

## 2. Ne yapıldı?

Yeni dosya: `tools/testler/cikti.test.mjs` — `out/` yoksa testler atlanır (`skip`), varsa 4 denetim
koşar. Test sayısı 38 → **42**.

| Denetim | Ne doğrular |
|---|---|
| out/data ↔ public/data | Anime dosya kümesi birebir (bayat artık yok); `katalog/kunye/saglik/ana-sayfa/taksonomi.json` yayında |
| Ölü/engelli sızıntısı | `out/data/anime/*.json` içinde gizlenmesi gereken URL yok (316.820 kaynak taranır) |
| Rozet denetimi | `"ok"` işareti yalnızca sağlık kaydı gerçekten ok olan kaynakta; tersi de geçerli (ok kaynak rozetsiz kalmaz) — bilinmeyen/belirsiz kaynağa rozet sızması yanlış güven işaretidir |
| HTML/txt sızıntısı | `out/` altındaki tüm `.html`/`.txt` dosyalarında (12.231 dosya, 346 MB) gizli URL yok; `data/` ve `_next/` hariç |

Ön inceleme: oynatıcı kaynakları istemcide JSON'dan kurulur; `out/` HTML'lerinin hiçbirinde kaynak
URL'si yok (ölçüm: `grep -rl my.mail.ru out` yalnızca `out/data` eşleşiyor). Yine de HTML denetimi
ileride verinin sayfaya gömülmesi regresyonuna karşı kalıcı bekçi olarak eklendi.

## 3. Kısmi harita kuralı (CI uyumu)

CI'da arşiv link sağlık dosyası (`kontrol_gecmisi.jsonl`) yoktur; yalnızca depodaki
`tools/cache/link-durum.jsonl` okunur. Bu durumda 941 rozet yalnızca arşiv kaydına dayandığı için
“kayıt yok” görünür. Denetim bu durumu “yanlış rozet” saymaz: kaydı bulunamayan rozet
**“doğrulanamadı”** olarak sayılır ve koşu raporunda bildirilir; sızıntı, sayaç ve küme denetimleri
tam çalışır. Yerelde arşiv dosyası bulunduğundan rozet doğruluğu **tam** denetlenir.

## 4. CI entegrasyonu

`.github/workflows/yayinla.yml` şimdiye dek yalnızca derliyordu; artık **derlemeden sonra
`npm test`** koşuyor (yayına hazırla → testler → artefakt yükle). Böylece sızıntılı/yanlış rozetli
bir çıktı yayına çıkmadan durur. docs/06'daki adım listesi ve gerekçe notu güncellendi.

## 5. Doğrulama

```
$ npm test
   tests 42 · pass 42 · fail 0   (~3,9 sn: out verisi ~1,4 sn + html/txt taraması ~2,9 sn, paralel)

$ GENESIS_HEALTH=/nonexistent npm test     # CI simülasyonu
   42/42 · “[i] arşiv sağlık dosyası yok: 941 rozet doğrulanamadı (kısmi harita)”
```

Ayırt edicilik ölçümü: `out/data/anime/naruto.json`'a üç kusurlu kayıt (rozeti kaldırılmış ok,
`"ok"` işaretli belirsiz VK, gömülü ölü `tubeload.co` URL'si) ve `out/anime/naruto/index.html`'e
aynı ölü URL bir yoruma enjekte edilince **üç denetim birden kırmızıya döndü** (sızıntı, rozet,
html); deney sonrası iki dosya da yedekten birebir geri yüklendi (`cmp` temiz). Sağlık kaydı
boşken rozet denetiminin kendini anlamsız sayması için `rozetli > 0` ve `okBeklenen > 0` çivileri
eklendi.

## 6. Belgeler

- [docs/05](../05-kalite-ve-testler.md): üçüncü test dosyası + kapsam tablosu + kısmi harita
  kuralı + 42 test ölçümü + üçüncü ayırt edicilik deneyi
- [docs/06](../06-yayin-ve-deploy.md): CI adım listesine `npm test`, kısmi harita gerekçesi
- AGENTS.md §4: `cikti.test.mjs` ve “çözüm `npm run veri && npm run build`” kuralı
- docs/10 (42 test), README komut açıklaması

## 7. Sonraki adım

Çıktı denetimi artık yayın kapısında. Bundan sonraki adım, kapsamı büyütmek için sibnet “yavaş
şerit” işçisi ya da HTTP kanıtı üretmeyen host'lar (voe, MEGA, dood/byse) için tarayıcı/API
katmanı — ikisi de docs/09 §9'da duruyor.
