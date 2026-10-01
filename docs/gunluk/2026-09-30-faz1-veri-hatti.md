# Günlük · 2026-09-30 · Faz 1 — Veri hattı

## 1. Ortak yardımcı modülü

`tools/lib/ortak.mjs` yazıldı:

- yol çözümleme (`GENESIS_ARSIV`, `GENESIS_DB`, `GENESIS_HEALTH` ortam değişkenleriyle geçersiz kılınabilir)
- Türkçe normalizasyon: `İ/I/Ş/Ğ/Ü/Ö/Ç` doğru küçük harf + aksan sadeleştirme (arama için)
- tür eşleme tablosu: AniList `genres` + etiketler → 35 Türkçe kategori
- `saglikOku()`: link kontrol JSONL'ini URL → durum haritasına çevirir
- `ekipBilgisiTemizle()`: çevirmen metninden URL ve ayraç artıklarını temizler
- `bolumNoCikar()` / `bolumEtiketi()`: bölüm numarası ve etiketi çıkarımı

## 2. İlk koşu ve hatalar

### Koşu 1 — veri hattı çalıştı, hero boş kaldı

```
$ node --no-warnings tools/export-data.mjs
   link sağlık kaydı : 4378
   AniList önbelleği : YOK (zenginleştirme atlanacak)
   anime 6107 · bölüm 71694 · link 317146 · ekip kaydı 112541
   atılan ölü kaynak: 2670 · engelli: 84 · tutulan: 314392
   süre: 8.3 sn
   katalog.json 1601.9 KB · ana-sayfa.json 67.9 KB (9 satır, 0 hero) · anime/*.json 6107 dosya
```

**Sorun A — hero 0.** Filtre aşamalarını sayan geçici ölçüm eklendi:

```
hero havuzu: 6085 · kaynaklı: 5947 · bannerlı: 4003 · banner+yıl≥2010: 2966 · +puan≥70: 0
```

Son aşamanın sıfıra düşmesi kök nedeni gösterdi: `anime_meta.score` **0–10 ölçeğinde**, kod ise
0–100 varsayıyordu. Düzeltme: `puan = an.puan ?? Math.round(meta.score * 10)`.
Sonuç: 1.581 aday → 24 hero.

**Sorun B — yalnızca 9 satır.** `genres_json` küçük harfli etiketler içeriyor (`"adventure"`),
eşleme tablosu ise `"Adventure"` bekliyordu. `turEsle()` (harf duyarsız) eklendi ve küçük harfli
AniList karşılıkları tabloya girdi. Sonuç: 18 satır, 44 tür.

**Sorun C — kapsam yüzdesi yanlış paydadan.** `kapsamYuzdesi` tutulan kaynak sayısını payda alıyordu;
`hamTekilUrl` (317.132) eklendi → %1,38.

**Sorun D — arama anahtarında tekrar.** `"naruto naruto naruto naruto ..."` →
`araAnahtariTekil()` kelimeleri tekilleştirip 140 karakterle sınırlar.

## 3. AniList zenginleştirmesi

```bash
$ node --no-warnings tools/enrich-anilist.mjs --limit 100     # deneme koşusu
   AniList kimliği: 100 · parça boyutu 50
   önbellekte anime: 99 · banner/özet/tür: 65/99/99
   ilişkili yapım: 70 anime · yasal izleme/fragman: 59/51

$ node --no-warnings tools/enrich-anilist.mjs                 # tam koşu (117 parti)
   ... 30/117 parça   → HTTP 429, 17 sn bekledi (Retry-After)
   ... 50/117 parça   → HTTP 429, 60 sn bekledi
   ... 117/117 parça (5809 anime)
   banner/özet/tür: 4040/5790/5787 · ilişkili: 4111 · yasal/fragman: 3920/3242
   dosya boyutu: 8.31 MB
```

4 kez 429 alındı; üstel geri çekilme + `Retry-After` başlığı ile aşıldı. Parça önbelleği sayesinde
yeniden çalıştırma anında döndü.

## 4. Nihai koşu

```
$ npm run veri
   süre: 8,8 sn
   katalog.json   1767.8 KB      (6.107 satır, kolon dizisi)
   ana-sayfa.json  319.2 KB      (18 satır, 24 hero)
   taksonomi.json   19.8 KB
   anime/*.json   6107 dosya · 44,8 MB · ort. 7,5 KB · en büyük 367 KB (one-piece)
   atılan ölü: 2670 · engelli: 84 · tutulan: 314.392 · doğrulanmış: 1.613
```

`kunye.json`:

```json
{ "anime": 6107, "bolum": 71694, "kaynak": 314392, "tekilKaynak": 314378,
  "dogrulanmisKaynak": 1613, "fansubGrubu": 363, "player": 22, "tur": 44,
  "bölümsüzAnime": 47, "kaynaksizAnime": 141, "zenginlestirilmisAnime": 5850,
  "iliskiKaydi": 8046, "yasalIzlemeBaglantisi": 8092 }
```

## 5. Player güvenilirliği (link kontrolünden)

```
UQLOAD 99% · VOE 97% · CYBERFILE 97% · MAIL 95% · MEGA 90% · VIDEA 75% · SIBNET 27% · ODNOKLASSNIKI 3%
```

## 6. Kararlar

- Ölü/engelli kaynak gizleme kuralı → [ADR-0003](../kararlar/ADR-0003-link-sagligi-stratejisi.md)
- Veri dizini ve CI stratejisi → [ADR-0004](../kararlar/ADR-0004-veri-dizini.md)

## 7. Sonraki adım

Faz 2: arayüz katmanı — tasarım sistemi, bileşenler, sayfalar.
