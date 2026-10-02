# AGENTS.md — GenesisAnime çalışma kuralları

Bu dosya, bu depoda çalışan yapay zekâ ajanları için bağlayıcı çalışma kurallarıdır.
Kullanıcı aksini istemedikçe uygulanır.

## 1. Değişmezler (invariants)

1. **Sitede video barındırılmaz.** `public/` altına hiçbir video/medya dosyası eklenmez.
   Oynatma yalnızca üçüncü taraf gömülü (embed) URL'ler üzerinden yapılır.
2. **Arşiv girdileri salt okunurdur.** `../../turkanime_arsiv/`, `../../Yeni turkanimetv arsiv/`,
   `../../avenor/` ve tüm `.db` dosyaları yalnızca okunur. Bu depodan yazılmaz, taşınmaz, silinmez.
3. **Kaynak verisi doğrudan düzenlenmez.** `public/data/` üretilmiş çıktıdır; elle düzeltme yapılmaz.
   Düzeltme gerekiyorsa `tools/` altındaki üreteç değiştirilip `npm run veri` yeniden çalıştırılır.
4. **Ölü kaynak gizleme kuralı.** Durumu `olu` veya `engelli` olan URL'ler siteye **hiç** yazılmaz.
   Durumu `bilinmiyor` veya `belirsiz` olanlar gizlenmez (yalnızca rozetsiz görünür).
4b. **`olu` demek için somut kanıt şart.** Yalnızca şunlar ölü sayılır: HTTP 404/410, alan adının
   çözümlenememesi ya da host'a özgü “dosya silindi” imzası. Oran sınırı (403/429), bot/DDoS
   duvarı, 5xx, zaman aşımı ve JS kabuğu asla ölü değildir — `belirsiz` olur. Hedef site yük
   altında farklı davranıyorsa (ör. VK) kural sıkılaştırılır; ölçüm `docs/09`'a yazılır.
4c. **Durum sözlüğü tektir.** `tools/lib/ortak.mjs` içindeki `DURUM` ve `DURUM_ESLEME` kullanılır;
   yeni bir durum yazan araç eşlemeyi de güncellemek zorundadır (H-8). `"ok"` hem arşivdeki
   `"çalışıyor"` hem kendi taramamızdaki karşılıktır.
5. **`useSyncExternalStore` anlık görüntüleri önbelleklenir.** `src/lib/depo/` içindeki her okuma
   fonksiyonu, değişmediği sürece **aynı referansı** döndürmelidir. Aksi halde React sonsuz render
   döngüsüne girer (bkz. `ilerlemeListesi()` notu).
6. **Bölüm listesi istemciye kompakt aktarılır.** `Anime` nesnesi bir istemci bileşenine prop
   olarak verilmez; sayfa boyutu megabaytlara çıkar. `BolumOzet[]` kullanılır.
7. **Statik dışa aktarım korunur.** `output: 'export'` kaldırılmaz; sunucu tarafı çalışma zamanı,
   API rotası veya middleware eklenmez. Hesaplar/topluluk ayrı bir servis olarak yapılır
   (bkz. `docs/07-hesaplar-ve-api.md`, uygulama: `docs/11-hesaplar-uygulama.md`).
8. **Site API'siz tam çalışır.** `api/` (Cloudflare Worker) isteğe bağlıdır:
   `NEXT_PUBLIC_API` / `NEXT_PUBLIC_BILDIRIM_API` boşken hiçbir istek atılmaz; hesap, senkron ve
   bildirim yokken yerel depo tek gerçek kaynaktır. Yeni bir özellik bu bağımsızlığı bozamaz.

## 2. Kod kuralları

- TypeScript `strict`; `any` kullanılmaz.
- Yorumlar ve kullanıcı metinleri **Türkçe**, kod tanımlayıcıları İngilizce değil — proje Türkçe
  kimlik kullanır (`bolumler`, `kaynaklar`, `oynatici`). Yeni dosyalarda bu dille uyumlu ol.
- CSS çatısı yoktur; tüm stiller `src/app/globals.css` içindeki tasarım belirteçleriyle yazılır.
- Dış bağımlılık eklemeden önce sor: veri hattı bilinçli olarak sıfır bağımlılıkla çalışıyor
  (`node:sqlite`, `fetch`).
- Türkçe metin işlemlerinde `src/lib/bicim.ts` içindeki `normalize()` kullanılır; yeni bir
  normalizasyon yazılmaz.

## 3. Belgeleme zorunluluğu

Her iş paketinden sonra:

1. İlgili faz belgesi (`docs/0X-*.md`) güncellenir: yapılan iş, dosyalar, komut, ölçüm, karar.
2. `docs/gunluk/YYYY-AA-GG-<faz>.md` dosyasına kronolojik kayıt eklenir.
3. `docs/gunluk/kayit.jsonl` dosyasına makine okunur tek satır eklenir
   (`{"zaman","faz","is","dosyalar","komut","sonuc","olcum"}`).
4. Geri dönüşü zor bir karar alındıysa `docs/kararlar/ADR-XXXX-<konu>.md` yazılır.
5. `README.md` **yaşayan bir belgedir**: "Proje durumu" tablosundaki ölçümler (test sayısı, yayın
   boyutu, link tarama kapsamı, API adresi, sıradaki işler) ve "Son güncelleme" tarihi her anlamlı
   turda tazelenir; kullanıcıya dönük komut tablosu yeni komutlarla güncel tutulur.

## 4. Kontroller (CI ile aynı komutlar)

Bir iş "bitti" sayılmadan önce:

