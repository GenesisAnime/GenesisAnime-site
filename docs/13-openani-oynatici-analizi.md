# 13 · OpenAnime Oynatıcı Analizi (rakip teardown, 03.10.2026)

"Kendi oynatıcımız" hedefinde referans alınan **OpenAnime**'nin (openani.me) oynatıcısını ve
çevresini kanıtla anlamak için yapıldı. Bu bir "beğendim, kopyalayalım" belgesi değil: hangi farkın
**mimari** (bayt sahipliği), hangisinin **teknik numara** (alınabilir) olduğunu ayırır. Amaç, bizim
yol haritamızı bir rakibin özellik listesine göre değil, kendi sınırımıza göre çizmek
(`docs/10`, ADR-0005: video barındırma/proxyleme kapsam dışı).

## Yöntem ve kayıt

| Kaynak | Ne okundu |
|---|---|
| Canlı sayfa (DOM) | `openani.me/anime/one-piece/1/1180` bölüm sayfası, oynatıcı düğmeleri, ayar öğeleri, `<video>`/`<canvas>` nitelikleri |
| Ağ kaydı | Oynatma yolundaki istekler (medya, sprite, altyazı, API), yanıt kodları ve başlıkları |
| Kendi JS paketleri | 70 parça (`/__openanime/immutable/openanime-*.js`) metin analizi: ayar etiketleri, kaynak-kalite fonksiyonu, WebGPU/WebCodecs izleri |
| Org repoları | `github.com/OpenAnime` (20 repo) README'leri — player kapalı, **çevre araçları açık** |
| npm kaydı | `@openanime/ass2esl` (v1.1.2, minified değil paket metadatası) |

**Ölçüm anı:** 3 Ekim 2026. Tek bölüm (One Piece S01B1180) + genel sayfa yükü üzerinden okundu;
canlı davranış değişirse (host politikası gibi) belge değil **ölçüm** tazelenir — `docs/04`'teki
köprü tablosu için geçerli kuralın aynısı.

## 1. Mimari: neyin üzerine kurulu

| Katman | Bulgu | Kanıt |
|---|---|---|
| Site iskeleti | **SvelteKit** + Fluent Design | `svelte-*` sınıf hash'leri, `/__openanime/immutable/openanime-*.js` parçaları, org'da `fluent-svelte-extra` (MIT) |
| Oynatıcı | Kendi yazılımı; üçüncü taraf player yok | `class="openanime-vanilla-player fds-theme-dark"`; 70 pakette `videojs/plyr/vidstack/artplayer/shaka/dashjs` dizesi yok |
| Oynatma yolu | **Progressive MP4** (HLS/DASH değil) | Ağ kaydında tek `…-1080p.mp4?big=1`; `m3u8`/`mpd` isteği yok, paketlerde `hls.js`/`mpegts` izi yok |
| Medya sunumu | Kendi depolama kümesi + CDN düğümü | API alanı `storage_cluster_id: "openanime-nextgen-cluster1"`; CDN hostu `de2---vn-…yeshi.eu.org` |
| Video elemanı | `<video crossorigin="anonymous" preload="metadata">` | `crossOrigin` kare erişimi (canvas/WebGPU) için şart |
| Arka plan | AWS | Org topic'leri: `anime aws discord fluent javascript open-source secure social-media svelte` |
| Ürün hattı | Web + masaüstü + mobil | `desktop-ts` (Electron), `xiris` (güncelleme sunucusu), `capacitor-plugin-unityads` (mobilde reklam) |

Ölçülen medya davranışı (bölüm 1080p):

| Ölçüm | Değer |
|---|---|
| Dosya adı | `…/animes/one-piece/1/1180-7271553552927952925-1080p.mp4?big=1` |
| Boyut | **922.690.582 B** (≈5,2 Mbps · 23:35 bölüm) |
| `content-type` | `binary/octet-stream` (tarayıcı kokluyor) |
| `Range: bytes=0-1023` | **206** |
| `?big=1` sorgusu | Uzunluk **değişmiyor** (aynı 922.690.582) → sorgu içerik seçmiyor, yönlendirme/rota bayrağı |
| `<video>` ölçüsü | 1920×1080 · `duration 1415,72` |

