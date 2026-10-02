# 00 · Genel Bakış

> Son güncelleme: 2026-10-01 · Durum: Faz 0–4 + paketleme turları tamamlandı; hesaplar kod olarak
> hazır (deploy bekliyor), site yayına hazır

## Amaç

Kapanan bir anime arşivinin (6.107 yapım, 71.694 bölüm, 317.146 video bağlantısı) verisini,
modern ve kullanılabilir bir izleme sitesine dönüştürmek:

- Netflix/Crunchyroll tarzı bir **keşfetme deneyimi** (hero vitrin, yatay satırlar, filtreli katalog)
- Kaynak çöpçatanlığı yapan bir **oynatıcı** (birden fazla player arasından en sağlamına otomatik geçiş)
- Arşivin ayırt edici verisi olan **fansub/çevirmen künyesinin** görünür kılınması
- Sunucu gerektirmeyen, **tamamen statik** yayın

## Kapsam (yapıldı)

| Alan | Durum |
|---|---|
| Veri hattı (SQLite + link sağlığı + AniList) | ✅ `tools/` altında, sıfır bağımlılık, ~9 sn |
| Ana sayfa (hero + 18 satır + istatistik) | ✅ |
| Katalog `/kesfet/` (tür/yıl/format/durum filtreleri, 5 sıralama, iki görünüm) | ✅ |
| Arama (`/ara/`, üst bar anlık arama, `/` kısayolu) | ✅ |
| Anime detayı (`/anime/<slug>/`, 6.107 ön-render sayfa) | ✅ |
| Oynatıcı (`/izle/?a=&b=`, kaynak çipleri, güvenilirlik sıralaması) | ✅ |
| İzleme listesi + izlemeye devam et + izlenen bölümler (tarayıcıda) | ✅ |
| Fansub dizini (363 grup → yapımlar) + grup profilleri (`/fansub/<slug>/`) | ✅ |
| Seri (franchise) sayfaları: 961 grup, `/seriler/` + `/seri/<slug>/` | ✅ |
| Künye ve veri kalitesi sayfası | ✅ |
| SEO (sitemap, JSON-LD, OG kartı), PWA (manifest + servis çalışanı + ikonlar), mobil alt menü | ✅ |
| Hero fragman kaplaması (`youtube-nocookie`, tıkla-yükle) + rastgele bölüm | ✅ |
| Yayın yapılandırması (GitHub Actions → Pages) | ✅ |
| Hesaplar (kayıt/giriş, bulut eşitleme, KVKK) | ✅ kod + istemci — ⏳ deploy (Cloudflare hesabı) · `docs/11-hesaplar-uygulama.md` |
| Kullanıcı bildirimleri → tarama önceliği | ✅ kod — ⏳ deploy · `docs/09` §4 |
| Topluluk (yorum, puan, moderasyon) | ⏳ Faz 6 — `docs/08-topluluk.md` |
| Tüm kaynakların toplu link taraması | ✅ Faz 7 — ölçülebilir havuz tarandı (kapsam %58,72); sibnet ve bot duvarlı host'lar hariç — `docs/09-link-sagligi-otomasyonu.md` |

## Sayılarla proje

| Ölçüm | Değer | Kaynak |
|---|---|---|
| Anime | 6.107 | arşiv DB |
| Bölüm | 71.694 | arşiv DB |
| Ham bağlantı | 317.146 | arşiv DB |
| Sitede listelenen kaynak | 316.820 | ölü/engelli 326 kaynak gizlendi |
| Doğrulanmış çalışan kaynak | 173.034 | kendi taramamız + arşiv geçmişi |
| Fansub grubu | 363 | bölüm-ekip kayıtları (112.541 satır) |
| Seri (franchise) grubu | 961 grup · 3.244 yapım | ilişki grafiği (union-find) |
| AniList zenginleştirmesi | 5.809 yapım | AniList GraphQL |
| Üretilen site | 880,6 MB · 21.049 dosya | `tools/rapor/yayin-raporu.md` (GitHub Pages uygun; CF Pages 20k sınırını aştı) |
| Ön-render sayfa | 7.448 | `npm run build` |
| İlk yükleme JS | 103–114 KB | build çıktısı |

## Dürüst sınırlar

1. **Kaynak doğrulama kapsamı %58,72.** 317.132 tekil adresin 186.226'sı otomatik kontrol edildi;
   173.362'sinde kesin karara varıldı (%54,67), 12.864 kaynakta belirsiz kalındı (bot koruması) ve
   geri kalanı "bilinmiyor" durumunda. Hiçbiri gizlenmez, yalnızca rozetsiz gösterilir. Ölçülebilir
   havuz 01.10'da tükendi; sibnet (133.307 kayıt) bot duvarı nedeniyle kapsam dışı — `docs/09`.
2. **İlerleme kaydı tahminî.** Oynatıcı farklı kaynakta çalıştığı için videonun gerçek konumu
   okunamaz; ilerleme "sayfada geçirilen süre" olarak tutulur, bölüm 90 saniye sonra izlendi sayılır.
3. **Özetler İngilizce.** AniList açıklamaları olduğu gibi kullanılıyor; Türkçeleştirme yapılmadı.
4. **Bazı kaynaklar gömülemez.** Mega.nz, Yandex Disk gibi servisler iframe'i engeller; bu
   kaynaklar için "yeni sekmede aç" sunulur.
5. **141 yapımın çalışan kaynağı yok, 47 yapımın bölüm kaydı yok.** Bunlar katalogda görünür ve
   sayfalarında uyarı verilir.
6. **Sibnet (kaynakların %42,1'i) 03.10'dan beri kullanım dışı.** Sunucu isteklerimize 403 ("administrative
   rules") döndürüyor ve akış adresi alınamıyor. Kaynaklar **silinmedi**: listede kalır, solgun +
   "Kullanım dışı" etiketli gösterilir ve varsayılan seçimde geri plana düşer. Karar tarihli ve
   gözden geçirme tarihli (3 Kasım 2026); host tekrar cevap verirse tek satırla geri açılır. Bu,
   arşivin bugünkü kaynak kapasitesinin gerçekte olduğundan büyük görünmemesi içindir — `docs/04`.

## İlgili belgeler

- Mimari: [01-mimari.md](01-mimari.md)
- Veri hattı: [02-veri-pipeline.md](02-veri-pipeline.md)
- Hesaplar/API: [11-hesaplar-uygulama.md](11-hesaplar-uygulama.md)
- Yol haritası: [10-yol-haritasi.md](10-yol-haritasi.md)
