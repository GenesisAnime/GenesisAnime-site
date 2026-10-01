# Günlük · 2026-10-01 · Faz 5/8 — Paketleme turu (A/D) + hesaplar ve bildirim hattı (B/C)

## 1. İstenen

> “Onaylanan 4 turlu planı uygula: Tur 1 A (OG kartı + PWA + hero fragmanı + cila), Tur 2 D
> (seri/fansub sayfaları + rastgele bölüm), Tur 3 B (bildirim hattı: Cloudflare Workers + D1),
> Tur 4+ C (hesaplar + senkron, `/hesap` + KVKK). Her tur sonunda kapı: `npm test` → typecheck →
> build → `yayin:hazirla` + AGENTS §3 belgeleri.”

## 2. Tur 1 A — paketleme ve cila

| İş | Dosya | Sonuç |
|---|---|---|
| OG kartı + PWA ikonları | `tools/simge-uret.mjs`, `public/og.png`, `public/ikon/*`, `public/favicon.svg` | Bağımlılıksız PNG üreteci (zlib + CRC32); `npm run simge:uret`; `og.png` 1200×630, ikonlar 192/512/maskable/apple |
| PWA | `src/app/manifest.ts`, `public/sw.js`, `src/components/ServisCalisani.tsx` | `genesisanime-v1`; statik + `/data` cache-first, HTML network-first, `/data` sınırı 90; kayıt yalnızca üretimde ve localhost dışında |
| Meta | `src/app/layout.tsx` | `TABAN` (BASE_PATH) ön ekli OG/ikon yolları, `appleWebApp` |
| Hero fragmanı | `src/components/FragmanKatmani.tsx`, `Hero.tsx`, `.katman` CSS | Tıkla-yükle `youtube-nocookie`, Escape/arka plan/✕ kapatır, gövde kilidi |
| Rastgele bölüm | `src/components/RastgeleDugme.tsx` | Havuzdan rastgele bölüm → `/izle/?a=&b=` |
| 404 zenginleştirme | `src/app/not-found.tsx` | En iyi 6 kart + rastgele havuz (400) + `/seriler/` |

Doğrulama: hero'da iki düğme canlı; fragman `youtube-nocookie` iframe'i açtı, Escape kapattı,
gövde kilidi çözüldü; rastgele düğme `/izle/?a=kusuriya-no-hitorigoto&b=14` açtı; `data-hata` null.

## 3. Tur 2 D — seri ve fansub sayfaları

- **Veri:** `tools/export-data.mjs` içine union-find tabanlı seri (franchise) grupları eklendi.
  İlişki kümesi SEQUEL/PREQUEL/SIDE_STORY/SPIN_OFF/ALTERNATIVE/PARENT/SUMMARY; `KROS_AD = /\bvs\.?\b/i`
  kuralıyla “vs” başlıklı çapraz yapımlar köprüdür sayılmaz (yoksa Lupin III + Detective Conan tüm
  ağı birleştiriyordu). Kök = adı en çok üyenin öneki olan yapım. Ölçüm: **961 grup / 3.244 yapım**
  (One Piece 42, Dragon Ball 40, Naruto 19, Lupin III 18).
- **Fansub slug'ları:** `araAnahtari` + tire (`TAÇE` → `tace`); 363 grup; `taksonomi.fansublar` ve
  `fansublar.json` artık `s` taşıyor.
- **Sayfalar:** `/seriler/` (tablo indeks), `/seri/<slug>/` (kronolojik ızgara), `/fansub/<slug>/`
  (katkı + katalog), anime detayında “Serinin tamamı” bölümü ve `/fansub/...` çipleri, sitemap'e
  iki yeni sayfa türü.
- **Testler:** `veri.test.mjs`'e seri grubu ve fansub bütünlüğü denetimleri (simetri: `anime.seri`
  ↔ grup üyeliği; kaynaklardaki her fansub adı dizinde var).

## 4. Tur 3 B — bildirim hattı (Worker + D1)

