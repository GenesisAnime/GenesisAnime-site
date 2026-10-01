# Günlük · 2026-09-30 · Faz 0 — İskelet ve belgeleme düzeni

## 1. Ortam incelemesi (kod yazmadan önce)

Çalışma alanı kökü: `C:/Users/naton/OneDrive/Desktop`

İncelenen ve **salt okunur** kabul edilen girdiler:

| Yol | İçerik |
|---|---|
| `Yeni turkanimetv arsiv/güncel database/turkanime-v1 - güncel database.db` | 69,6 MB SQLite |
| `Linkleri tespit etme araçları/kontrol_gecmisi.jsonl` | 4.378 satır link kontrolü |
| `avenor/turkanime-arsiv/` | turkanime.tv Wayback aynası (tema, forum, yorumlar) |
| `Proje son dosya - çevirmen, fansubslar bilgileri/2025-10-29-animeInfos.json` | bölüm-fansub eşlemesi |
| `site/` | boş klasör — yeni proje buraya kurulacak |

Ölçülen veritabanı şeması:

```
anime(6107)  bolum(71694)  link(317146)  anime_meta(6085)
ta_fansub_group(356)  ta_anime(5719)  ta_episode_fansub(112541)
```

Kritik bulgu: `anime_meta` içinde `banner_url`, `summary`, `relations_json` kolonları **tamamen boş**
(0 kayıt) → AniList zenginleştirmesi zorunlu.
İkinci kritik bulgu: `anime_meta.score` değerleri **0–10 ölçeğinde** (5.59, 6.31, 9.12).
Üçüncü bulgu: link kontrol kapsamı 4.378 / 317.132 = **%1,38** ve neredeyse tamamı One Piece.

Ortam: Node v24.14.0, npm 11, Python 3.14.3. npm registry ve AniList GraphQL erişilebilir
(`curl -sI` ile doğrulandı).

## 2. Karar toplantısı (kullanıcıya sorulan sorular)

| Soru | Seçilen |
|---|---|
| Mimari | Next.js + TypeScript, **tamamen statik dışa aktarım** |
| Veri / ölü link politikası | Arşiv DB + AniList, **bilinen ölü kaynakları gizle** |
| Faz 1 kapsamı | "Hepsi" → hesap ve topluluk statikte çalışamayacağı için fazlara bölündü |
| Site adı | **GenesisAnime** |
| Tema | Koyu + mor/magenta vurgu |
| Teslim sırası | Statik izleme önce (Faz 1), hesaplar sonra (Faz 5) |

## 3. Kurulum

```bash
mkdir -p site/genesisanime && cd site/genesisanime
git init -b main
# package.json, tsconfig.json, next.config.mjs, .gitignore elle yazıldı
npm install --no-audit --no-fund
```

Sonuç: `added 28 packages in 35s` →

```
next       15.5.26
react      19.3.0
typescript 5.9.3
```

Ek bağımlılık yok: veri hattı `node:sqlite` (Node 22+ yerleşik) ve yerleşik `fetch` kullanıyor.
Doğrulama: `node -e "new DatabaseSync(':memory:')"` → çalışıyor (deneysel uyarı `--no-warnings` ile susturuldu).

## 4. Yapılandırma dosyaları

- `next.config.mjs` — `output: 'export'`, `trailingSlash: true`, `images.unoptimized: true`,
  `env: { NEXT_PUBLIC_BASE_PATH: basePath }`
- `tsconfig.json` — `strict`, `@/*` yol takma adı, `noEmit`
- `.gitignore` — `node_modules`, `.next`, `out`, `tools/cache`, `tools/rapor`
- `package.json` betikleri — `veri`, `veri:anilist`, `build`, `typecheck`, `yayin:hazirla`, `dev`

## 5. Kararlar

| Karar | Belge |
|---|---|
| Statik dışa aktarım | [ADR-0001](../kararlar/ADR-0001-nextjs-statik-export.md) |
| Harici CSS çatısı kullanmama | [ADR-0002](../kararlar/ADR-0002-css-catisi-yok.md) |
| Veri dizini `public/data` (sürüm kontrolünde) | [ADR-0004](../kararlar/ADR-0004-veri-dizini.md) |

## 6. Sonraki adım

Faz 1: veri hattı (`tools/export-data.mjs`) ve AniList zenginleştirmesi.
