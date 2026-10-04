# Yayın

## Site (GitHub Pages)

- **Adres:** https://genesisanime.github.io/GenesisAnime-site/ — proje alt dizini olduğu için `BASE_PATH=/GenesisAnime-site`.
- **Kaynak:** GitHub Actions (Settings → Pages → Source: **GitHub Actions**). Pages'in `build_type`
  değeri `workflow` olmalıdır; dal tabanlı yayında iş akışının artefaktı kullanılmaz.
- **İş akışı:** [`.github/workflows/yayinla.yml`](https://github.com/GenesisAnime/GenesisAnime-site/blob/main/.github/workflows/yayinla.yml)
  — `main`'e her push'ta: bağımlılıklar → `public/data` denetimi → `typecheck` → `build` →
  `yayin:hazirla` → `npm test` → artefakt → `deploy-pages`.

CI derlemesi şu değişkenleri kendisi verir (depoya yazılmaz):

```
BASE_PATH=/GenesisAnime-site
NEXT_PUBLIC_SITE_URL=https://genesisanime.github.io/GenesisAnime-site
NEXT_PUBLIC_API / NEXT_PUBLIC_BILDIRIM_API = https://genesisanime-api.genesisanime.workers.dev
```

> `public/data/` commit edilmediyse CI bilerek durur: veri hattı arşiv SQLite'ı olmadan koşamaz
> (ADR-0004). Veriyi tazeleyip commit etmek yerel makinenin işidir.

Boyut: `out/` ~865 MB / 21.046 dosya — GitHub Pages'in 1 GB sınırının altında. Cloudflare Pages'in
20.000 dosya sınırı bu yüzden aşıldığı için hedef GitHub Pages'tir.

## API (Cloudflare Workers + D1)

```bash
cd api
npx wrangler deploy                    # üretim: wrangler.toml'daki SITE_ORIGIN ile
npx wrangler secret put JWT_SECRET     # bir kez
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put IP_TUZ
npm run db:uzak                        # şemayı uzak D1'e uygula
```

- **CORS** yalnızca `SITE_ORIGIN` (site kaynağı) içindir. Yerelde denemek için
  `npx wrangler deploy --var CORS_EXTRA:http://127.0.0.1:8010` verilebilir; **iş bitince izinsiz
  yeniden dağıtılmalıdır** (doğrulama: izinli ve izinsiz `Origin` ile iki `curl`).
- `api/.dev.vars` yalnızca yerel `wrangler dev` içindir; üretim jetonuyla karıştırılırsa `yetkisiz`
  hatası alınır (yaşandı, belgelendi).
- Worker sürüm geçmişi `npx wrangler deployments status` ile izlenir; geri alma = önceki kodu
  yeniden dağıtmak.

## Gecelik otomasyon

Link tarama döngüsü: Windows Görev Zamanlayıcısı (`GenesisAnime gunluk dongu`, saatlik) →
`tools/dongu.cmd` → `npm run dongu:gunluk`. Kapsam, koşu geçmişi ve politika `/yonetim/` panelinde
görünür (panel `noindex`). Commit/push yalnızca panelden açıkça istenirse yapılır.

## Yayın öncesi kapı

```bash
npm run typecheck && npm test && npm run build && npm run yayin:hazirla
```
