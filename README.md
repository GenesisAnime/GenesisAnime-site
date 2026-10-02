<div align="center">

# GenesisAnime

**Türkçe anime arşivi — %100 açık kaynak, tamamen statik, sunucusuz.**

[![Lisans: MIT](https://img.shields.io/badge/lisans-MIT-green)](LICENSE)
[![Testler: 186/186](https://img.shields.io/badge/testler-186%2F186-success)](docs/05-kalite-ve-testler.md)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![Cloudflare Workers + D1](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-f38020)](docs/11-hesaplar-uygulama.md)

6.107 anime · 71.694 bölüm · 316.820 kaynak · 961 seri (franchise) grubu · 363 fansub grubu

Site: **https://nutaliaxd.github.io/GenesisAnime/** · API: **https://genesisanime-api.genesisanime.workers.dev**

PWA kurulabilir · çevrimdışı iskelet · hesap açmadan tam çalışır (isteğe bağlı senkron)

</div>

---

## Nedir?

GenesisAnime, kapanan bir anime arşivinin kurtarılan veritabanı üzerine kurulu bir izleme
sitesidir. Site sunucu barındırmaz: tüm sayfalar derleme sırasında üretilir ve GitHub Pages'te
yayınlanır. Oynatma, üçüncü taraf video platformlarının gömülü (embed) sayfaları üzerinden
yapılır; **sitede hiçbir video dosyası barındırılmaz.**

Hesap, senkron ve kullanıcı bildirimleri ayrı ve yine açık kaynak bir Cloudflare Workers + D1
servisidir (`api/`). Site bu servis olmadan da eksiksiz çalışır — servis yalnızca cihazlar arası
eşitleme ve "kaynak çalışmıyor" bildirimi için gerekir.

**%100 açık kaynak:** veri hattı, site, API, testler, belgeler ve mimari kararların tamamı bu
depodadır. Kapalı bileşen, gizli veri işleme veya reklam/izleyici betiği yoktur. Kod
[MIT](LICENSE) lisanslıdır.

## Proje durumu

> Bu tablo **aktif olarak güncellenir**: her anlamlı tur sonunda ölçümler ve sıradaki işler
> burada tazelenir (kural: `AGENTS.md` §3).

| Alan | Durum |
|---|---|
| Veri | 6.107 anime · 71.694 bölüm · 316.820 kaynak · 961 seri · 363 fansub grubu |
| Banner görselleri | TMDB kimliği **5.266** yapımda (%86,2; Fribb 4.907 + arama 359) · 4K katmanı **2.495** · HD katmanı **2.269** · anime detay bandı **5.306/6.107** sayfada dolu (hero 20/24 · kart 391/540 · bant 3,4:1 → kaynağın ~%52'si; TMDB atfı `/kunye/` ve alt bilgide) |
| Site derlemesi | 7.448 sayfa → `out/` 21.049 dosya / 880,6 MB (GitHub Pages uyumlu; CF Pages 20k sınırını aşıyor) |
| Link sağlığı | kapsam **%58,72** — 173.030 `ok` · 301 `ölü` · 34 `engelli` · 12.861 `belirsiz` (ölçülebilir havuz tükendi) |
| Otomasyon | günlük link döngüsü zamanlayıcıda (saatlik uyanır, günde bir koşar) · `/yonetim/` panelinden ayar + koşu geçmişi |
| Testler | `npm test` **186/186** (ağsız) · `npm run api:test` uzakta **46/46** (oran sınırı dahil) |
| API | Cloudflare Worker + D1 yayında (bölge WEUR) · CORS yalnızca site kaynağına açık |
| Son güncelleme | 2 Ekim 2026 |
| Sıradaki işler | analytics kararı · gece döngüsünün çok günlük gözlemi · e-posta doğrulama + parola sıfırlama · yayın boyutunu ~400 MB küçültme · akış köprüsünü oynatıcıya bağlama (Mail.ru %27,9, [docs/12](docs/12-akis-koprusu.md)) ([docs/10](docs/10-yol-haritasi.md)) |

## Hızlı başlangıç

```bash
npm install            # bağımlılıklar (Next.js 15 + React 19 + TypeScript)

# Veri hattı — arşiv SQLite dosyası GEREKİR (varsayılan yol aşağıda)
npm run veri           # katalog, anime dosyaları, taksonomi, ana sayfa satırları (~9 sn)
npm run veri:anilist   # AniList zenginleştirmesi: banner/özet/tür/ilişki (~4 dk, önbellekli)

npm run link:durum     # link tarama kapsamı (istek atmaz)
npm run link:tara -- --dilim=5000   # sıradaki 5000 kaynağı tara (kesintiye dayanıklı)
npm run link:tara -- --bildirim --dilim=2000  # kullanıcı bildirilerini öne alarak tara
npm run link:bildirim  # API'deki bildirimleri tools/cache/bildirim.jsonl'e aktar
npm run link:test      # tarama kurallarını canlı URL'lerle sına

npm run simge:uret     # OG kartı + PWA ikonlarını yeniden üret (bağımlılıksız PNG)
npm run dev            # geliştirme sunucusu → http://localhost:3000
npm run build          # statik dışa aktarım → out/
npm run yayin:hazirla  # .nojekyll + yayın ölçüm raporu

# API (isteğe bağlı) — ayrıntı: api/README.md
cd api && npm install && npm run dev   # wrangler dev → http://127.0.0.1:8789
cd .. && npm run api:test              # çalışan API'ye 45 adımlık uçtan uca duman testi
```

Link taraması arşivdeki 317 bin kaynağı **HTTP kanıtı** ile yoklar (404 → ölü, oynatıcı işareti →
çalışıyor, bot duvarı/oran sınırı → belirsiz; belirsizler gizlenmez). Sonuçlar anında
`tools/cache/link-durum.jsonl`'e yazılır, `npm run veri` ile siteye yansır. Ayrıntı:
[docs/09-link-sagligi-otomasyonu.md](docs/09-link-sagligi-otomasyonu.md).

Arşiv veritabanı varsayılan olarak şurada aranır:

```
../../Yeni turkanimetv arsiv/güncel database/turkanime-v1 - güncel database.db
```

Farklı bir konum için `.env.example` dosyasındaki `GENESIS_DB` / `GENESIS_ARSIV` değişkenlerini
kullan.

## Mimari

```
Arşiv SQLite (salt okunur) ─┐
Link kontrol geçmişi ───────┼─→ tools/export-data.mjs ─→ public/data/*.json ─┐
Link tarama durumu ─────────┤            │                                   │
AniList GraphQL (önbellekli)┘            │                                   │
                                         └─→ tools/rapor/veri-raporu.md      │
                                                                             ▼
                                                     Next.js 15 (App Router) · output: 'export'
                                                                             │
                                                                             ▼
                                                          out/  → GitHub Pages
                                                                             ▲
   Hesap/senkron/bildirim ◄── src/lib/depo/api.ts ◄── api/ (Workers + D1) ───┘
```

| Katman | Yer | Not |
|---|---|---|
| Veri üreteçleri | `tools/` | Node 22+ `node:sqlite`; bağımlılıksız |
| Üretilmiş veri | `public/data/` | Sürüm kontrolüne dahil (CI için) |
| Site | `src/app/` | Statik dışa aktarım; sunucu tarafı çalışma zamanı yok |
| Kişisel durum | `src/lib/depo/` | Tarayıcı deposu (localStorage); hesap açılırsa `depo/api.ts` yanında senkronlar |
| Hesap/bildirim API'si | `api/` | Cloudflare Workers + D1; site onsuz da tam çalışır ([docs/11](docs/11-hesaplar-uygulama.md)) |
| Belgeler | `docs/` | Faz belgeleri, günlükler, mimari kararlar (ADR) |

## Sayfalar

| Yol | Açıklama | Ön-render |
|---|---|---|
| `/` | Hero + 18 Netflix tarzı satır + arşiv istatistikleri | ✔ (1 sayfa) |
| `/kesfet/` | 6.107 yapım: tür/yıl/format/durum filtresi, 5 sıralama, ızgara/liste | ✔ |
| `/ara/?q=` | Anlık arama, vurgulama, alaka sıralaması | ✔ (istemci arama) |
| `/anime/<slug>/` | Detay: künye, özet, fragman, bölüm listesi, fansub künyesi, ilişkili yapımlar, yasal izleme | ✔ 6.107 sayfa |
| `/izle/?a=<slug>&b=<no>` | Oynatıcı: kaynak çipleri, **fansub süzgeci**, güvenilirlik sıralaması, bölüm geçişi, klavye kısayolları, **kanıta dayalı köprü şeridi** (hangi kaynağın kontrol edilebildiği cihazda ölçülür, `/kunye/` panelinde görünür) | ✔ (tek kabuk) |
| `/listem/` | İzleme listesi · izlemeye devam et · izlenen bölümler | ✔ (istemci) |
| `/fansublar/` | 363 fansub grubu dizini, grup → yapım listesi | ✔ |
| `/fansub/<slug>/` | Fansub grup profili: katkı ölçümü + kapsadığı yapımlar | ✔ 363 sayfa |
| `/seriler/` | 961 seri (franchise) grubu indeksi | ✔ |
| `/seri/<slug>/` | Bir serinin tüm yapımları, kronolojik | ✔ 961 sayfa |
| `/hesap/` | Hesap, senkron durumu, KVKK (veri indir/sil) — API'siz de çalışır | ✔ (istemci) |
| `/kunye/` | Kapsam, kaynak doğrulama politikası, player güvenilirliği, yasal bilgi | ✔ |
| `/yonetim/` | **Yönetici paneli** (noindex): tarama dilimi/saat/push ayarı, "şimdi çalıştır", koşu geçmişi + log | ✔ (istemci) |

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run veri` | SQLite + link sağlığı + AniList önbelleğinden tüm site verisini üretir |
| `npm run veri:anilist` | AniList'ten zenginleştirme çeker (`--limit N`, `--yenile`) |
| `npm run tmdb:esle` | AniList kimliği → Fribb `anime-list` veri kümesiyle TMDB kimliği eşlemesi (anahtarsız) |
| `npm run tmdb:ara` | Veri kümesinde karşılığı olmayan yapımlar için arama tabanlı eşleme; `--golge=N` yanlış eşleşme riskini ölçer |
| `npm run tmdb:zenginlestir` | Eşlenen kimliklerin backdrop yollarını çeker (TMDB anahtarı gerekir, kesintiye dayanıklı) |
| `npm run tmdb:kapsam` | Görsel kapsamı hunisi: kimlik → backdrop → 4K/HD katmanı → bandı dolu sayfa (`tools/rapor/tmdb-kapsam.json`) |
| `npm run akis:olcum` | Kaynak embed'lerinden doğrudan akış (mp4/m3u8) çıkarılabiliyor mu; `--referer` ile bizim origin'imizden oynanıp oynanmadığı (kendi oynatıcı kararının ölçümü) |
| `npm run link:tara` | Link sağlığı taraması (partili, eşzamanlı, kesintiye dayanıklı; `--bildirim` ile kullanıcı bildirileri öne alınır) |
| `npm run link:durum` | Tarama kapsamı ve dağılımı + `tools/rapor/link-tarama.md` |
| `npm run link:bildirim` | Worker'daki kullanıcı bildirimlerini yerel kuyruğa çeker (`--kuru` yazmadan gösterir) |
| `npm run link:test` | Sınıflandırıcı kurallarının canlı URL sınaması (20 örnek) |
| `npm run dongu:gunluk` | Günlük otomatik döngü: tarama dilimi → site verisi → derleme → yayın hazırlığı (`--yayinla` commit, `--push` yayın; `--deneme` plan) |
| `npm run api:test` | Çalışan API'ye 45 adımlık uçtan uca duman testi (`--api=`, `--origin=`, `--token=`, `--oran`) |
| `npm run simge:uret` | OG kartı + PWA ikonlarını üretir (`tools/simge-uret.mjs`) |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Statik dışa aktarım (`out/`) |
| `npm run typecheck` | `tsc --noEmit` |
| `python tools/onizle-sunucu.py 8031` | Derlenmiş `out/` klasörünü `/GenesisAnime` önekiyle servis eder (statik dışa aktarımda yerel önizleme) |
| `python -m http.server 8021 --directory tools` | Köprü ölçüm sayfalarını açar: `/kopru-test.html`, `/kopru-komut-test.html` |
| `npm test` | `tools/` birim + veri/çıktı bütünlüğü testleri (ağsız, bağımlılıksız; `node:test`) |
| `npm run yayin:hazirla` | `.nojekyll`, çıktı ölçümü, yayın raporu |

## Hesap ve bildirim API'si

- Yayında: `https://genesisanime-api.genesisanime.workers.dev` (Cloudflare Worker + D1, bölge WEUR).
- Uçlar: `/bildirim` (kullanıcı bildirimi, IP başına 30/gün), `/auth/kayit|giris|yenile|cikis`,
  `/me/durum` (iyimser kilitli senkron blob'u), `/me/veri` ve `/me` (KVKK). Ayrıntı ve tam tablo:
  [docs/11-hesaplar-uygulama.md](docs/11-hesaplar-uygulama.md) · kurulum/dağıtım:
  [api/README.md](api/README.md) · karar kaydı: [ADR-0008](docs/kararlar/ADR-0008-workers-parola-ve-jeton.md).
- CORS **yalnızca** sitenin kendi kaynağına (`SITE_ORIGIN`) açıktır; başka bir alan adına
  taşınırsa Worker değişkeni güncellenmelidir.
- Siteye bağlamak için derleme anında verilen değişkenler:
  `NEXT_PUBLIC_API` (hesap + senkron) ve `NEXT_PUBLIC_BILDIRIM_API` (oynatıcı bildirimi).
  Boş bırakılırsa hiçbir istek atılmaz — site hesapsız, tam çalışır.
- Akış köprüsü (temel): `/akis/coz` (embed → doğrudan akış adresi) ve `/akis/aktar` (medya
  baytları, Range korunarak). Açık proxy değildir: yalnız izin listesindeki medya host'ları ve
  yalnız imzalı adresler geçer. Ölçüm, sınırlar ve sonraki adımlar:
  [docs/12-akis-koprusu.md](docs/12-akis-koprusu.md).
- Gizlilik: ham IP hiçbir yerde tutulmaz (yalnızca tuzlu özet), parolalar PBKDF2-HMAC-SHA256 ile
  özetlenir, jetonlar D1'de SHA-256 özetli saklanır; çerez kullanılmaz.

## Yayın

`.github/workflows/yayinla.yml` her `main` push'unda derleyip GitHub Pages'e dağıtır
(`npm ci` → typecheck → build → `yayin:hazirla` → `npm test` → artefakt → deploy).
Alt dizinde yayın için `BASE_PATH` (ör. `/GenesisAnime`) ve API adresleri iş akışında verilir;
kök alan adı için `BASE_PATH` boş bırakılır. Ayrıntı, host limitleri ve ilk yayın kontrol listesi:
[docs/06-yayin-ve-deploy.md](docs/06-yayin-ve-deploy.md).

## Katkı

Katkıya açıktır — **issue** açabilir, veri düzeltmesi, fansub eklemesi veya kod gönderebilirsin.

1. Depoyu **fork**'la ve kendi fork'unda bir **branch** aç (`main` korumalı; doğrudan push yerine
   **pull request** aç).
2. Pull request'i göndermeden önce bu kontrolleri çalıştır — CI'da da aynıları koşar:
   `npm run typecheck` → `npm test` (186/186) → `npm run build` → `npm run yayin:hazirla`.
3. API'ye dokunduysan ayrıca `cd api && npm run dev` + ikinci terminalde `npm run api:test`.
4. Davranış/karar değişikliği belge gerektirir: ilgili `docs/` dosyası, gerekiyorsa yeni bir ADR
   ([docs/kararlar](docs/kararlar/)) ve `docs/gunluk/kayit.jsonl` satırı.

Veri hattı kuralları: ölü/engelli kaynak yayına sızmaz, "çalışıyor" rozeti yalnızca HTTP kanıtı
varsa basılır, belirsiz kaynaklar gizlenmez. Bu kurallar testlerle korunur; kanıtsız rozet ekleyen
değişiklikler CI'da kırmızıya döner.

## Gizlilik (KVKK)

Sitede reklam, izleyici betiği ve çerez yoktur. Kişisel veriler yalnızca tarayıcı deposunda tutulur;
hesap açılırsa cihazlar arası eşitleme için sunucuya taşınır. Ham IP saklanmaz (bildirim
oranlarında tuzlu özet kullanılır). Kullanıcı `/hesap/` üzerinden verisini JSON olarak
indirebilir veya hesabını ve sunucudaki kopyasını geri döndürülemez biçimde silebilir.

## Belgeler

- [docs/00-genel-bakis.md](docs/00-genel-bakis.md) — proje özeti ve kapsam
- [docs/01-mimari.md](docs/01-mimari.md) — teknik mimari
- [docs/02-veri-pipeline.md](docs/02-veri-pipeline.md) — veri hattı ve ölçümler
- [docs/03-tasarim-sistemi.md](docs/03-tasarim-sistemi.md) — tasarım dili ve bileşenler
- [docs/04-oynatici-ve-kaynaklar.md](docs/04-oynatici-ve-kaynaklar.md) — oynatıcı ve kaynak politikası
- [docs/05-kalite-ve-testler.md](docs/05-kalite-ve-testler.md) — test kaydı ve bulunan hatalar (H-1…H-25)
- [docs/06-yayin-ve-deploy.md](docs/06-yayin-ve-deploy.md) — yayın, API dağıtımı, host limitleri
- [docs/07-hesaplar-ve-api.md](docs/07-hesaplar-ve-api.md) — hesap/API tasarım taslağı
- [docs/08-topluluk.md](docs/08-topluluk.md) — topluluk fazı taslağı
- [docs/09-link-sagligi-otomasyonu.md](docs/09-link-sagligi-otomasyonu.md) — link tarama sistemi
- [docs/10-yol-haritasi.md](docs/10-yol-haritasi.md) — fazlar ve sıradaki işler
- [docs/11-hesaplar-uygulama.md](docs/11-hesaplar-uygulama.md) — hesaplar, senkron, bildirim hattı
- [docs/12-akis-koprusu.md](docs/12-akis-koprusu.md) — kendi `<video>` oynatıcısının temeli: akış çözümleyici + aktarım ucu
- [docs/13-openani-oynatici-analizi.md](docs/13-openani-oynatici-analizi.md) — rakip oynatıcı analizi: kanıtlar, lisanslar, alınabilir/alınamaz ayrımı
- [docs/gunluk/](docs/gunluk/) — kronolojik çalışma günlüğü
- [docs/kararlar/](docs/kararlar/) — mimari karar kayıtları (ADR)
- [AGENTS.md](AGENTS.md) — çalışma kuralları ve kalite kontrolleri

## Yasal uyarı

Bu proje hiçbir video barındırmaz, yüklemez ve aktarmaz. Yalnızca üçüncü taraf video
platformlarında o sırada kamuya açık olan gömülü sayfalara bağlantı verilir. Tüm içerik hakları
ilgili hak sahiplerine aittir; hak sahibi talebi üzerine bağlantılar kaldırılır. Arşiv verisi
kültürel arşivleme amacıyla derlenmiştir.

## Lisans

Kod [MIT](LICENSE) lisansı altındadır. Arşiv verisine ilişkin haklar ilgili hak sahiplerine aittir.
