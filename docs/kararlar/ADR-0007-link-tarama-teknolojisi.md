# ADR-0007 · Link taraması: HTTP kanıt katmanı (tarayıcı ertelendi)

- **Durum:** kabul edildi
- **Tarih:** 2026-09-30
- **Bağlam:** `docs/09-link-sagligi-otomasyonu.md`, arşiv `kontrol_gecmisi.jsonl` (4.378 kayıt)

## Sorun

317.132 tekil kaynağın yalnızca %1,38'i kontrol edilmişti. Mevcut araç
(`Linkleri tespit etme araçları/link_kontrol.py`) her kaynağı gerçek tarayıcıda açıp oynatıcı
yüklenmesini bekliyor: kaynak başına 5–15 sn, tek iş parçacığı. Tam arşiv ≈ 3–4 hafta kesintisiz
çalışma. Ayrıca ölçüm gösteriyor ki bu yöntem tek başına yeterince güvenilir değil: sibnet'te oran
sınırına takılan 2.594 kayıt yanlışlıkla “ölü” damgası almış (bkz. docs/09 §4.1).

## Karar

1. **Birincil katman HTTP kanıtıdır.** `tools/link-tara.mjs` kaynağı, host'a özgü en kesin uç
   noktadan yoklar (JSON meta uçları, oEmbed, genel API'ler, gömme sayfaları) ve kararı ölçülmüş
   imzalara dayandırır: 404/410 ya da hostun “silindi” sayfası → **ölü**; oynatıcı kaynağı işareti →
   **ok**; oran sınırı / bot duvarı / kanıtsız yanıt → **belirsiz**.
2. **Tarayıcı katmanı (Playwright) ertelendi.** Yalnızca `belirsiz` kalan kütle (bugün ~7 bin + sibnet)
   için, ayrı bir ADR ile ve ölçülmüş bir kazanç beklentisiyle ele alınacak. Gerekçe: bağımlılık ve
   tarayıcı indirmesi (yüzlerce MB) + 317 bin kaynak için ölçeklenmiyor (AGENTS.md: bağımlılık
   eklemeden önce sor).
3. **`olu` için kanıt zorunlu, `belirsiz` gizlenmez.** Yanlış gizleme kullanıcı kaybıdır (ADR-0003);
   şüphede kalınan her durum görünür kalır, rozet almaz.
4. **Kuyruk `public/data/` altına konmaz.** İlk taslakta kuyruk `public/data/link-kuyruk.jsonl`
   olarak planlanmıştı; 317 bin satırlık bir dosya statik siteye girer ve yayın boyutunu ~35 MB
   büyütürdü. Kuyruk her koşuda arşiv DB'sinden + durum dosyasından yeniden türetilir (kalıcı kuyruk
   yok). Böylece hem `public/data` temiz kalır hem de kuyruk her zaman güncel arşivle tutarlıdır.
5. **Durum dosyası sürüm kontrolündedir.** `tools/cache/` genelde önbellektir ve yok sayılır; ancak
   `tools/cache/link-durum.jsonl` bir *kanıt kaydıdır*: yeniden üretimi saatlerce ağ taraması ister ve
   sitenin 30 binden fazla “doğrulanmış” rozeti ona bağlıdır. Kaybolması sessiz veri kaybı olurdu, bu
   yüzden `.gitignore`'da istisna tanımlıdır (`tools/cache/*` + `!tools/cache/link-durum.jsonl`;
   dizin tamamen yok sayılırsa git istisnayı uygulamaz).
6. **Host'a nazik davranılır ve nazik davranıldığı kanıtlanır.** Host başına eşzamanlılık (3), istek
   aralığı (250 ms), üstel soğuma (20 dk → 12 saat) ve partiler arası harmanlı sıralama zorunludur.
   Bir host engellerse kayıt “belirsiz” olur ve host, sonraki koşularda dinlendirilir.

## Sonuçlar

- İlk gün 36.352 URL tarandı; kapsam %1,38 → %11,77; doğrulanmış rozetli kaynak 1.613 → 30.122.
- Ölü damgası uç noktadan uca ölçümle sınandı; VK'da %30 yanlış ölüm bulunup kural sıkılaştırıldı
  (oran sınırı koşullarında “ölü” veren kuralın bedeli ölçülmüş oldu).
- Maliyet: sıfır bağımlılık (Node `fetch` + `node:sqlite`), ~50 URL/sn.

## Geri alma

Araç ve durum dosyası silinirse site eski davranışına döner: `saglikOku()` yalnızca arşiv kaydını
okur, `npm run veri` eski rakamları üretir. Kod değişikliği gerekmez; geri dönüş veri düzeyindedir.
