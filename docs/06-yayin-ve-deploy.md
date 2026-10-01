# 06 · Yayın ve Dağıtım

> Son güncelleme: 2026-10-01

## Çıktı ölçümü (gerçek koşu)

`npm run yayin:hazirla` çıktısı — `tools/rapor/yayin-raporu.md`:

| Ölçüm | Değer |
|---|---|
| Dosya sayısı | **21.043** |
| Toplam boyut (dosya baytları) | **865,2 MB** |
| Disk kullanımı (`du`) | 905 MB (küçük dosya başına blok tahsisi nedeniyle daha yüksek) |
| Anime sayfası | 6.107 · seri 961 · fansub 363 |
| `.nojekyll` | var |
| `404.html` | var |
| GitHub Pages (< 1 GB) | ✅ uygun (858 MB — pay az) |
| Cloudflare Pages (≤ 20.000 dosya) | ❌ **AŞIYOR** (21.043) |

> **Değişim (01.10):** Tur D ile 1.324 grup sayfası (961 seri + 363 fansub) ve PWA/OG varlıkları
eklendi; dosya sayısı 18.377 → 21.043 oldu ve Cloudflare Pages'in ücretsiz 20.000 dosya sınırı
aşıldı. Asıl hedef GitHub Pages olduğu için yayın etkilenmez; CF Pages alternatifi gerekirse
Direct Upload + ücretli plan (100.000 dosya) ya da bölüm listelerini istemciye taşıyacak bir
boyut küçültme turu gerekir. Ölçüm her koşuda `tools/rapor/yayin-raporu.{md,json}` içine yazılır.

### Boyut dağılımı

| Bölüm | Boyut | Dosya |
|---|---:|---:|
| `anime/` — HTML + RSC | ~690 MB | 12.214 |
| `seri/` — HTML + RSC | ~85 MB | 1.922 |
| `fansub/` — HTML + RSC | ~61 MB | 726 |
| `data/` — üretilmiş veri | 64 MB | 6.114 |
| `_next/` — JS/CSS | ~2 MB | ~30 |
| PWA/OG (`sw.js`, `og.png`, `ikon/*`, `favicon.svg`) | < 1 MB | 7 |
| diğer (kök HTML, sitemap, robots, 404, `seriler/`, `fansublar/`, `hesap/`) | ~5 MB | ~30 |

Dosya türü dağılımı: `.html` 7.442 · `.txt` 7.441 (RSC) · `.json` 6.114 · `.png` 5 · `.js` 35 ·
`.webmanifest` 1 · `.svg` 1 · `.xml` 1 · `.css` 1.

> `index.txt` dosyaları Next.js'in istemci taraflı gezinme için ürettiği RSC yükleridir ve toplamın
> **~%37'sini** (≈314 MB) oluşturur. Silinemezler (silinirse `Link` gezinmeleri tam sayfa yüklemeye
> düşer), ancak boyut azaltma çalışmasında HTML + RSC ikilisi ana hedeftir — ayrıntı: H-3,
> `docs/05-kalite-ve-testler.md`.

## Host karşılaştırması