- `api/package.json`, `api/wrangler.toml`, `api/migrations/0001.sql` (kullanici · oturum · durum ·
  bildirim · oran), `api/src/index.mjs` (tek dosya, bağımlılıksız Worker: şema doğrulama, CORS,
  IP tuzlama, oran sınırı, PBKDF2, senkron blob'u, KVKK, admin kuyruğu).
- `tools/bildirim-cek.mjs` + `npm run link:bildirim`: geçersiz/yaşlı/tekrar süzgeçleri; çevrimdışı
  içe aktarma (`--dosya`) ve `--kuru` raporu.
- `tools/link-tara.mjs --bildirim`: bildirilen URL'ler tazelik denetimini atlar ve kuyruğun önüne
  alınır — **karar değil öncelik** (AGENTS §1.4b).
- `src/lib/bildirim.ts`: yerel-önce kuyruk; API kapalıysa no-op; ağ hatasında kuyruk korunur,
  `online` olayında yeniden denenir. `IzleIstemci` “Kaynak çalışmıyor” düğmesine bağlandı.

## 5. Tur 4+ C — hesaplar, senkron, KVKK

- `src/lib/depo/durum-birlestir.mjs` (+ `.d.mts`): saf birleştirme mantığı — ilerleme/izlenen/liste
  “en yeni kazanır”, tercihlerde yerel kazanır, çalışmayanlar birleşim (500 sınırı).
- `src/lib/depo/api.ts`: oturum deposu, `/auth/*`, `/me/durum` iyimser kilit, 401'de tek yenileme
  denemesi, `senkronDongusu()` (3 sn gecikmeli itme + `online`/görünürlük tetikleri), KVKK paketi.
- `src/app/hesap/page.tsx` + `HesapIstemci.tsx` + `HesapSenkron.tsx` + `.hesap-*` CSS: API kapalıysa
  bilgilendirme paneli, açıksa giriş/kayıt + senkron durumu + “Verilerimi indir” + “Hesabımı sil” /
  “Bu cihazdaki verileri temizle”.
- Karar: **PBKDF2-HMAC-SHA256 + opak taşıyıcı jeton**, D1'de yalnızca özetler; çerez yok →
  [ADR-0008](../kararlar/ADR-0008-workers-parola-ve-jeton.md). Uygulama notu: `docs/11`.

## 6. Bulunan hatalar (bu tur)

- **H-15:** Worker'daki slug deseni 80 karakterle sınırlıydı; arşivde en uzun slug 144 karakter.
  `veri.test.mjs`'in yeni seri denetimi ilk koşuda kırmızıya döndü; sınır üç yerde 200'e çekildi.
- **H-16:** `kunye.seriGrubu` üretildi ama `/kunye/` sayfasında kartı yoktu → eklendi.
- **H-17:** `NEXT_PUBLIC_API` boşken hesap sayfası işlemeyen giriş formu gösteriyordu → panel ile
  değiştirildi.

## 7. Kapı ölçümleri

| Kapı | Sonuç |
|---|---|
| `npm test` | **69/69** (tarama 32 · veri 8 · çıktı 7 · bildirim 15 · hesap 7), ~6,7 sn, ağsız |
| `npm run typecheck` | 0 hata |
| `npm run build` | ✓ 7.446 statik sayfa (6.107 anime + 961 seri + 363 fansub + kabuklar) |
| `npm run yayin:hazirla` | **21.043 dosya / 858,1 MB**; GitHub Pages uygun (1 GB); **CF Pages 20k sınırını aşıyor** (bilinçli: asıl hedef GitHub Pages, `docs/06`) |
| Tarayıcı doğrulaması | `/seriler/` (961), `/seri/one-piece/` (42 kart), `/anime/naruto/` (seri + 8 fansub çipi), `/fansub/varsayilan/` (1.943 yapım), `/hesap/` (API kapalı paneli), manifest/sw/og 200; `data-hata` null |

## 8. Kalan işler

- **Deploy:** Cloudflare hesabı + `wrangler d1 create` + secret'lar; ardından `NEXT_PUBLIC_API` ve
  `NEXT_PUBLIC_BILDIRIM_API` ile derleme. Kod ve yerel testler tamam.
- Bildirim hattının ilk gerçek koşusu: API yayına alındıktan sonra `npm run link:bildirim`.
- GitHub Pages 1 GB sınırı için boyut küçültme turu (bölüm listelerini istemciye taşımak) —
  `docs/06`'da not edildi.

## 9. Ek tur — API uçtan uca test (wrangler dev + yerel D1)

İstek: “wrangler dev + yerel D1 ile bildirim, kayıt/giriş ve senkron akışını uçtan uca test et;
bulunan sorunları düzelt.”

- **Kurulum:** `api/` içinde `npm install`; wrangler **^3.90 → ^4.145** (3.114 uyumluluk tarihini
  2025-07-18'e düşürüyordu, 4.145 tarihi aynen destekliyor). `npm run db:yerel` ile şema yerel D1'e
  uygulandı; sırlar `.dev.vars` ile verildi (JWT_SECRET/ADMIN_TOKEN/IP_TUZ). Yerel port **8789**
  seçildi çünkü 8787/8788/8790 bu makinede başka süreçlerce kullanılıyor. `.gitignore`'a
  `.wrangler/` ve `.dev.vars` eklendi.
- **Yeni araç:** `tools/api-uctan-uca.mjs` + `npm run api:test` — çalışan API'ye gerçek isteklerle
  45 adımlık duman testi (CORS, bildirim + yönetici kuyruğu, oran sınırı `--oran`, kayıt/giriş,
  senkron + 409, 413, yenileme rotasyonu, çıkış, KVKK indir/sil). Yerel D1'de 45/45 geçti.
- **Bulunan hatalar:** **H-18** (kritik): workerd, işçinin giriş modülünden sabit dışa aktarımını
  reddediyor — `wrangler dev` “The Workers runtime failed to start” ile düşüyordu ve deploy'da da
  aynı hatayla açılmazdı. Tüm sabit/yardımcı katman `api/src/yardimci.mjs`'e taşındı; giriş artık
  yalnızca `fetch` dışa aktarıyor. **H-19:** 64 KB genel gövde sınırı, `/me/durum`'daki 512 KB blob
  denetimini gölgeliyordu (413 yolu ölü koddu, büyük paketler kaydedilemiyordu); sınır
  parametreleşti, blob ölçüsü UTF-8 baytına geçti.
- **Tarayıcıyla uçtan uca (Next dev + `NEXT_PUBLIC_API`/`NEXT_PUBLIC_BILDIRIM_API`):** UI'dan kayıt
  → oynatıcıda “İzledim” + “Kaynak çalışmıyor” → veri sunucuya eşitlendi (`surum` 4; ilerleme,
  tercih, çalışmayan listesi tam); oran kontenjanı doluyken POST 429 aldı ve bildirim istemci
  kuyruğunda kaldı, `online` olayında yeniden deneyip kuyruğa düştü (`id 32`, `my.mail.ru`,
  naruto/1); `link:bildirim` JSONL'e yazdı, ikinci koşu `tekrar: 1`; KVKK hesap silme sonrası
  giriş 401 ve D1'de kullanıcı/durum/oturum 0. Not: tıklama testi sırasında sabit mobil alt menü
  (z-index 60) kısa viewport'ta düğmeyi kapatıyor; `.alt` 96px alt dolgu sayesinde içerik
  kaydırılarak erişilebiliyor — ürün hatası değil, test penceresi masaüstüne alındı.
- **Ölçüm:** `npm test` **72/72** (bildirim 15 → 18: giriş modülü sözleşmesi, blob sınır ilişkisi,
  UTF-8 bayt sayımı); e2e 45/45 (+`--oran` koşusunda 429 doğrulandı, 28 satır `gecersiz`
  işaretlendi). Site kodu ve `out/` değişmedi (derleme etkilenmez).

## 10. Ek tur — gerçek dağıtım (Cloudflare Workers + D1)

İstek: “API'yi gerçek Cloudflare hesabına deploy et (D1 oluştur, secret'ları gir, site
 değişkenleriyle derle) ve uzak adrese karşı `npm run api:test` ile doğrula.”

- **Hesap engelleri (yeni hesapta tipik):** `wrangler login` OAuth ile açıldı (egecakar@nutaliaxd.info);
  `secret put` önce `code: 10034` (e-posta doğrulanmadı) ile düştü, doğrulama sonrası Worker
  oluşturuldu; `deploy` ise workers.dev alt alan adı kayıtlı olmadığı için durdu — panelden/API'den
  (`PUT /accounts/<id>/workers/subdomain`) `genesisanime` kaydedildi.
- **Dağıtım:** D1 `genesisanime` (`abde0636-74dd-4d0e-b9c6-12704d3b1f10`, WEUR) + şema; secret'lar
  `JWT_SECRET`, `ADMIN_TOKEN`, `IP_TUZ` (rastgele üretildi); Worker
  <https://genesisanime-api.genesisanime.workers.dev> adresinde yayında; `wrangler.toml`'daki
  `database_id` gerçek kimlikle değiştirildi.
- **H-20 (kritik, yalnızca üretimde göründü):** ilk uzak e2e koşusunda kayıt/giriş 500 döndü;
  `wrangler tail` nedeni verdi: `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are
  not supported (requested 210000)`. Yerel `wrangler dev` bu sınırı uygulamadığı için bütün yerel
  testler geçmişti. `PBKDF2_TUR` platform tavanına (100.000) çekildi; tavandan yüksek kayıtlı
  özetlerde doğrulama hata fırlatmak yerine reddeder; iki regresyon testi eklendi (74/74).
- **Uzak doğrulama:** `GENESIS_API_URL=… npm run api:test -- --origin=https://nutaliaxd.github.io`
  → **45/45** (tek atlanan: isteğe bağlı `--oran`). Kayıt isteği ölçümü: `cpuTime 28 ms`,
  `wallTime 265 ms`, `outcome ok` — bu değer ücretsiz planın 10 ms bütçesini aştığı için hesap
  Workers Paid tarafında görünüyor (panelden teyit edilmeli).
- **Site derlemesi:** `NEXT_PUBLIC_API` + `NEXT_PUBLIC_BILDIRIM_API` ile `npm run build` +
  `npm run yayin:hazirla` → 21.043 dosya / 858,1 MB; adres iki istemci parçasına gömüldü.
- **Tarayıcı doğrulaması (uzak API'ye karşı):** geçici `CORS_EXTRA` ile `out/` :8000'de sunuldu:
  kayıt → “Eşitlendi” (uzak D1'de `surum` 7, `izlenen: {"naruto|1": …}`); oynatıcıdan “Kaynak
  çalışmıyor” → yönetici kuyruğunda `id 3 · my.mail.ru · naruto/1`; ardından hesap KVKK ile silindi
  (`silindi:true`) ve test bildirimi `gecersiz` işaretlendi. Geçici izin kaldırılıp yeniden deploy
  edildi; `OPTIONS` artık localhost kaynağına `ACAO` vermiyor (ilk kontrol uç önbelleği yüzünden
  yanıltıcıydı — sorgu dizesiyle doğrulandı).
- **Not (yerel ortam):** makinenin birincil DNS sunucuları (Cloudflare IPv6) yanıt vermiyor; ilk
  uzak istek bu yüzden `fetch failed` ile düştü, üçüncül sunucu (1.1.1.1) ile çözülüyor. API ile
  ilgisi yok.
- **Kapı:** `npm test` 74/74 · typecheck 0 · build 7.446 sayfa · `yayin:hazirla` 21.043/858,1 MB ·
  uzak `api:test` 45/45. Kalan tek adım: derlenmiş `out/`'u GitHub Pages'e push (kullanıcı kararı).

## 11. Yayın hazırlığı — iş akışı, README, Hakkında ve ilk commit

İstek: “Yayın iş akışına `NEXT_PUBLIC_API` ve `NEXT_PUBLIC_BILDIRIM_API` değişkenlerini ekle ve ilk
push için depoyu hazırla (commit at, remote talimatını göster); push atmadan bırak. README ve
Hakkında kısmını da yaz; README aktif olarak güncellenecek, proje %100 açık kaynak.”

- **Kritik eksik:** `yayinla.yml` yalnızca `BASE_PATH` + `NEXT_PUBLIC_SITE_URL` veriyordu; API
  adresleri derlemeye girmeyince yayına giden site **hesapsız** olurdu (sessiz kayıp). İki değişken
  build adımına eklendi (istemciye derleme anında gömülür; CORS kaynağı Worker'da eşleşmelidir).
- **README yeniden yazıldı:** açık kaynak vurgusu (kapalı bileşen yok, reklam/izleyici betiği yok,
  MIT), **yaşayan “Proje durumu” tablosu** (ölçümler + sıradaki işler + son güncelleme), API bölümü
  (canlı adres, CORS, KVKK), katkı rehberi (kapı adımları) ve belge dizini. Ayrıca `LICENSE` (MIT)
  eklendi — README zaten MIT diyordu ama dosya yoktu.
- **GitHub “Hakkında”:** açıklama yazıldı (mevcut açıklamadaki “kaynlık” yazım hatası düzeltildi),
  site bağlantısı ve 12 etiket eklendi (`gh repo edit`).
- **Depo hazırlığı:** `origin` bağlandı, ilk commit atıldı — `783dca6`, 6.236 dosya / 229.221 satır
  (`out/` ve `.next/` gitignore'da; `tools/cache/link-durum.jsonl` 49,9 MB kanıt kaydı olarak
  izleniyor). Commit öncesi gizli değer taraması: `ADMIN_TOKEN`/`JWT_SECRET`/`IP_TUZ` değerleri
  sahnelenen hiçbir dosyada yok (0 eşleşme); `.dev.vars` ve `.wrangler/` ignore'da.
- **Push yapılmadı** (kullanıcı istemedi). Sıradaki adımlar: `git push -u origin main` + GitHub'da
  Settings → Pages → Source: **GitHub Actions**; ardından Actions koşusu ve yayın duman testi.
- **Not:** `AGENTS.md` §3'e README'nin yaşayan belge kuralı, §5'e depo/origin bilgisi eklendi.
- **Ölçüm:** `npm test` 74/74 · `yayinla.yml` YAML olarak ayrıştırıldı ve build adımında dört ortam
  değişkeni doğrulandı · commit 6.236 dosya / 229.221 satır (~55 MB).

## 12. Detaylı kod taraması — push öncesi genel bugfix

İstek: “Push yapmadan veya push yaptıktan sonra genel bir bugfix için güncel durumu kontrol et,
kodlarını elden geçir.” Kapsam bilinçli olarak **detaylı** seçildi: yalnızca gözle bakmak değil,
riskli desen araması + CI ile aynı `BASE_PATH` derlemesi üzerinde tarayıcı gezintisi + hata yolu
denemeleri + negatif kontrollü regresyon testleri.

- **Riskli desenlar (temiz):** `innerHTML`/`eval`/`new Function`/`document.write` 0 · `console.*` 0 ·
  `any` 0 · TODO/FIXME 0 · 5 `target="_blank"` bağlantısının hepsinde `rel="noreferrer noopener"`.
- **H-21 (oran sınırı yarışı):** `oranAsildi` SELECT+UPDATE iken eşzamanlı istekler sayacı
  atlatıyordu; atomik koşullu artırmaya çevrildi (`UPDATE … WHERE anahtar=? AND pencere=? AND sayi<?`,
  `meta.changes === 0` → sınır aşıldı). 10 paralel istekli regresyon testi eklendi; eski kod izole
  edilip aynı yük verildiğinde engellenen = 0 çıktı (negatif kontrol: test eski kodu yakalıyor).
- **H-22 (konsol uyarısı):** üç iframe `allow` + `allowFullScreen` birlikte kullandığı için tarayıcı
  `Allow attribute will take precedence over 'allowfullscreen'` uyarısını basıyordu; `fullscreen`
  izin listesine eklendi, eski öznitelik kaldırıldı. Tam ekran yetkisi `featurePolicy` ile
  doğrulandı (`allowsFeature('fullscreen') === true`) ve yeni derlemede konsol **tamamen sessiz**.
- **H-23 (saat dilimi):** altbilgi/künye damgası yerel saat dilimine bağlıydı (CI UTC, yerel UTC+3 →
  farklı HTML). `damgaBicim` ile UTC'ye sabitlendi ve çıktıya `(UTC)` eklendi; üç saat diliminde
  ayrı süreçlerde aynı metni ürettiği test edildi.
- **H-24 (JSON-LD):** kaçışsız `JSON.stringify` yerine `jsonLdGuvenli` (`<` → `\u003c`); bugünkü
  veride istismar edilecek dizi yok, bu yüzden olgu değil latent risk olarak kayda geçti.
- **H-25 (ana sayfa canonical):** eksik olan `canonical` eklendi (diğer 7.436 sayfada vardı).
- **Temiz çıkanlar:** arama sonucuna XSS payload'ı metin olarak basıldı (`window.__xss` çalışmadı) ·
  CORS engeli hesap sayfasında nazik mesaja dönüşüyor · mobil 390×844'te yatay taşma yok · servis
  çalışanı localhost'ta bilinçli atlanıyor, elle kaydedilince `sw.js` `/GenesisAnime/` önekiyle
  çalışıyor · `out/404.html` öneriler + rastgele bölüm içeriyor · `robots` ara/izle/listem/404
  `noindex`.
- **Oran düzeltmesi üretime alındı:** Worker yeniden dağıtıldı
  (`0f462b64-7238-4649-b4e6-67c74595e387`, önceki `19dd8c07`), uzak uçtan uca **46/46** —
  `--oran` ile üretimde gerçekten 429 `cok-fazla-istek` görüldü (atomik karar gerçek D1'de de çalışıyor).
- **Kapı:** `npm run typecheck` 0 hata · `npm test` **81/81** · derleme 7.442 sayfa ·
  `npm run yayin:hazirla` 21.043 dosya / 865,2 MB (GitHub Pages uyumlu) · uzak `api:test`
  **46/46** (1 atlandı → `--oran` ile 0 atlandı).
- **Kullanıcı geri bildirimi (README dili):** katkı bölümündeki çeviri jargonu ("depoyu çatallayın,
  dal açın", "kapıyı çalıştırın") GitHub'da herkesin bildiği terimlerle değiştirildi: **fork**,
  **branch**, **pull request**, **issue**, "kontroller". Aynı sadeleştirme `AGENTS.md` §4 ve
  `docs/05` başlıklarına da uygulandı ("Doğrulama kapısı" → "Kontroller (CI ile aynı komutlar)"),
  böylece README'den içeriye giden yol tek bir sözlük kullanıyor.
- **Bekleyen:** push + GitHub Pages kaynağı (kullanıcıda); bildirim kuyruğu kalıcı 429/CORS'ta
  yalnızca tıklama/`online` olayında deniyor (kalıcı hatada kullanıcıya dürüst bir durum metni
  gösterilebilir); `tools/cache/link-durum.jsonl` 49,9 MB büyüdü (parçalama/sıkıştırma adayı).

## 13. Mobil düzen, fansub süzgeci ve otomatik döngü

İstek: “Mobil kısmını düzenle; kaynak listesi çok uzuyor, insanlar düğmeyle istediği fansubu
seçsin; bu kaynak sistemini arkada canlı tutan otomatik bir şey yap (veya yaptın mı?); bir de
siteye Google Analytics eklemek istiyorum, o yüzden GitHub Pages yapmayalım.”

- **Mobil — anime detay sayfası (H-26):** ≤860px'te poster 130px'lik bir sütuna sıkışıyor ve eylem
düğmeleri (0. bölüm / listeme ekle) rozetlerin üstüne taşıyordu. ≤700px için yeni kırılım: tek
kolon, poster 168px ortada, düğmeler tam genişlik 44px. Ölçüm: 390×844'te taşan düğme 0,
`scrollWidth 373 < 390`.
- **Mobil — oynatıcı:** eylem düğmeleri iki sütunlu ızgaraya alındı (42px), kaynak çipleri dağınık
sarmak yerine hizalı ızgaraya oturdu ve uzun fansub adları kırpılmak yerine iki satıra sarıyor;
süzgeç paneli kaydırırken üstte yapışık kalıyor.
- **Fansub süzgeci (yeni özellik):** kaynak panelinin başında **o bölümdeki** fansub grupları
 düğme olarak listeleniyor (ad + kaynak sayısı). Tıklayınca liste süzülüyor, başlık `(6 / 17)` oluyor,
 `1-9` kısayolları görünen listeye göre çalışıyor. Seçim kalıcı (`tercihler.fansubSuzgeci`) ve hesap
 açıksa cihazlar arası eşitleniyor. Seçilen gruplardan hiçbiri o bölümde yoksa süzgeç uygulanmaz —
 "Seçtiğin N fansub bu bölümde yok; tüm kaynaklar listeleniyor." notu çıkar. Künyesiz ~64 bin kaynak
 tek düğmede (`Künyesiz`) toplanıyor. Doğrulama: 17 kaynaklı bir bölümde `YuushaSubs-BD` seçildi →
 6 kaynak, 4 player grubu, iframe ilk doğrulanmış kaynağa geçti; sayfa yenilendiğinde seçim korundu;
 YuushaSubs'un olmadığı bölümde not görünüp tüm kaynaklar listelendi.
- **Otomatik döngü (yeni araç):** `npm run dongu:gunluk` (`tools/gunluk-dongu.mjs`) — bildirimleri
 öne alan tarama dilimi → `veri` → `build` → `yayin:hazirla` → (istenirse) commit/push. Her koşu
 `tools/rapor/gunluk-dongu.jsonl` ve `docs/gunluk/kayit.jsonl`'e süre + kapsam satırı yazıyor.
 **Kısıt dürüstçe belgelendi:** `npm run veri` arşiv SQLite'ını okuduğu için GitHub Actions bu adımı
 koşamaz (CI yalnızca derler + test eder); bu yüzden döngü arşivin bulunduğu makinede zamanlayıcıya
 bağlanır (Windows `schtasks` / cron komutları `docs/09` §10'da).- **Analytics ve dağıtım kararı kullanıcıya bırakıldı:** GitHub Pages statik bir analitik betiğini engellemez (GA/Plausible/Cloudflare Web Analytics hepsi çalışır); karar verildiğinde KVKK metni ve README'deki "izleyici betiği yok" iddiası da güncellenmeli.

## 14. Döngüyü zamanlayıcıya bağlama ve yönetim paneli

İstek: “Günlük link tarama döngüsünü zamanlayıcıya bağla ve bir gece boyunca çalıştığını doğrula.
Bunu panelden ayarlarını yapabileceğim, loglarına ulaşabileceğim bir yer olsun — adminlerin.”

Tasarım kararı tek cümleyle: **politika ve kayıt D1'de, iş yerel makinede.** Job'un yerelde kalması
zorunlu (`npm run veri` arşiv SQLite'ını okur, o dosya depoda yok → ADR-0004), ama ayarı
uzaktan yönetmek ve geçmişi görmek için işin kendisinin sunucuda olması gerekmiyor.

- **D1 (`api/migrations/0002-tarama.sql`, uzakta uygulandı):** `tarama_ayar` (tek satır: `aktif`,
  `dilim`, `saat`, `yayinla`, `push`, `hemen`, `guncelleme`), `tarama_kosu` (koşu geçmişi, 500
  satırla sınırlı) ve `tarama_kalp` (makine kalp atışı: makine adı, sürüm, son karar).
- **Worker'a beş yönetici ucu** (hepsi `ADMIN_TOKEN`): `GET/PUT /tarama/ayar`,
  `GET /tarama/durum` (ayar + 50 koşu + 5 kalp + sunucu zamanı), `POST /tarama/kosu`,
  `POST /tarama/kalp`. Normalizasyon (`taramaAyarNormalize`, `taramaKosuNormalize`) ve dilim
  sınırları (`TARAMA_DILIM_EN_AZ=25`, `EN_COK=20000`) `yardimci.mjs`'e, işleyiciler `index.mjs`'e
eklendi. Yanlış dalda olan bir isteğin sessizce geçmemesi için yetkisiz istek 401, bilinmeyen yol 404
  dönüyor — ikisi de canlı doğrulandı.
- **Panel `/yonetim/`** (noindex, `robots.ts` ile dizine kapatıldı): jeton girişi (`localStorage`,
  hiçbir yere gönderilmez), kalp atışı kutusu ("son kalp: Natale · 3 dk önce · karar: kosu-ok"),
  özet tablosu, ayar formu ve **“Şimdi çalıştır”** (D1'de `hemen=1` yazar; yerel döngü bir sonraki
  uyanışında koşar ve bayrağı koşu sonunda kendisi temizler), koşu geçmişi (satır açılınca adım
  süreleri + tarama log kuyruğu).
- **Zamanlayıcı:** Windows görevi `GenesisAnime gunluk dongu`, **saatte bir** (`/SC HOURLY /MO 1`),
  `tools\dongu.cmd` → `node tools/gunluk-dongu.mjs`. "Günde bir" kararını döngü verir
  (`tools/lib/dongu.mjs`, saf ve test edilebilir), böylece makine gece kapalıysa koşu kaçmaz —
  gün içinde açıldığı ilk saatte yapılır.
- **İki tuzak yaşandı ve belgelendi:** (1) jeton `api/.dev.vars`'tan okununca üretimde `yetkisiz`
  döndü — `.dev.vars` yerel `wrangler dev` içindir, üretimdeki `ADMIN_TOKEN` ile aynı değildir;
  çözüm kök `.env` (gitignore'lu). (2) `npm run build` doğru derleme değişkenleri olmadan
  koşunca döngünün ürettiği site **API'siz** derlendi ve panel "API kapalı" gösterdi; döngü artık
  `NEXT_PUBLIC_API` / `BASE_PATH` eksikse log'a ve panel kaydına UYARI yazıyor.
- **Uçtan uca doğrulama (elle tetikleme, 01.10.2026):** `schtasks /Run` → 250 kaynak tarandı →
  `veri` (10 sn) → `build` (84 sn) → `yayin:hazirla` (2 sn) → koşu **`ok`, 112 sn**; kapsam
  `ok 173.030 · ölü 301 · engelli 34 · belirsiz 12.861`. Panelde koşu kaydı ve kalp atışı göründü;
  `hemen` bayrağı koşu sonunda 0'landı. Görev durumu `Ready`, sonraki uyanış saatlik.
- **Zamanlayıcının kendi zamanlamasıyla sınaması:** elle `/Run` yerine gerçek zamanlama yolunu
görmek için bir kerelik bir sınama görevi kuruldu (18:11) ve koşudan sonra silindi. Görev
kendiliğinden açıldı: log `[18:11:01] dongu basladi` → `panel: dilim 1500 · saat 4 · açık` →
`karar: bugün zaten koştu` → `iş yapılmadı (bugun-kostu)`; panelde kalp atışı 18:11:02'ye ilerledi
(`son_karar: bugun-kostu`). Yani uyandırma + panel okuma + karar + kalp atışı zinciri insan eli
değmeden koşuyor; tam bir iş koşusu (veri + derleme) zaten yukarıda uçtan uca doğrulanmıştı.
- **Yerel panel önizlemesi ve geçici CORS (sonra geri alındı):** paneli canlı görmek için `out/`
  öneksiz derlenip bir junction üzerinden `python -m http.server 8010` ile sunuldu (sunucu `out/`u
  tutarken döngünün derlemesi `EBUSY` ile düşmesin diye). Worker'a `--var
  CORS_EXTRA:http://127.0.0.1:8010` ile **geçici** izin verildi (sürüm `a7e99689`), deneme bitince
  izinsiz yeniden dağıtıldı (`7400d597`). Doğrulama (`GET` ve `OPTIONS`, jetonlu): `Origin:
  http://127.0.0.1:8010` → `Access-Control-Allow-Origin` **yok**; `Origin: https://nutaliaxd.github.io`
  → **var**; `Vary: Origin` iki durumda da duruyor. Üretim yeniden yalnızca site kaynağına açık.
- **Testler:** yeni `tools/testler/dongu.test.mjs` (8: gün anahtarı, kapalı, saat, günde bir, hata
  sonrası bekleme, `hemen`/`--zorla`, ayarsız güvenli davranış, karar metni) + `bildirim.test.mjs`'e
  yönetici uçlarının yol çözümü ve ayar/koşu normalizasyonu (3) → toplam **92/92**; `tsc` 0 hata.
- **Derlemenin `out/` kilidine dayanıklılığı (H-27):** gecelik koşuyu tek satırda düşüren
  `EBUSY: rmdir 'out'` tuzağı kapatıldı: derlemeden önce `out/` sökümü 5 sn arayla 6 kez denenir,
  derleme yine kilit hatasıyla düşerse 15/45 sn beklenerek en çok 3 denemeye çıkılır; kilit dışı
  hatalar (tip hatası, eksik modül) **tekrar edilmez** ve kilit sürerse koşu panel notuna nedeni +
  çözüm önerisi yazılarak `hata` damgalanır. Mantık `tools/lib/derleme.mjs` içinde saf tutuldu
  (14 test; sahte `fs` + sahte `bekle`, gerçek dosya ve saat yok) ve `--deneme` kipinin hiçbir şeye
  dokunmadığı korundu (söküm dry-run'da atlanır). **Gerçek kilit ölçümü:** projenin kendi `out/`u
  (açık önizleme onu sunuyor) riske atılmadan, aynı düzeni taklit eden geçici bir klasörde
  (`%TEMP%/ga-kilit-sinama/out`) çalışma dizini o klasör olan ayrı bir Node süreciyle kilit kuruldu;
  kilit sürerken söküm 3 denemede `ok:false`/`kilit:true`,
  kilit kalkınca 6. denemede `ok:true` ve klasör gerçekten silindi (≈6 sn). Windows bu senaryoda
  `EBUSY` değil **`EPERM, Permission denied`** verdi — algılama bu yüzden tek koda değil kilit sınıfına
  bakıyor. Yeni toplam: **106/106**.
- **Kalan:** döngünün birkaç günlük doğal gözlemi (zamanlayıcı kurulu ve elle koşuyor; "gece
  boyunca" iddiası ancak birkaç ardıl koşudan sonra kanıtlanır), yayın boyutunu küçültme ve
  analytics/dağıtım kararı (kullanıcıda).

