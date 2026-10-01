# 10 · Yol Haritası

> Son güncelleme: 2026-10-01

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
| 5 | Hesaplar, senkron ve bildirim hattı (Worker + D1 kodu, istemci, testler) | ✅ kod + yerel test · ✅ **canlı dağıtım (01.10.2026)** — uzak `api:test` 45/45, site API adresiyle derlendi; kalan: yayına push | [11](11-hesaplar-uygulama.md) · [06](06-yayin-ve-deploy.md) · [ADR-0008](kararlar/ADR-0008-workers-parola-ve-jeton.md) |

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
  `genesisanime` (WEUR) · secret'lar girildi · uzak `npm run api:test` **45/45** · site
  `NEXT_PUBLIC_API` + `NEXT_PUBLIC_BILDIRIM_API` ile derlendi, tarayıcıda uzak API'ye karşı
  kayıt → senkron → bildirim → KVKK silme sınandı. Ayrıca ilk dağıtımda yalnızca üretimde görünen
  bir hata bulundu ve düzeltildi: PBKDF2 iterasyon tavanı (H-20). Kurulum komutları, hesap
  engelleri ve ölçümler: [06](06-yayin-ve-deploy.md).
- ⏳ Kalan iş: derlenmiş `out/`'u GitHub Pages'e **push** (kullanıcı kararı) ve gerçek kullanıcı
  bildirimlerinin yönetici kuyruğundan izlenmesi.
- Sıradaki özellikler (bilinçli olarak kapsam dışı bırakıldı): e-posta doğrulama,
  parola sıfırlama, OAuth, herkese açık profil.
- Tasarım gerekçeleri: [07-hesaplar-ve-api.md](07-hesaplar-ve-api.md)

### C. Faz 6 · Topluluk

- Bölüm yorumları, puanlama, moderasyon, yönetim paneli
- Ayrıntı: [08-topluluk.md](08-topluluk.md)

### D. Faz 7 · Link sağlığı otomasyonu (devam)

- ~~Kalan ölçülebilir havuz 10.913~~ **Tamamlandı (01.10-d):** my.mail.ru'nun kalanı üç dilimde
tarandı; kapsam **%58,72**, kesin %54,67. Artık ölçülebilir host kalmadı (drive, yadi.sk,
href.li, uqload, videoapi vb. tükendi).
- Sibnet (133.307): 0,5 istek/sn güvenli, 1 istek/sn duvar (ölçüm 01.10) — “yavaş şerit”,
  farklı çıkış IP'si ya da tarayıcı katmanı gerekiyor.
- Bot duvarlı host'lar (voe, dood, byse) ve MEGA: HTTP kanıtı üretmiyor; tarayıcı/API katmanı.
- ✅ Kullanıcı bildirimleri (01.10): oynatıcı → Worker → `tools/cache/bildirim.jsonl` →
  `npm run link:tara -- --bildirim` ile kuyruğun önü. Kullanıcı bildirimi **karar** değil
  önceliktir; durum yine kanıtla belirlenir. ([11](11-hesaplar-uygulama.md))
- Ayrıntı: [09-link-sagligi-otomasyonu.md](09-link-sagligi-otomasyonu.md)

### E. Deneyim iyileştirmeleri (öneri havuzu)

| Fikir | Değer |
|---|---|
| "Kaldığın yerden devam" için gerçek konum takibi | Farklı kaynaklarda cross-origin kısıt; kendi proxy'si olmadan mümkün değil |
| ~~Franchise/seri sayfaları~~ | ✅ 01.10: 961 seri grubu, `/seriler/` + `/seri/<slug>/` |
| Klavye ile tam gezinme ("/", "g h", "g k" komutları) | Güç kullanıcılar |
| ~~Rastgele bölüm / "Şansıma ne çıkarsa"~~ | ✅ 01.10: hero'daki düğme havuzdan rastgele bölüm açıyor |
| Haftalık "arşive yeni eklenenler" akışı | Geri dönen ziyaretçi |
| ~~PWA + çevrimdışı iskelet~~ | ✅ 01.10: manifest + servis çalışanı + ikon seti (statik veri cache-first) |
| Çoklu dil (TR varsayılan, EN iskelet) | Arşivin uluslararası görünürlüğü |
| ~~Fansub sayfalarında çevirmen profili~~ | ✅ 01.10: `/fansub/<slug>/` grup sayfaları (363 grup) |
| Veri kalitesi panosu (her yapım için kaynak sağlık skoru) | Şeffaflık; Faz 7 ile beslenir |
| "İzleme sırası" önerisi (ilişkili yapımlardan otomatik) | Uzun serilerde rehberlik |

## Bilinçli olarak yapılmayacaklar

- Video barındırma, proxyleme veya indirme — yasal ve teknik olarak kapsam dışı
- Kullanıcı hesabı olmadan çalışan deneyimi bozmak (site hesapsız tam çalışır)
- Tekrar satın alınan bir kütüphaneyle (`next/image` optimizasyonu, harici CMS) karmaşıklaştırma —
  statik export'un sadeliği bu projenin en büyük avantajı