| Host | Limitler | Değerlendirme |
|---|---|---|
| **GitHub Pages** | 1 GB site, dosya sayısı limiti yok, 10 derleme/saat | **Önerilen ve kullanılan**; 858 MB sığıyor ama pay az (limitin %84'ü) |
| **Cloudflare Pages** | 20.000 dosya, 25 MB/dosya, sınırsız bant genişliği | ❌ Aşıyor (21.043/20.000) — Tur D'nin grup sayfaları sonrası |
| **Netlify** | 100 GB/ay bant genişliği, dosya limiti yok | Yedek seçenek |

> Not: API servisi Cloudflare **Workers + D1** üzerindedir; Workers'ın statik varlık limiti bu
> hesapla ilgili değildir (site Pages'e taşınırsa geçerli olur). API kodu `wrangler dev` + yerel D1
> ile uçtan uca sınandı (`npm run api:test`, 45 adım; ayrıntı: [11](11-hesaplar-uygulama.md));
> gerçek hesaba dağıtım 01.10.2026'da yapıldı ve uzak adrese karşı 46/46 doğrulandı (aşağıdaki
> bölüm). GitHub Pages 1 GB sınırına yaklaşıldığında ilk hedefler: bölüm listelerini istemciye
> taşımak ve anime sayfalarını sadeleştirmek (potansiyel kazanç ~400 MB).

## API dağıtımı (gerçek Cloudflare koşusu, 01.10.2026)

| Öğe | Değer |
|---|---|
| Worker | `genesisanime-api` → **https://genesisanime-api.genesisanime.workers.dev** |
| D1 veritabanı | `genesisanime` · `abde0636-74dd-4d0e-b9c6-12704d3b1f10` (bölge WEUR, AMS) |
| workers.dev alt alan adı | `genesisanime` (panelden değiştirilebilir — Worker adresi de değişir) |
| Secret'lar | `JWT_SECRET`, `ADMIN_TOKEN`, `IP_TUZ` (rastgele üretildi; yalnızca Worker'da tutulur) |
| Değişken | `SITE_ORIGIN=https://nutaliaxd.github.io` — CORS **yalnızca** buraya açık |
| Şema | `migrations/0001.sql` uzak D1'e uygulandı (5 tablo) |

Kurulum sırası (tek seferlik):

```bash
cd api
npx wrangler login                 # tarayıcı onayı gerekir
npx wrangler d1 create genesisanime # çıkan database_id → wrangler.toml
npm run db:uzak                     # şemayı uzak D1'e uygula
printf '%s' "$(openssl rand -base64 48)" | npx wrangler secret put JWT_SECRET
printf '%s' "$(openssl rand -base64 32)" | npx wrangler secret put ADMIN_TOKEN
printf '%s' "$(openssl rand -base64 48)" | npx wrangler secret put IP_TUZ
npm run deploy                      # Worker adresini yazdırır
```

Yeni hesaplarda çıkan iki engel (ikisi de panelde çözülür):

1. **E-posta doğrulaması yoksa** `secret put`/`deploy` şu hatayla düşer:
   `You need to verify your email address to use Workers [code: 10034]`. Doğrulama postasındaki
   bağlantıya tıklanınca aynı komut sorunsuz çalışır.
2. **workers.dev alt alan adı kayıtlı değilse** deploy şu uyarıyla durur:
   `You need to register a workers.dev subdomain before publishing to workers.dev`. Panelden
   (Workers & Pages → sağdaki subdomain → Change) ya da API'den
   (`PUT /accounts/<id>/workers/subdomain`) **ücretsiz** kaydedilir; etkileşimsiz `wrangler deploy`
   bu soruyu yanıtlayamaz.

Site derlemesi (dağıtım sonrası):

```bash
BASE_PATH=/GenesisAnime \
NEXT_PUBLIC_SITE_URL=https://nutaliaxd.github.io/GenesisAnime \
NEXT_PUBLIC_API=https://genesisanime-api.genesisanime.workers.dev \
NEXT_PUBLIC_BILDIRIM_API=https://genesisanime-api.genesisanime.workers.dev \
npm run build && npm run yayin:hazirla
```

Uzak doğrulama:

```bash
GENESIS_API_URL=https://genesisanime-api.genesisanime.workers.dev \
GENESIS_ADMIN_TOKEN=<ADMIN_TOKEN> \
npm run api:test -- --origin=https://nutaliaxd.github.io
```

`--origin` uzakta **zorunludur**: e2e'nin bir adımı `--origin` kaynağının CORS'ta izinli olmasını
bekler; uzakta izinli tek kaynak sitenin kendisidir (varsayılan `http://127.0.0.1:8000` değil).
Yerelde ise tam tersi: `wrangler dev`e `--var CORS_EXTRA:http://127.0.0.1:8000` verilir.

Ölçümler (01.10.2026):

- Uzak koşu: **45/45 geçti** (tek atlanan: isteğe bağlı `--oran`). Oran sınırı atomik artırmaya
  çevrildikten sonra aynı koşu `--oran` ile tekrarlandı: **46/46**, atlanan 0 — koşu üretimde
  gerçekten 429 `cok-fazla-istek` gördü, yani karar D1'in koşullu `UPDATE`'i (`meta.changes`) ile
  veriliyor.
