# 10 · Yol Haritası

> Son güncelleme: 2026-10-02

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
| ~~"Kaldığın yerden devam" için gerçek konum takibi~~ | ✅ kısmen 02.10: kaynakların %7'sinde (VK) postMessage köprüsü ile **gerçek konum/süre** okunuyor ve oynat/duraklat/sar komutları çalışıyor; kalan %93 opak (Sibnet tek başına %42) — kendi proxy'si olmadan mümkün değil. 02.10 akşamı yetenek tablosu **önsele** indirildi: site kendi trafiğinde ölçüyor, cihazda hatırlıyor ve bir host konuşmaya başlarsa kendiliğinden fark ediyor (kanıtsız yetenek açılmaz, 2 ardışık başarısız sınama demote eder). Ölçüm: [04](04-oynatici-ve-kaynaklar.md) · [olcum/kopru-2026-10-02.json](olcum/kopru-2026-10-02.json) · ADR-0009 |
| Kendi `<video>` oynatıcımız: akış köprüsünün istemciye bağlanması | ✅ temel 02.10: `/akis/coz` + `/akis/aktar` Cloudflare edge'inde uçtan uca doğrulandı (Mail.ru, kaynakların %27,9'u kendi `<video>`'muzda oynadı). Sıradaki: oynatıcı önce `/akis/coz` denesin, çözülemeyen kaynakta bugünkü iframe kalsın (403/502'de `?t=` ile taze çözümleme). [12](12-akis-koprusu.md) |
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
