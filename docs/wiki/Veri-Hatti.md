# Veri Hattı

```
arşiv SQLite  ──export-data──▶  public/data/*.json  ──next build──▶  out/  ──▶  GitHub Pages
      ▲                                  ▲
      │                                  │
AniList GraphQL ──enrich-anilist──▶ tools/cache/anilist.json
link taraması   ──link-tara──────▶ tools/cache/link-durum.jsonl
TMDB eşlemesi   ──tmdb-esle──────▶ tools/cache/tmdb.json
```

## Adımlar

| Araç | Ne yapar | Çıktı |
|---|---|---|
| `tools/link-tara.mjs` | Kaynak URL'lerini partiler hâlinde yoklar (host başına nazik hız) | `tools/cache/link-durum.jsonl` |
| `tools/export-data.mjs` | Arşiv DB + link sağlığı + AniList'i birleştirip site verisini üretir | `public/data/**` |
| `tools/enrich-anilist.mjs` | Kapak, banner, özet, tür, yıl, ilişkiler, yasal bağlantılar | `tools/cache/anilist.json` |
| `tools/tmdb-esle.mjs` | Banner URL'indeki AniList kimliğiyle TMDB kaydını eşler (anahtarsız) | `tools/cache/tmdb.json` |
| `tools/tmdb-zenginlestir.mjs` | TMDB `/images` ucundan en geniş backdrop'u seçer (anahtar gerekir) | `tools/cache/tmdb-backdrop.json` |
| `tools/yayin-hazirla.mjs` | `.nojekyll`, boyut raporu | `out/` denetimi |

## Neyin commit edildiği (ve neden)

- **`public/data/` commit edilir.** Veri hattı arşiv SQLite'ını gerektirir ve o dosya depoda yoktur;
  üretilmiş JSON'lar commit edilmezse CI siteyi derleyemez (ADR-0004).
- **`tools/cache/` çoğunlukla commit edilmez** (yeniden üretilebilir önbellekler) — **tek istisna**
  `tools/cache/link-durum.jsonl`: 317 bin URL'nin taranması saatler sürer ve dosya kaybolursa
  ~30 bin “doğrulanmış” rozet sessizce kaybolur (ADR-0007).
- Sırlar (jetonlar, API anahtarları) **asla** depoya girmez; kök `.env` ve `wrangler secret` kullanılır.

## Link sağlığı politikası

Karar yalnızca somut kanıta dayanır: `404/410` ya da hostun “dosya silindi” sayfası **ölü**; oynatıcı
kaynağı **çalışıyor**. Oran sınırı (403/429), bot/DDoS duvarı ve JavaScript ile üretilen sayfalar
**belirsiz** kalır — şüphede kalınan kaynak gizlenmez, yalnızca rozetsiz görünür. Kural
değişiklikleri canlı URL'lerle sınanır (`npm run link:test`).

## Gecelik döngü

`npm run dongu:gunluk`: panel ayarını okur → karar verir (`tools/lib/dongu.mjs`, saf) → tarama →
veri → derleme → yayın hazırlığı → (istenirse) commit/push. Politika D1'de (`tarama_ayar`), iş bu
makinede; zamanlayıcı saatte bir uyanır ama “günde bir” kuralını döngü uygular, böylece makine gece
kapalıysa koşu kaçmaz. Derleme `out/` kilidine dayanıklıdır (kilit geçene kadar bekler, kilit
hatasında artan beklemeyle tekrarlar).