- Kayıt ucu: `cpuTime 28 ms`, `wallTime 265 ms`, `outcome ok`. Bu değer ücretsiz planın 10 ms CPU
  sınırının üzerindedir; koşu başarılı olduğuna göre hesap Workers Paid tarafındadır (panelden
  teyit edilmeli) — aksi hâlde PBKDF2'li kayıt/giriş CPU sınırında düşerdi.
- Tarayıcı doğrulaması: derlenmiş `out/` :8000'de sunulup **uzak API'ye karşı** çalıştırıldı
  (geçici `CORS_EXTRA` ile): kayıt → “Eşitlendi” (uzak D1'de `surum` artışı ve
  `izlenen: {"naruto|1": …}`) → oynatıcıdan “Kaynak çalışmıyor” bildirimi yönetici kuyruğunda
  göründü → KVKK hesap silme `silindi:true` döndü. Ardından geçici izin kaldırılıp yeniden deploy
  edildi ve `OPTIONS` yanıtının localhost kaynağına artık `ACAO` vermediği doğrulandı.
- Önbellek tuzağı: aynı `OPTIONS` isteği geçici izinliyken yapıldıysa Cloudflare uç önbelleği
  eski yanıtı bir süre tekrar verebilir; değişkenin kaldırıldığını sorgu dizesi ekleyerek (ör.
  `?t=123`) ya da dağıtım bağlamalarını API'den okuyarak doğrulayın.

## GitHub Actions ile otomatik yayın

`.github/workflows/yayinla.yml` — `main` dalına her push'ta:

1. `actions/checkout@v4` → Node 22 + npm önbelleği
2. `npm ci`
3. **Veri dosyası kontrolü:** `public/data/katalog.json` yoksa iş akışı hata verir ve
   "önce `npm run veri` çalıştırıp commit edin" mesajıyla durur
4. `npm run typecheck`
5. `npm run build` — `BASE_PATH=/<depo-adı>`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API` ve
   `NEXT_PUBLIC_BILDIRIM_API` ortam değişkenleriyle (API adresleri iş akışında sabittir; boş
   bırakılırsa site **hesapsız** yayınlanır ve `/hesap/` "API kapalı" durumuna döner — sessiz kayıp)
6. `npm run yayin:hazirla`
7. **`npm test`** — birim + veri/çıktı bütünlüğü testleri; derlenmiş `out/` ağacında ölü/engelli
   URL, yanlış/eksik “ok” rozeti ve katalog-dosya tutarsızlığı arar; hata bulursa yayın durur
8. `actions/configure-pages`, `upload-pages-artifact`, `deploy-pages`

### Neden CI veri hattını çalıştırmıyor?

Veri hattı 70 MB'lık arşiv SQLite dosyasını okur ve o dosya bu depoda değildir (harici, salt
okunur bir arşivdir). Bu nedenle üretilmiş `public/data/` çıktısı **bilinçli olarak sürüm
kontrolüne dahil edilir** (~47 MB). Ayrıntı ve alternatifler: ADR-0004.

Aynı nedenle arşiv link sağlık geçmişi (`kontrol_gecmisi.jsonl`) de CI'da yoktur. `npm test`
yine koşar: sızıntı ve sayaç denetimleri depodaki `tools/cache/link-durum.jsonl` kaydıyla tam
çalışır; yalnızca arşiv kaydına dayanan rozetler "doğrulanamadı" sayılır ve koşu raporunda
sayısı bildirilir (yerel koşuda tam doğrulama yapılır).

## Alt dizin (basePath) yapılandırması

GitHub Pages proje siteleri `https://<kullanıcı>.github.io/<depo>/` altında yayınlanır:

```bash
BASE_PATH=/GenesisAnime \
NEXT_PUBLIC_SITE_URL=https://nutaliaxd.github.io/GenesisAnime \
npm run build
```

