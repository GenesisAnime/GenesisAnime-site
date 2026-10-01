# Kurulum

## Gereksinimler

- **Node.js ≥ 20** (geliştirme Node 24 ile yapıldı)
- Arşiv veritabanı (aşağıya bakın) — yalnızca veri hattını koşacaksanız gerekir
- API ile çalışacaksanız Cloudflare hesabı + `wrangler`

## Site

```bash
npm ci
cp .env.example .env      # değerleri kendiniz doldurun
npm run dev               # http://localhost:3000
```

Kök `.env` (gitignore'da) şu değişkenleri taşır:

| Değişken | Ne işe yarar |
|---|---|
| `BASE_PATH` | Alt dizin yayını (`/GenesisAnime`); kök alan adında boş bırakılır |
| `NEXT_PUBLIC_SITE_URL` | Kanonik adres, sitemap, `robots.txt` |
| `NEXT_PUBLIC_API` · `NEXT_PUBLIC_BILDIRIM_API` | Hesap/senkron ve bildirim API'si — **derleme anında HTML'e gömülür** |
| `GENESIS_ADMIN_TOKEN` | Yönetim paneli + gecelik döngü jetonu (üretimdeki `ADMIN_TOKEN`) |
| `GENESIS_API_URL` | Worker adresi |
| `TMDB_ANAHTAR` | (isteğe bağlı) 4K backdrop çekimi |

> Değerler derleme anında gömüldüğü için `.env` eksikken yapılan derleme **sessizce** API'siz bir
> site üretir; panel “API kapalı” gösterir. Yaşandı, bu yüzden belgelidir.

## Arşiv verisi

`npm run veri` arşiv SQLite dosyasını okur; dosya depoda **tutulmaz** (boyut + telif, bkz.
ADR-0004). Yol `GENESIS_ARSIV` ile verilebilir, varsayılanı deponun bir üst dizinidir.

```bash
npm run veri          # public/data/*.json üretir (depoya commit edilir)
npm run veri:anilist  # AniList zenginleştirmesi (kapak, özet, tür, banner…)
```

## Komutlar

```bash
npm run typecheck     # tsc --noEmit
npm test              # 119 test (ağsız, ~12 sn)
npm run build         # statik çıktı → out/
npm run yayin:hazirla # .nojekyll + boyut raporu
npm run link:durum    # link tarama kapsamı
npm run dongu:gunluk  # gecelik döngü kararı (panel ayarına göre)
npm run api:test      # çalışan API'ye karşı 46 adımlık duman testi
```

## API (yerel)

```bash
cd api && npm ci
npx wrangler d1 migrations apply genesisanime --local
npx wrangler dev --port 8789 --var CORS_EXTRA:http://127.0.0.1:3000
npm run api:test      # başka bir terminalde
```

`api/.dev.vars` yalnızca yerel `wrangler dev` içindir; **üretim jetonuyla aynı değildir** — panel
veya döngü onu kullanırsa sessizce `yetkisiz` hatası alırsınız. Jeton tek kaynaktan (kök `.env`)
okunur.