Org'un HLS framework'ü (`yakamoz`, `m3u8-parser` + `mux.js` ile MSE'ye transmux) mevcut ama **web
oynatıcısında HLS isteği görülmedi**; bu turda gözlenen yol saf MP4 + Range.

## 2. Oynatıcı içi mantık

### 2.1 Ayarlar menüsü (kendi state kodundan çıkarıldı)

| Öğe | Alt öğeler / seçenekler | Kalıcılık |
|---|---|---|
| Hız | 0,25x · 0,5x · 1x · 1,25x · 1,5x · 2x | `localStorage: playback_rate` |
| Çözünürlük | `sources` listesinden; `2160p` → **"4K"** etiketi, `isUpscale` olanlar ayraçla ayrılıyor | `selected_resolution` |
| Altyazı Ayarları | Yazı Boyutu (kaydırıcı), Yazı Tipi (gömülü font listesi) | `softsubFont` |
| Video Filtreleri | "Derin Renkler (FRC)" anahtarı — WebGPU yoksa kapalı + açıklama | — |
| Kare Oluşturma (OFG) | "Mod" (preset combo) + "Hedef Kare Hızı" kaydırıcısı | — |
| Renkler | LUT (`selectedLUT: "/LUTs/default.png"`) | — |
| Video Büyüklüğü | görüntü ölçekleme modu | `video_size` |
| Ses Modları | ekolayzer | — |
| Sinematik | sinema modu (DOM'da `cinema-player`) | — |

### 2.2 Kalite değişimi: `#t=` numarası ve "4K"nın gerçek doğası

Paket içindeki kalite fonksiyonu şunu yapıyor: seçilen çözünürlüğe karşılık gelen dosyayı bulur,
`src`'yi **`dosya + "#t=" + floor(currentTime)`** olarak yazar, `pause → load → play` sırasını
işletir ve seçimi `selected_resolution` anahtarına yazar. Konum koruması ayrı bir protokol değil,
medya parçası (`#t=`) ile yapılıyor. iOS'ta altyazı varken 2160 seçimi için ayrı bir eşleme var.

Kritik ayrım: fonksiyon, kaynak `isUpscale` işaretliyse (ya da offline moddaysa) **`src`'yi
değiştirmiyor** — yalnızca GPU yükseltmesini açıyor. Yani menüdeki "4K", indirilen ayrı bir 4K
dosya değil, **aynı dosyanın istemci tarafında yükseltilmiş** hâli. (Tek bölümde gözlendi: o
bölümün `files` listesinde yalnız 1080p var, `resolutions: [1080]`.)

### 2.3 OFG (kare oluşturma) ve görüntü filtreleri

- **Kare üretimi:** WebCodecs (`VideoDecoder`, `VideoFrame`) + **WebGPU** (`navigator.gpu`,
  `requestAdapter`, `createShaderModule`) + `Worker` + `requestVideoFrameCallback`. Pakette
  `motion_heavy` profili (sınıf başına SAD ölçekleri, ceza ölçekleri, "zeroMotion" davranışı) ve
  `OFGPresets()` var → **hareket kestirimli interpolasyon**, indirilen bir model dosyası yok.
- **Filtre/ölçekleme zinciri:** WebGPU pipeline etiketleri aşamaları veriyor:
  `Denoise Bilateral Mean` → `deblurDoG` X/Y → `depth to space` (pixel-shuffle) → `lumination`.
  Bu, Anime4K ailesinin WebGPU portuna karşılık gelir; org bunun için
  `vite-plugin-wgsl` (WGSL shader'larını küçültme/isim gizleme) yazmış. Yükseltmenin araştırma
  temeli ayrı bir repo: `DyDySample` ("Learning to Upsample by Learning to Sample", ICCV'23).
- **Kapılar:** WebGPU yoksa menü öğesi kapalı ve sebep yazılı (`webgpuNotSupportedMessage`);
  OFG ayrıca **abonelik** kapısında (`premium.tier != 3` kontrolü) ve oynatıcı içinde tanıtım
  şeridi var ("OFG 3.5 ile 60FPS").

### 2.4 Altyazı: libass yok, format sahibi olmak

Ağ kaydı, altyazının sunucudan **ASS** olarak istendiğini gösteriyor
(`…/subtitles/<fansub>?type=ass`). DOM'da `canvas.subtitle-canvas` **WebGPU bağlamıyla** duruyor;
state'te `softsub*` alanları, font listesi ve gömülü bir font (`sourcesans3.ttf`) var. Org
repoları hattın geri kalanını veriyor:

- **`ESL`** (MIT): "Expressive Subtitle Language" — HCL tabanlı, insan-okur altyazı formatı;
  spec 1.1 + PDF. Konumlama, karaoke, hareket efektleri destekliyor; ASS'ın karmaşık grafik/geçiş
  kısımları bilinçli olarak dışarıda.
- **`@openanime/ass2esl`** (npm v1.1.2, bağımlılık: `ass-compiler`): ASS → ESL dönüştürücü.
  npm kaydında **lisans alanı yok** (bu yüzden "açık kaynak" diye anmak doğru olmaz).
- **`hcl-unmarshal`** (MIT): HCL → JSON; oynatıcının ESL'i okuması için.

Yani `libass`/JASSUB/SubtitlesOctopus **kullanmıyorlar**: kendi formatlarını yazıp kendi
çizicilerini WebGPU canvas'ına koymuşlar. (Bu, ilk turda wasm aramamın neden boş çıktığını da
açıklıyor; sayfadaki tek wasm `osc.wasm` altyazı motoru değil — bkz. §6.)

### 2.5 Oynatıcının çevresi

| Özellik | Kanıt |
|---|---|
| Seek önizlemesi | `…/anime_sprites/<slug>/<sezon>/<bölüm>-<id>.json` + `.jpg` (200) |
| "Bu kısmı atla" | `episodeData.skiptimes.intro/outro` (bu bölüm: 10,5–100,5 sn ve 1260,3–1350,0 sn) |
| OP/ED künyesi | `episodeData.spotify.intro/outro` — şarkı/sanatçı + `v.animethemes.moe/…webm` klibi |
| Birlikte izleme | `watch-together-socket` (uWebSockets.js; **BSL 1.1** — açık kaynak değil) |
| İndirme / klip | DOM'daki `download`, `clip` düğmeleri; bayt sahibi oldukları için doğrudan |
| PiP / sinematik | DOM'da `pip-icon`, `cinema-player` |
| Bölüm listesi + yorumlar | `.player-episode-list-item`, `…/episode/<n>/comments` |
| Offline | `navigator.serviceWorker.getRegistrations()` → `https://openani.me/` kapsamı |

## 3. Entegrasyon: veri ve API

Oynatıcı iframe **değil**: aynı sayfada, veriyi `api.openani.me`'den alıp
(`/session/init` Cloudflare Turnstile'lı oturum açıyor) kendi durum deposuna yazıyor.

| Uç (bu turda görülen) | İş |
|---|---|
| `POST /session/init` | oturum başlatma (öncesinde `OPTIONS` 204 — CORS açık) |
| `GET /anime/:slug/season/:n` | sezon + bölüm listesi (ad, özet, TMDB görseli, `mal_id`) |
| `GET /anime/:slug/season/:n/episode/:m` | oynatıcının beslendiği veri (aşağıda) |
| `GET …/episode/:m/comments` | bölüm yorumları |
| `GET …/episode/:m/subtitles/:fansub?type=ass` | altyazı (bu bölümde 404 — o kayıtta yok) |
| `GET /version` | sürüm bilgisi |

Bölüm verisinin alanları (gerçek yanıttan):

```
episodeData {
  files:        [{ file, resolution: 1080, size: 922690582, storage_cluster_id }]
  resolutions:  [1080]          // menüdeki çözünürlükler
  mime:         ""              // CDN binary/octet-stream gönderiyor
  processing:   false           // yükleme sonrası işleme bayrağı
  skiptimes:    { intro: {start,end}, outro: {start,end} }
  spotify:      { intro: {name, artists, spotifyUrl, mediaUrl}, outro: {mediaUrl} }
  fansub:       { id, name, secureName, is4K, contributors, discord, website, avatar }
  uploader:     { id, username }
  season, episodeNumber, airDate, name, summary, hasNextEpisode, hasPrevEpisode
}
```

Ek gözlem: sayfa TMDB görselleri, Iconify ikonları, Lottie animasyonları ve yorumlarda Klipy
GIF'leri kullanıyor; izleme tarafında **Plausible + Facebook pixel + Cloudflare Turnstile** var —
bizim "reklam/izleyici betiği yok" politikamızın tam karşıtı (karşılaştırma için kayda geçti).

## 4. Açık kaynak ekosistemi ve lisanslar

Org'un 20 reposu var; **web uygulaması ve oynatıcının kendisi kapalı**. Kamuya açık olanlar:

| Repo | Lisans | Bizim için anlamı |
|---|---|---|
| `ESL` + `ass2esl` + `hcl-unmarshal` | MIT · **lisanssız** · MIT | Altyazı **barındırırsak** referans olur; bugün kapsam dışı |
| `vite-plugin-wgsl` | MIT | WebGPU gölgelendiricisi yazarsak araç hazır |
| `watch-together-socket` | **BSL 1.1** (açık kaynak değil) | Altyazı/servis kodu kopyalanamaz; fikir bazında bakılır |
| `yakamoz` | CC-BY-SA-4.0 | HLS/MSE framework; ticari kullanımda lisans yükümlülüğü var |
| `DyDySample` | MIT | Yükseltme algoritması (araştırma) — bizde uygulanabilir bir yüzeyi yok |
| `desktop-ts`, `xiris`, `release-server-publisher` | "Other" / GPL-3.0 / Other | Masaüstü+mobil ürün hattı |

Ders: "açık kaynak anime platformu" ifadesi, **oynatıcının açık olduğu** anlamına gelmiyor; org
çevre araçları paylaşıyor, ürünün kalbi (oynatıcı + web) kapalı. Bu yüzden analiz, kod okumaya
değil **ölçüme** dayanıyor.

## 5. Bizim için çıkarımlar

### Alınabilir (barındırma gerektirmeyen)

1. **`#t=` ile konum koruyarak kaynak değiştirme.** Kendi `<video>` yolumuzda (Mail.ru + `/akis/aktar`)
   kaynak/kalite değişiminde birebir aynı numara kullanılabilir; ucuz ve kanıtlı.
2. **Yetenek kapılı menü.** Onlarda kapı WebGPU, bizde host yeteneği — ADR-0009'un aynı ilkesi.
   "Kanıtsız özellik için düğme gösterme" kuralının dışarıdan doğrulaması.
3. **Tercih kalıcılığı tek anahtar uzayında.** Onların `playback_rate` / `video_size` /
   `softsubFont` / `selected_resolution` anahtarları, bizim `genesisanime:v1:*` sözleşmemizle aynı
   fikir — `yerel.ts` bu iş için yeterli.
4. **Atla (OP/ED) verisi.** Barındırma gerektirmeyen tek "premium hissi" veren özellik: VK'da
   postMessage ile, Mail.ru'da kendi oynatıcımızda çalışır. Veri topluluk katkısıyla toplanabilir.
5. **Aktarım ucuna CORS + `Access-Control-Expose-Headers`.** Kare düzeyi işlem (filtre/60 FPS)
   yapılabilmesinin ön koşulu; iki satırlık başlık, bugün ihtiyaç yok ama kapıyı açık tutar.

### Alınamaz (mimari değil, **sahiplik** farkı)

- **İstemci yükseltmesi (menüdeki "4K") ve OFG:** bizim böyle bir dosyamız yok. Yalnız relay'den
  geçen Mail.ru akışında kuramsal olarak mümkün; genel bir çözüm değil ve GPU/maliyet yükü ağır.
- **Sprite önizlemesi:** üretimi yeniden kodlama demek.
- **ESL altyazı hattı:** altyazı barındırmıyoruz.
- **Offline izleme (servis çalışanı + cache):** bayt sahibi olmayı gerektirir.
- **Klip oluşturma/paylaşma, indirme:** aynı sebep.

Kural olarak yazılsın: bir özellik "OpenAnime'de var" diye gerekçelenmez. Bizim sınırımız
(barındırma/proxy yok — `docs/10`, ADR-0005) değişmedikçe bu özellikler taklit edilemez; bu belge
tam olarak o ayrımı kanıtlamak için var.

### Özet karşılaştırma

| Konu | OpenAnime | GenesisAnime |
|---|---|---|
| Video kaynağı | Kendi kümesi + CDN (bayt sahibi) | Üçüncü taraf embed; yalnız Mail.ru için relay temeli |
| Oynatıcı | Kendi yazılımı, same-origin `<video>` | iframe kabuğu + köprü şeridi + (sıradaki) relay'li `<video>` |
| Altyazı | Kendi formatı (ESL) + WebGPU çizici | Kaynağın kendi altyazısı (iframe içinde) |
| Kalite/4K | İstemci yükseltmesi (dosya değişmez) | Kaynağın çözünürlükleri |
| Atla/OP-ED | Sunucu verisi (`skiptimes`) | Yok (topluluk verisi fikri) |
| Ölçüm kültürü | Ürün özelliği (OFG, upscale) | Kanıt zorunluluğu (ADR-0009, H-32) |

## 6. Bilinmeyenler (dürüst liste)

1. Sunucu tarafı yükleme/transcode hattının içi görünmüyor: API şeması ve `processing` bayrağı
   okunuyor, işin nasıl yapıldığı (ffmpeg? hangi profil?) bilinmiyor.
2. `osc.wasm` (350 KB, **Go** ile derlenmiş; `go_scheduler`, `syscall/js`, asyncify) ne yapıyor?
   Oynatıcı paketleri yüklüyor, işlevi dışarıdan görünmüyor. Altyazı motoru **değil**
   (libass/ffmpeg izi yok).
3. `isUpscale` işaretinin sunucuda nasıl konulduğu ve "gerçek 4K dosya" ayrımının katalog genelinde
   geçerli olup olmadığı — tek bölümde gözlendi.
4. `yakamoz` (HLS framework) üretimde hangi yolda kullanılıyor? Web oynatıcısında HLS isteği
   görülmedi.
5. Kapalı kaynak olduğu için ölçülemeyen iç işleyişler (durum deposu ayrıntıları, hata
   raporlama); bu belge yalnız davranışı sözleşme kabul eder.

## Kaynaklar

- Canlı sayfa + ağ kaydı + paket analizi: 3 Ekim 2026, `openani.me/anime/one-piece/1/1180`
- Org: `github.com/OpenAnime` (20 repo) — README'ler ve lisans alanları
- npm: `@openanime/ass2esl` v1.1.2 (kayıt metadatası)
- İlgili bizim belgelerimiz: [04](04-oynatici-ve-kaynaklar.md) (kaynak politikası, köprü),
  [12](12-akis-koprusu.md) (relay temeli), [10](10-yol-haritasi.md) (sınırlar ve sıradaki işler)