- `next.config.mjs` `basePath` ve `assetPrefix` değerlerini `BASE_PATH`'ten alır.
- `src/app/manifest.ts` ve `src/app/layout.tsx` ikon/OG yollarına ön ek ekler (`TABAN`).
- Hesap servisi kullanılacaksa `NEXT_PUBLIC_API` ve `NEXT_PUBLIC_BILDIRIM_API` derleme anında
  verilir (bkz. [11](11-hesaplar-uygulama.md)); boş bırakılırsa site hesapsız, tam çalışır.
  Dağıtılmış API ile tam derleme komutu yukarıda, "API dağıtımı" bölümündedir.
- `env: { NEXT_PUBLIC_BASE_PATH }` ile değer istemciye taşınır; `src/lib/yollar.ts` içindeki
  `genelYol()` / `animeVeriYolu()` yardımcıları `public/data` isteklerine ön ek ekler
  (Next.js bu istekleri otomatik öneklemez).
- Kök alan adı veya Cloudflare Pages için `BASE_PATH` boş bırakılır.

## İlk push (kurulum, 01.10.2026)

Depo: **https://github.com/Nutaliaxd/GenesisAnime** (public). İlk commit yerelde hazır
(`783dca6`, 6.236 dosya). `out/` ve `.next/` gitignore'da olduğu için push edilen ağaç ~55 MB
(kaynak + `public/data/` 64 MB'ın izlenen kısmı + 49,9 MB'lık `tools/cache/link-durum.jsonl` kanıt
kaydı).

```bash
git remote add origin https://github.com/Nutaliaxd/GenesisAnime.git   # yapıldı
git push -u origin main                                               # yayını başlatır
```

Push sonrası iki ayar GitHub tarafında yapılır:

1. **Settings → Pages → Source: GitHub Actions** (yoksa iş akışı dağıtamaz).
2. İlk iş akışı koşusu `Actions` sekmesinde izlenir; `derle` işi düşerse yayın yapılmaz (kapı).

> Not: `tools/cache/link-durum.jsonl` 49,9 MB'dır — GitHub'ın 50 MB "önerilen üst sınır"
> uyarısının hemen altındadır (100 MB'da blok). Bu dosya bilinçli olarak izlenir (kanıt kaydı,
> ADR-0007); büyümesi sürerse sıkıştırma ya da parçalama gerekir.

## İlk yayın kontrol listesi

- [ ] `npm run veri` çalıştırıldı ve `public/data/` güncel
- [ ] `npm run veri:anilist` (isteğe bağlı, önbellek zaten `tools/cache` içinde)
- [ ] `npm run typecheck` → 0 hata
- [ ] `npm run build` → 7.442 sayfa
- [ ] `npm run yayin:hazirla` → GitHub Pages < 1 GB (CF Pages artık aşıyor, bilinçli)
- [ ] Depoda `public/data/` commit edildi (`.gitignore` bunu engellemiyor) ✔ (783dca6)
- [ ] `origin` bağlandı ve `git push -u origin main` atıldı (`push` hâlâ bekliyor)
- [ ] GitHub deposunda **Settings → Pages → Source: GitHub Actions** seçildi
- [ ] İş akışında `NEXT_PUBLIC_API` / `NEXT_PUBLIC_BILDIRIM_API` dolu (yayınlanan site hesap
      özellikli olsun; API adresi değişirse burada da güncellenir)
- [ ] `SITE.url` (`src/lib/site.ts`) gerçek adresle güncellendi
- [ ] Yayın sonrası duman testi: ana sayfa, bir anime sayfası, bir oynatıcı sayfası, sitemap.xml

## Yayın sonrası doğrulama

```bash
curl -sI https://<adres>/ | head -1                 # 200
curl -sI https://<adres>/anime/naruto/ | head -1    # 200
curl -s  https://<adres>/sitemap.xml | head -3      # XML başlığı
curl -s  https://<adres>/robots.txt                 # Disallow: /izle/, /ara/, /listem/
```

Ve tarayıcıda: oynatıcı sayfasında iframe'in yüklendiği, kaynak çiplerinin göründüğü doğrulanır.

## Geri alma

Statik çıktı sürümlenmediği için geri alma = önceki commit'e dönüp yeniden yayınlamak.
GitHub Pages dağıtımları iş akışı çalıştırma geçmişinden tekrar tetiklenebilir
(Actions → son başarılı çalıştırma → "Re-run jobs").