```bash
npm test                                # tools/ birim + veri/çıktı bütünlüğü testleri (ağsız, ~17 sn, 186 test)
npm run api:test                        # api/ değiştiyse: çalışan Worker'a (wrangler dev) uçtan uca duman testi
npm run typecheck                       # tip hatası yok
npm run build                           # 7.448 sayfa üretilmeli, hata yok
npm run yayin:hazirla                   # out/ ölçümü; GitHub Pages <1 GB (CF Pages 20k sınırını aştı — beklenen)
node --no-warnings tools/export-data.mjs  # yalnızca veri hattı değiştiyse
npm run link:test                       # sınıflandırıcı kuralları değiştiyse (canlı URL sınaması)
npm run link:durum                      # tarama verisi değiştiyse (kapsam dağılımı)
```

`tools/`, `src/lib/depo/` (birleştirme) ve `api/src/` altındaki mantık değiştiyse `npm test`
zorunludur; yeni bir karar kuralı veya imza eklerken `tools/testler/` içine sentetik bir örnek
yazılır (testler ağsız ve bağımlılıksız kalır — API testleri sahte D1 ile koşar).

`tools/testler/veri.test.mjs` üretilmiş `public/data/` ile link sağlık kaydını karşılaştırır;
`tools/testler/cikti.test.mjs` ise derlenmiş `out/` ağacını denetler (`out/` yoksa atlanır).
“Ölü/engelli URL sızıntısı” ya da “rozet” hatası verirse çözüm testi gevşetmek değil
`npm run veri && npm run build` ile veriyi ve çıktıyı tazelemektir (kaynak verisi elle
düzeltilmez — bkz. §1.3). CI, derlemeden sonra `npm test` koşar; arşiv sağlık dosyası CI'da
yoktur, bu yüzden kaydı bulunamayan rozetler “doğrulanamadı” sayılır ve raporda bildirilir.

Elle derlemeden önce tarayıcı sunucusu kapatılır: python sunucusu `out/` klasörünü tutarken derleme
`EBUSY: rmdir 'out'` ile düşer ve **eski çıktı sunulmaya devam eder**. (Günlük döngü bu duruma karşı
korunmuştur — aşağıdaki “Otomatik döngü ve yönetici paneli” bölümü — ama elle koşulan derlemede
kapatmak yine gerekir.)

Ayrıca tarayıcıda gerçek tıklama testi: ana sayfa → arama → anime detayı → bölüm → oynatıcı.
Konsolda hata olmamalı (`document.documentElement.dataset.hata` boş olmalı; sitede her zaman
kurulu bir erken hata kaydedici vardır).

### Otomatik döngü ve yönetici paneli

Günlük link tarama döngüsü (`tools/gunluk-dongu.mjs`) bu makinede zamanlayıcıya bağlıdır; kararı
`tools/lib/dongu.mjs` verir ve politika D1'de (`tarama_ayar`) tutulur, `src/app/yonetim/`
panelinden yönetilir. Ayrıntı: [docs/09](docs/09-link-sagligi-otomasyonu.md) §10.

- Döngü ve panel aynı **`ADMIN_TOKEN`**ı kullanır; jeton yalnızca `--token=`, ortam değişkeni veya
gitignore'lu kök **`.env`** dosyasından okunur, **asla** depoya yazılmaz. `api/.dev.vars`
(yerele özel) kullanılmaz.
- Döngünün `npm run build` adımı **`NEXT_PUBLIC_API`, `NEXT_PUBLIC_BILDIRIM_API`, `BASE_PATH`**
ve `NEXT_PUBLIC_SITE_URL` değerlerini kök `.env`'den alır; yoksa ürettiği site API'siz/öneksiz
kalır. Döngü bunları eksik görürse log'a ve panel kaydına UYARI yazar.
- Döngünün derleme adımı `out/` kilidine **dayanıklıdır** (`tools/lib/derleme.mjs`): derlemeden
  önce klasör sökümü 5 sn arayla 6 kez denenir, derleme yine kilit hatasıyla düşerse 15/45 sn
  beklenerek en çok 3. denemeye çıkılır. Kilit dışı hatalar (tip hatası, eksik modül) tekrar
  edilmez ve kilit sürerse koşu panel notunda nedeni + çözüm önerisiyle `hata` damgalanır.
  Yine de elle derleme öncesi tarayıcı sunucusu kapatılır (§4).
- Panel/API değişikliğinde `api/migrations/0002-tarama.sql` şeması hem yerelde hem uzakta
uygulanmalıdır (`npm run db:yerel` / `npm run db:uzak`); yeni uçlar `ADMIN_TOKEN` ister.

## 5. Git

- **Depo:** `origin = https://github.com/Nutaliaxd/GenesisAnime.git`, dal `main` (public).
  İlk commit `783dca6`; `main` push'u GitHub Pages yayınını başlatır (iş akışı `yayinla.yml`).
- Kullanıcı istemedikçe commit/push yapılmaz. (İlk doldurmada tüm ağaç tek commit'tir; sonrasında
  `git add -A` kullanılmaz — yalnızca kendi değiştirdiğin dosyalar eklenir.)
- `public/data/` bilinçli olarak sürüm kontrolündedir (CI, kaynak DB olmadan derler).
  `tools/cache/` ve `out/` asla eklenmez — **tek istisna** `tools/cache/link-durum.jsonl`:
  bu dosya önbellek değil kanıt kaydıdır, kaybı 30 bin rozeti sessizce siler (ADR-0007).
- Link tarama durumu `tools/cache/link-durum.jsonl`'e **eklenir** (append-only); elle düzenlenmez,
  düzeltme gerekiyorsa `tools/link-tara.mjs` bayrakları kullanılır (`--zorla`, `--durum-filtre`,
  `--sicil-denetim`, `--sikistir`).
