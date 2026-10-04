# 10 · Yol Haritası

> Son güncelleme: 2026-10-04

## Tamamlanan fazlar

| Faz | İçerik | Durum | Belge |
|---|---|---|---|
| 0 | İskelet, belgeleme düzeni, ADR kültürü | ✅ | [günlük](gunluk/2026-09-30-faz0-iskelet.md) |
| 1 | Veri hattı (SQLite + link sağlığı + AniList) | ✅ | [02](02-veri-pipeline.md) |
| 2 | İzleme deneyimi (ana sayfa, katalog, arama, detay, oynatıcı, listem, fansublar, künye) | ✅ | [01](01-mimari.md) · [04](04-oynatici-ve-kaynaklar.md) |
| 3 | Cila, SEO, mobil, erişilebilirlik | ✅ | [03](03-tasarim-sistemi.md) |
| 4 | Statik export + GitHub Actions yayın yapılandırması | ✅ | [06](06-yayin-ve-deploy.md) |
| 7 | Link sağlığı tarayıcısı (`tools/link-tara.mjs`) + ağsız birim, veri ve çıktı bütünlüğü testleri (74 test); altı oturumda kapsam %1,38 → **%58,72** (ölçülebilir havuz tükendi) | ✅ (sibnet ve bot duvarlı host'lar hariç) | [09](09-link-sagligi-otomasyonu.md) · [30.09](gunluk/2026-09-30-faz7-link-taramasi.md) · [01.10-a](gunluk/2026-10-01-faz7-link-taramasi-2.md) · [01.10-b](gunluk/2026-10-01-faz7-link-taramasi-3.md) · [01.10-c](gunluk/2026-10-01-faz7-link-taramasi-4.md) · [01.10-d](gunluk/2026-10-01-faz7-link-taramasi-5.md) |
| 8 | Paketleme turu A/D: OG kartı, PWA, hero fragmanı, rastgele bölüm, 404 zenginleştirme, seri (franchise) ve fansub sayfaları | ✅ | [03](03-tasarim-sistemi.md) · [02](02-veri-pipeline.md) |
| 5 | Hesaplar, senkron ve bildirim hattı (Worker + D1 kodu, istemci, testler) | ✅ kod + yerel test · ✅ **canlı dağıtım (01.10.2026)** — uzak `api:test` 46/46, site API adresiyle derlendi; kalan: yayına push | [11](11-hesaplar-uygulama.md) · [06](06-yayin-ve-deploy.md) · [ADR-0008](kararlar/ADR-0008-workers-parola-ve-jeton.md) |

## Sıradaki işler

### A. Hemen yapılabilecekler (düşük risk, yüksek etki)

| İş | Kazanç | Not |
|---|---|---|
| Gerçek tarayıcıda uçtan uca test (Playwright) | Regresyon güvenliği | `docs/05` § Yapılacaklar |
| Lighthouse bütçesi | Performans/erişilebilirlik | Statik site için kolay |
| Özetlerin Türkçeleştirilmesi | Türkçe kullanıcı deneyimi | AniList özetleri İngilizce; makine çevirisi + insan düzeltmesi |
| Eksik 22 yapımın AniList eşleştirmesi | Künye bütünlüğü | 6.085 → 6.107 |
| `/kesfet/` için "sadece izlenebilir olanlar" anahtarı | 141 kaynaksız yapımı gizleme | Kullanıcı tercihi |
| Anime başına OG kartı | Paylaşımda yapıma özel görsel | Bugün site geneli `public/og.png` var; 6.107 sayfa için kart üretmek 1 GB'lık Pages sınırını yaklaştırır, veriden `generateStaticParams` yerine derleme sonrası üretim denenebilir |

### F. Faz 9 · Oynatıcı olgunluğu (04.10 planı)

Bugünkü ölçüm: 316.819 kaynağın **%53,5'i** (169.348 · 19 host) site playerında
çözülebiliyor, %46,5'i (13 sağlayıcı) çözülemiyor ([12](12-akis-koprusu.md)).
Aşağıdaki sıra "en çok kaynağı açan iş" önce olacak biçimde kurgulandı.

**P0 · Kapsamı büyüten işler**

| İş | Kazanç | Nasıl | Risk / gerekçe |
|---|---|---|---|
| Ev IP'sinden **çözüm toplayıcı** (gece Playwright işi) | voe · doodstream · byse · cda · streamwish · videa sınıfı (≈6.700 kaynak) gerçek tarayıcıda çözülür | Bu makinede zaten saatlik döngü var (`dongu:gunluk`); Playwright kurulu. Gece 100–200 popüler bölüm gerçek Chromium'da açılır, imzalı adresler Worker önbelleğine yazılır | İmzalar günlük → yalnız "ısıtılmış" bölümler kapsanır; kapsam popülerliğe göre sıralanır. Worker'a yazma ucu jeton ister |
| Sibnet (133.290 · %42) tarayıcı katmanı | Site playerına %42 kaynak | Sunucu 403 (veri merkezi kuralı); istemciden `fetch` CORS'suz okunamaz. Tek teknik yol: kullanıcının tarayıcısında **bir kez** izlemek ve `postMessage` yayınlayan bir sarmalayıcı ile konum/olay almak (Sibnet'in kendi player'ı API veriyor mu?) | Ölçülecek: Sibnet gömülü sayfası postMessage yayınlıyor mu. Yayınlıyorsa „iframe player" zaten %42'nin konumunu okuyabilir hale gelir |
| Dailymotion (2.650) + mp4upload (3.692) çıkış denemesi | ~6.300 kaynak | 403'ün nedeni manifest/Referer/çerez olabilir; sırayla 4 kombinasyon (Referer, Origin, çerez, farklı UA) ölçülür | Ölçüm ucuz (birkaç saat); başarısızlık kayda geçer ve kapanır |
| Kalan 13 sağlayıcı için „neden" panosu | Şeffaflık | `/yonetim`'de host başına başarı oranı + son hata (zaten `/akis/hata` topluyor) | — |

**P1 · Oynatma deneyimi**

| İş | Değer | Not |
|---|---|---|
| **Altyazı desteği (VTT)** | Türkçe izleyici için en büyük eksik | Köprü HLS listesindeki `#EXT-X-MEDIA:TYPE=SUBTITLES` satırlarını zaten yeniden yazıyor; yapılacak: `<track>` üretimi + hls.js `subtitleTracks` + varsayılan Türkçe seçimi. Arşivde bölüm bazlı `.vtt` dosyaları da var (yerel) |
| Kalite seçimi (HLS seviyeleri) | 1080p/720p seçimi | Uqload akışı ölçümünde **tek** varyant (640×360) vardı; çoğu kaynakta seçenek olmayacak — yine de gösterilmeli (mevcutsa) |
| Bölüm sonu otomatik geçiş + izlendi | Binge izleme | Güvenilir "bitti" olayı yalnız kendi `<video>` elemanında var (%53); iframe'de sayfa süresi verisiyle yaklaşım korunur |
| Ön ısıtma (prefetch) | Daha hızlı başlangıç | Sayfa açılışında 1. kaynağın ilk parçasını `Range: bytes=0-1` ile yoklamak, oynatma başlangıcını bir tur öne alır |
| Klavye kısayolları + PiP + hız | Masaküstü ve mobil UX | `space/k/j/l/f/m`, 0,25×–2× |
| Kalite/performans göstergesi (buffer, düşen kare) | Güven | hls.js olaylarından; yalnız bilgi amaçlı |

**P2 · Dayanıklılık ve gözlemlenebilirlik**

| İş | Değer |
|---|---|
| `e=`/`s=` imza parametrelerini ayrıştırıp önbellek TTL'ini doğru kurmak (uqload HLS `e=14400` taşıyor, bugün 1 saat varsayılıyor) | Süresi geçmiş adresin önbellekten servis edilmesini engeller |
| `/akis/coz` başarı oranı + gecikme sayacı (kişisel veri saklamadan) | Hangi sağlayıcının ne zaman bozulduğunu görmek |
| Gece kanaryası: sağlayıcı başına 5 rastgele bölümü gerçek tarayıcıda oynat, sonucu panele yaz (`akis-olcum.mjs` genişletmesi) | Sessiz bozulmayı yakalar |
| Çözüm önbelleğinin cihazlar arası paylaşımı (hesap API'si) | Telefonda çözülen kaynak masaüstünde de hazır |
| Captcha/fail sınıflandırmasının telemetriye geçmesi | ✅ 04.10 `captcha` kodu eklendi ([12](12-akis-koprusu.md)) |

**Yapılmayacaklar (tekrar hatırlatma):** video barındırma/proxyleme ve indirme yok;
captcha **programatik olarak çözülmez** (asıl çözüm duvarı aşmak değil, akışı
sağlayıcının sayfasından bağımsız oynatmak — bkz. §04.10 captcha bölümü).

### B. Faz 5 · Hesaplar ve API

- ✅ Kod tamam: `api/` Worker (bildirim + kimlik + senkron + KVKK), istemci kuyruğu,
  yerel-önce birleştirme, `/hesap/` arayüzü. Ayrıntı: [11](11-hesaplar-uygulama.md).
- ✅ **Canlı dağıtım (01.10.2026):** <https://genesisanime-api.genesisanime.workers.dev> · D1
  `genesisanime` (WEUR) · secret'lar girildi · uzak `npm run api:test` **46/46** (`--oran` dahil) · site
  `NEXT_PUBLIC_API` + `NEXT_PUBLIC_BILDIRIM_API` ile derlendi, tarayıcıda uzak API'ye karşı
  kayıt → senkron → bildirim → KVKK silme sınandı. Ayrıca ilk dağıtımda yalnızca üretimde görünen
  bir hata bulundu ve düzeltildi: PBKDF2 iterasyon tavanı (H-20). Kurulum komutları, hesap
  engelleri ve ölçümler: [06](06-yayin-ve-deploy.md).
- ✅ **Yönetim paneli + otomatik döngü (01.10.2026):** aynı Worker'a beş yönetici ucu eklendi
  (`/tarama/ayar|durum|kosu|kalp`, D1 tabloları `tarama_ayar`/`tarama_kosu`/`tarama_kalp`) ve site
  içinde **`/yonetim/`** paneli yazıldı (noindex, `ADMIN_TOKEN`). Günlük link tarama döngüsü
  (`npm run dongu:gunluk`) bu makinede **saatlik Windows görevine** bağlandı; makine gece kapalıysa
  koşu kaçmaz. Ayrıntı: [11](11-hesaplar-uygulama.md) · [09](09-link-sagligi-otomasyonu.md) §10.
- ⏳ Kalan iş: derlenmiş `out/`'u GitHub Pages'e **push** (kullanıcı kararı), gece döngüsünün birkaç
  günlük gözlemi ve gerçek kullanıcı bildirimlerinin yönetici kuyruğundan izlenmesi.
- Sıradaki özellikler (bilinçli olarak kapsam dışı bırakıldı): e-posta doğrulama,
  parola sıfırlama, OAuth, herkese açık profil.
- Tasarım gerekçeleri: [07-hesaplar-ve-api.md](07-hesaplar-ve-api.md)

### C. Faz 6 · Topluluk

- Bölüm yorumları, puanlama, moderasyon ve topluluk odaklı yönetim ekranları.
- Not: işletme paneli (tarama ayarı + koşu geçmişi + loglar) 01.10.2026'da **`/yonetim/`** olarak
  yapıldı; topluluk moderasyonu hâlâ taslak.
- Ayrıntı: [08-topluluk.md](08-topluluk.md)

### D. Faz 7 · Link sağlığı otomasyonu (devam)

- ~~Kalan ölçülebilir havuz 10.913~~ **Tamamlandı (01.10-d):** my.mail.ru'nun kalanı üç dilimde
tarandı; kapsam **%58,72**, kesin %54,67. Artık ölçülebilir host kalmadı (drive, yadi.sk,
href.li, uqload, videoapi vb. tükendi).
- Sibnet (133.307): 0,5 istek/sn güvenli, 1 istek/sn duvar (ölçüm 01.10) — “yavaş şerit”,
  farklı çıkış IP'si ya da tarayıcı katmanı gerekiyor.
- Bot duvarlı host'lar (voe, dood, byse) ve MEGA: HTTP kanıtı üretmiyor; tarayıcı/API katmanı.
- ✅ **Günlük otomatik döngü (01.10):** tarama dilimi → `veri` → `build` → `yayin:hazirla`,
  politika D1'de, iş yerel makinede saatlik zamanlayıcıda; sonuç panele yazılır
  ([09](09-link-sagligi-otomasyonu.md) §10). Derleme `out/` kilidine dayanıklıdır (kilitte bekleyip
  artan beklemeyle tekrarlar). Tarama artık elle hatırlamaya bağlı değil.
- ✅ Kullanıcı bildirimleri (01.10): oynatıcı → Worker → `tools/cache/bildirim.jsonl` →
  `npm run link:tara -- --bildirim` ile kuyruğun önü. Kullanıcı bildirimi **karar** değil
  önceliktir; durum yine kanıtla belirlenir. ([11](11-hesaplar-uygulama.md))
- Ayrıntı: [09-link-sagligi-otomasyonu.md](09-link-sagligi-otomasyonu.md)

### E. Deneyim iyileştirmeleri (öneri havuzu)

| Fikir | Değer |
|---|---|
| ~~"Kaldığın yerden devam" için gerçek konum takibi~~ | ✅ kısmen 02.10: kaynakların %7'sinde (VK) postMessage köprüsü ile **gerçek konum/süre** okunuyor ve oynat/duraklat/sar komutları çalışıyor; kalan %93 opak (Sibnet tek başına %42) — kendi proxy'si olmadan mümkün değil. **03.10 güncellemesi:** buna Mail.ru (%27,9) da eklendi — kendi oynatıcımız konumu okuyup saklıyor, yani gerçek konum kapsamı ~%35'e çıktı. 02.10 akşamı yetenek tablosu **önsele** indirildi: site kendi trafiğinde ölçüyor, cihazda hatırlıyor ve bir host konuşmaya başlarsa kendiliğinden fark ediyor (kanıtsız yetenek açılmaz, 2 ardışık başarısız sınama demote eder). Ölçüm: [04](04-oynatici-ve-kaynaklar.md) · [olcum/kopru-2026-10-02.json](olcum/kopru-2026-10-02.json) · ADR-0009 |
| Kendi `<video>` oynatıcımız: akış köprüsünün istemciye bağlanması | ✅ 03.10: Mail.ru kaynaklarında video artık **bizim** `<video>` elemanımızda oynuyor — `#t=` ile kaynak değişiminde konum koruma, 403/502'de seçim başına bir kez taze çözümleme, çözülemeyende bugünkü iframe yolu (tarayıcıda ölçüldü). ✅ 03.10 üretime alındı (Worker sürümü `30a3f4cf`; canlıda kendi oynatıcımız doğrulandı, günlük IP sınırı aktif). Kalan işler: gözlemlenebilirlik (istek sayacı/oran), Odnoklassniki çözümleyicisi, markalı kontrol çubuğu, test Worker'ının silinmesi. [12](12-akis-koprusu.md) |
| Yüzdelik ilerleme çubuğu ve otomatik bölüm sonu | Köprü olan hostta bile "bölüm bitti" olayı güvenilir değil; ayrı ölçüm ve ayrı karar gerektirir |
| ~~Sibnet kaynaklarının durumu~~ | ✅ 03.10: kaynakların %42,1'i erişilemediği için **kullanım dışı** etiketlendi ve varsayılan seçimde geri plana alındı — **silinmedi** (host tekrar cevap verirse tek satırla geri açılır). Karar tarihli, sebep ölçümlü (`src/lib/oynatici.ts`), oynatıcıda ve `/kunye`'de etiketli: [04](04-oynatici-ve-kaynaklar.md) |
| Opak host'lar için tarayıcı katmanı (sekme içi zaman ölçümü) | Kaynak davranışı değişmeden kontrol yok; yalnız "ne kadar süre açık kaldı" tahmini iyileştirilebilir |
| ~~Franchise/seri sayfaları~~ | ✅ 01.10: 961 seri grubu, `/seriler/` + `/seri/<slug>/` |
| Klavye ile tam gezinme ("/", "g h", "g k" komutları) | Güç kullanıcılar |
| ~~Rastgele bölüm / "Şansıma ne çıkarsa"~~ | ✅ 01.10: hero'daki düğme havuzdan rastgele bölüm açıyor |
| Haftalık "arşive yeni eklenenler" akışı | Geri dönen ziyaretçi |
| ~~PWA + çevrimdışı iskelet~~ | ✅ 01.10: manifest + servis çalışanı + ikon seti (statik veri cache-first) |
| Çoklu dil (TR varsayılan, EN iskelet) | Arşivin uluslararası görünürlüğü |
| ~~4K banner'lar (TMDB backdrop)~~ | ✅ 02.10: AniList 1900 px'de tavanlanıyor (ölçüldü). Eşleme kimliği banner URL'inden değil veriden (`anilist`) okunacak şekilde düzeltildi; ardından veri kümesinde karşılığı olmayanlar için **arama tabanlı eşleme** eklendi (güven etiketli + gölge moduyla risk ölçümlü). TMDB kimliği **3.724 → 5.266** (arşivin %86,2'si), 4K katmanı **2.495** (%40,9), HD katmanı **2.269**, anime detay bandı **5.306/6.107** sayfada dolu (%86,9). Açık kalan **801** sayfa (TMDB'de karşılığı olmayan tek bölümlük OVA/özel bölümler) ve 257 yapımın AniList kimliği yokluğu. Günlük §15 · H-29 · H-30 |
| ~~Fansub sayfalarında çevirmen profili~~ | ✅ 01.10: `/fansub/<slug>/` grup sayfaları (363 grup) |
| Veri kalitesi panosu (her yapım için kaynak sağlık skoru) | Şeffaflık; Faz 7 ile beslenir |
| "İzleme sırası" önerisi (ilişkili yapımlardan otomatik) | Uzun serilerde rehberlik |

## Bilinçli olarak yapılmayacaklar

- Video barındırma, proxyleme veya indirme — yasal ve teknik olarak kapsam dışı. Rakip analizi bu
  kararın teknik yüzünü doğruluyor: OpenAnime'nin istemci yükseltmesi, sprite önizlemesi, offline
  modu ve klibi **bayt sahipliğinden** doğuyor ([13](13-openani-oynatici-analizi.md))
- Kullanıcı hesabı olmadan çalışan deneyimi bozmak (site hesapsız tam çalışır)
- Tekrar satın alınan bir kütüphaneyle (`next/image` optimizasyonu, harici CMS) karmaşıklaştırma —
  statik export'un sadeliği bu projenin en büyük avantajı
