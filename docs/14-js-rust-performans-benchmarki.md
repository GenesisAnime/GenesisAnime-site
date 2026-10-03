# 14 · JavaScript–Rust Performans Benchmark Planı

**Durum:** Plan; benchmark koşulmadı, üretim Worker'ına dokunulmadı.

**Amaç:** GenesisAnime akış Worker'ının JavaScript sürümünü Cloudflare Workers üzerinde çalışan Rust/Wasm sürümüyle karşılaştırıp, Rust'a geçişin ölçülebilir bir fayda sağlayıp sağlamadığını belirlemek.

## 1. Karar sorusu ve hipotez

Soru “Rust genel olarak daha hızlı mı?” değil; **bu Worker'ın aynı sözleşmeyi yerine getiren Rust sürümü, gerçek yükümüzde anlamlı bir kazanım sağlıyor mu ve bu kazanım build, başlangıç, bellek, hata ayıklama ve bakım maliyetini karşılıyor mu?**

Ön hipotez: `/akis/coz` için duvar saatinin çoğu harici sağlayıcıya HTTP beklemesidir; `/akis/aktar` için süre medya CDN'i ile istemci arasındaki aktarım ve istemci hızıyla belirlenir. Bu işlerde dil değişikliği p50/p95 toplam süreyi tek başına anlamlı ölçüde düşürmeyebilir. Rust'ın olası farkı önce statik HTML tarama, imza/URL doğrulama ve JSON/regex benzeri CPU işlerinde aranmalıdır. Bu hipotez test edilecek, sonuç gibi sunulmayacaktır.

## 2. Kapsam ve karşılaştırılacak uygulamalar

İki uygulama da aynı Cloudflare Workers platformunda, aynı API davranışı ve aynı upstream fixture'larıyla koşmalıdır:

- **JS referansı:** mevcut `api/src/akis.mjs` ve Worker yönlendiricisi.
- **Rust adayı:** `workers-rs` ile derlenen, aynı endpointleri ve güvenlik kararlarını uygulayan Rust/Wasm Worker. Rust karşılaştırması native sunucuya karşı değil, Workers runtime'daki Rust/Wasm'a karşı yapılır.
- **Kapsam:** `/akis/coz` saf çözümleme işleri ve ölçülü resolver uçtan uca çağrısı; `/akis/aktar` Range destekli stream relay.
- **Kapsam dışı:** tüm API'yi yeniden yazmak, sağlayıcıların korumalarını atlatmak, sınırsız/açık proxy kurmak, performans uğruna imza/host allowlist'ini gevşetmek.

İlk aşamada Rust portu yalnız aday benchmark dalı/ayrı Worker olarak kalır. Benchmark sonucu ve ayrıca operatör kararı olmadan üretim kodu, rota, D1, DNS, secret veya deploy değiştirilmez.

## 3. Mevcut ölçümler — yalnızca bağlam

Önceden kayda alınmış değerler yeni benchmark sonucu değildir; protokolün büyüklükleri ve fixture'ları seçmesine yardımcı olur:

| İş | Kayıtlı ölçüm | Yorum |
|---|---:|---|
| Mail.ru embed → metadata çözümü | edge'de yaklaşık 2,8 sn | Önceki ölçüm; provider yanıtını bekler, CPU süresi değildir. |
| Mail.ru akış aktarımı | 206, açık aralıkta yaklaşık 8 MB/sn, yaklaşık 170 MB örnek | Eski uçtan uca ölçüm; CDN/bağlantı koşullarına bağlı, JS–Rust kıyaslaması değil. |
| İmzalı Mail.ru kaynakları | bir gün içinde farklı MP4 boyutları ve CDN hostları | Resolver ve Range davranışı her örnek için doğrulanmalı. |
| Sibnet | Worker isteklerine 403 “administrative rules” | Benchmark'la giderilecek performans sorunu değil; 403 atlatma hedeflenmez. |
| Canlı kapsam endpoint'i | Son kontrolde `/akis/kapsam` 404 | Canlı Worker eski sürümde. Bu durum yeni kapsamın üretimde çalıştığı iddiasını engeller; plan staging/izole Worker gerektirir. |

Kaynak kayıtları: [akış ölçüm raporu](olcum/akis-2026-10-02.json), [akış köprüsü](12-akis-koprusu.md), [OpenAnime/player analizi](13-openani-oynatici-analizi.md).

## 4. İş yükü matrisi

Her koşuda giriş seti ve beklenen çıktılar sabitlenir. JS ve Rust aynı JSON/HTML fixture'larını kullanır; üretim anime kaynakları üzerinde **toplu** çözümleme yapılmaz.

| ID | İş yükü | Ne izole edilir? | Ana ölçüt |
|---|---|---|---|
| C1 | `akisAdaylari`: küçük/orta/büyük statik HTML'den MP4/WebM adaylarını bulma | Tarama/ayrıştırma CPU'su | ns/işlem, CPU ms/istek, doğruluk |
| C2 | `aktarimIzni` ve `imzaliMi`: geçerli, imzasız, yanlış host, sahte suffix, query/path token örnekleri | URL parse + güvenlik denetimi | ns/işlem, CPU ms/istek, yanlış kabul/red sayısı |
| C3 | `metaAkisi` + video kimliği çıkarımı: gerçek biçimden alınmış, gizli tokenları maskelenmiş fixture | JSON/metin tarama CPU'su | ns/işlem, CPU ms/istek, sonuç eşitliği |
| E1 | `/akis/coz` → deterministik yerel fixture upstream (embed + metadata veya tek HTML) | Handler + upstream fetch beklemesi | p50/p95/p99 wall time, CPU ms, upstream sayısı |
| E2 | `/akis/coz` cache-hit ve cache-miss ayrı koşular | Resolver CPU'su ve cache etkisi | Hit/miss p50/p95; CPU ve gerçek subrequest sayısı |
| S1 | `/akis/aktar` küçük Range (`0-2047`) ve seek Range | Başlık/Range/stream yolu | Time-to-first-byte, CPU ms, byte doğruluğu |
| S2 | `/akis/aktar` akışlı 1/16/64 MiB fixture, istemci hız sınırıyla | Büyük gövdeyi buffer etmeden aktarım ve bellek | MB/s, TTFB, tepe bellek, kesinti/byte kaybı |
| P1 | Aynı fixture'larda tam `/akis/coz` + aktarım + tarayıcı `<video>` | Ürün davranışı | Başarı oranı, ilk kare/metadata süresi, seek doğruluğu |

C1–C3'te döngü uzunluğu sabit ve yeterince büyük seçilir; test harness toplam süreyi ölçer ve iterasyon sayısına böler. Her implementasyonda aynı JIT/Wasm ısınma politikası uygulanır: ilk çağrı (cold) ayrı kaydedilir; warm çağrılar ayrı toplanır. Cold verisi warm ortalamaya karıştırılmaz.

## 5. Sabit test verisi ve doğruluk kapısı

- HTML fixture'ları; Mail.ru metadata örnekleri ve generic statik player sayfalarının yapısını temsil eder. Token, kişisel veri ve süresi dolmuş imza rapora açık yazılmaz; URL alanları raporda redakte edilir.
- Kategori başına hem olumlu hem olumsuz örnek: MP4, WebM, URL-encoded query, HTML entity/escape, göreli URL, imzasız, HTTP, yanlış CDN, benzer ama izin dışı host, bozuk HTML, boş içerik.
- Resolver çıktısı normalleştirilip karşılaştırılır: `ok`, `hata`, media türü, canonical host, imza bitiş sınıfı, aday sırası. Gerçek sır/expiry/token değerleri birebir eşitliği bozuyorsa fixture bazında normalize edilir.
- Aktarım testinde upstream fixture bilinen byte dizisini üretir. Her Range için status (`206`), `Content-Range`, `Content-Length`, içerik baytları ve iptal davranışı doğrulanır. 64 MiB gövde belleğe topluca alınmaz.
- **Go/no-go:** herhangi bir yanlış allowlist kabulü, signature atlama, yanlış Range, bayt bozulması veya JS sözleşmesinden fark varsa performans skoru hesaplanmış olsa bile aday başarısızdır.

## 6. Çalışma ortamı ve adil deney tasarımı

### Yerel, tekrar üretilebilir katman

1. Aynı Node/Wrangler sürümleri, makine, OS, runtime ayarları ve fixture server kullanılır.
2. JS ve Rust test Worker'ları ayrı process/port ve ayrı build çıktısı alır. Aynı request gövdesi/başlıkları, aynı concurrency ve aynı upstream fixture yanıtları kullanılır.
3. Testler rastgeleleştirilmiş bloklar halinde A/B/A/B sırasıyla yürütülür; ilk varyantın ısınması diğerine avantaj yaratmamalı. Saf CPU microbenchmark'ta en az 5 bağımsız blok ve blok başına en az 1.000 warm iterasyon alınır; Worker HTTP workload'larında her varyant için en az 500 warm istek ve en az 5 blok hedeflenir. Relay'de gövde boyutu maliyeti ayrıca belirtilir: 1 MiB için 20, 16 MiB için 10 ve 64 MiB için 3 ardışık tekrar yeterlidir; 1 MiB gövdeyle concurrency 1/4/16 denenir. Bu sayılar her run'da yazılır; ağır koşuda daha az örnek alınırsa p95 kararı verilmez.
4. Geliştirici makinesinde eşzamanlı build, test, video oynatma ve diğer ağır iş yükleri kapatılır. Ölçüm makinesi, OS/Node/Wrangler/Rust/cargo/worker-build sürümleri rapora yazılır.

### İzole Cloudflare staging katmanı

- Uzak sonuç için staging hesabı/zone veya birbirinden tamamen izole cache namespace gerekir. JS ve Rust varyantları ayrı isimli Worker olsa da aynı zone'da `caches.default` paylaşılabilir: **cache anahtarları varyant bazında ayrılmalı veya ayrı zone/hesap kullanılmalı**. Her cache miss yanıtındaki `aktarim` URL'si aynı varyant Worker'ına gitmeli; A'nın cache nesnesi B'ye veya üretime sızmamalıdır.
- Production Worker, üretim D1'i, gerçek kullanıcı trafiği ve mevcut production cache benchmark'a dahil edilmez. Üretim provider'ına her deneme request'i gönderilmez.
- Uzak CPU time/Wall time/başlangıç süresi/bundle boyutu Cloudflare'ın kendi gözlem verilerinden ve deployment çıktısından alınır; yerel `Date.now()` tek başına CPU ölçümü sayılmaz.
- Canary veya canlı deploy ancak ayrıca açıkça istenirse ve ayrı onayla; bu plan hiçbir deploy'u yetkilendirmez.

## 7. Cache, concurrency ve ağ kontrolü

- **Cache-hit:** iki varyantta aynı deterministik sonuç önceden hazırlanır, fakat cache namespace'leri ayrıdır. Hit oranı %100 doğrulanır ve upstream çağrısı sayacı sıfır olmalıdır.
- **Cache-miss:** aynı sahte upstream yanıtı; iki adım resolver'da upstream istek sayısı eşit olmalıdır. Provider'ın canlı gecikmesi burada ölçülmez.
- **Ağlı staging deneyi:** yalnız düşük sayıda, önceden seçilmiş ve izinli test örneği. Her A/B çifti yakın zaman aralığında koşar; durum kodu ve gövde sınıfı eşleşmeyen çift latency kıyasına alınmaz, farkı ayrıca raporlanır.
- Concurrency seti: resolver ve küçük fixture isteklerinde 1, 4, 16 eşzamanlı çağrı; relay concurrency denemelerinde yalnızca 1 MiB sentetik gövde. 16/64 MiB relay fixture'ları sırayla çalıştırılır. Bir sağlayıcıya yüksek hızla istek yağdırılmaz; hız sınırı/429/403 görülürse o hostta koşu durdurulur ve sonuç “kısıtlandı” kaydedilir.
- Zaman aşımı, bağlantı kopması, client abort ve yavaş okuyucu fixture'ları dahil edilir. Aktarım gövdesinin buffer edilmesi bellek avantajı gibi puanlanmaz; doğruluk kapısında reddedilir.

## 8. Toplanacak metrikler

### Her varyant ve workload için

- İlk/cold invocation ile warm p50, p95, p99 wall time ve medyan; ortalama tek başına yeterli değildir.
- Cloudflare CPU time/invocation ve CPU dağılımı; bekleme süresi CPU süresiyle karıştırılmaz.
- TTFB, toplam wall time, aktarılmış byte, MB/s, Range doğruluğu, hata/timeout/429/403 sayısı.
- Başarı oranı ve eşdeğer sonuç oranı; fixture upstream request sayısı ve cache-hit/miss sayısı.
- Worker başlangıç süresi, üretilen bundle/Wasm boyutu, build süresi, peak memory (ölçülebilen runtime/local katmanında).
- Sürüm/commit hash, makine ve platform bilgileri, Node/Wrangler/Rust/cargo/worker-build sürümü, build bayrakları ve fixture checksum'ları.

**Temel rapor birimi:** p50/p95 CPU ms/istek; p50/p95 wall ms/istek; bytes/sec ve başlatma süresi ayrı. Bir sayı “performans” diye tek başına verilmeyecek.

## 9. Koşu aşamaları ve durdurma kapıları

1. **Aşama 0 — hazırlık:** mevcut JS testlerini ve fixture doğruluğunu dondur; JS'in birim testleri referans olsun. Rust adayının aynı sözleşme testini geçmesi zorunlu.
2. **Aşama 1 — CPU microbench (C1–C3):** yerelde 5 bloktan başla. Rust saf CPU işinde kazanım göstermiyorsa, ağ/relay benchmark'ına port geliştirme maliyetini büyütmeden önce karar ver.
3. **Aşama 2 — Worker fixture e2e (E1–E2):** staging/yerel fixture upstream. CPU ile wall time ve cache hit/miss ayrıştırılır.
4. **Aşama 3 — stream relay (S1–S2):** sabit byte fixture'ı, streaming ve abort testi. Büyük video yerine 1/16/64 MiB üretilmiş içerik kullan; production video indirme/tekrar oynatma yok.
5. **Aşama 4 — sınırlı provider smoke (isteğe bağlı):** yalnız izinli, az sayıda fixture kaynağı ve düşük istek adediyle; gerçek sağlayıcıdaki policy, 403 veya bot duvarı benchmark'la aşılmaya çalışılmaz.
6. **Aşama 5 — karar:** tüm sonuçları iki veya daha fazla tekrarlı oturumda doğrula. Tek bir “en hızlı koşu” karar için kullanılmaz.

Herhangi bir fark doğruluk/güvenlik kapısını bozarsa, varyantın ölçümleri rapora “karşılaştırılamaz” olarak yazılır. Upstream throttling, platform yoğunluğu veya farklı byte sayısı görülürse latency kazancı iddia edilmez.

## 10. Geçiş için karar eşiği

Rust'a **tam geçiş** yalnızca aşağıdakilerin tümü doğruysa değerlendirilir:

1. Bütün resolver, allowlist, Range, CORS, hata ve cache sözleşmesi testleri eşdeğer.
2. İki bağımsız staging oturumunda sıcak CPU maliyetinde en az **%30 düşüş** veya p95 CPU'da en az **2× iyileşme** ölçülür; yüzde ve mutlak ms birlikte raporlanır.
3. Uçtan uca wall p95 en az %15 iyileşir **veya** CPU sınırı/başarı oranı gibi somut operasyonel darboğaz düzelir. Yalnız CPU microbench kazanımı, kullanıcı deneyimi hızlandı demek değildir.
4. Cold start, startup time ve bundle, bellek, build/CI ve hata ayıklama maliyetleri kabul edilebilir; cold start veya p95 latency %10'dan fazla kötüleşirse gerekçeli istisna gerekir.
5. Aktarımda byte throughput/TTFB anlamlı ölçüde gerilemez; relay zaten ağ sınırlıysa Rust portu relay performans kazanımı diye sunulmaz.

Eşikler karşılanmazsa mevcut JavaScript korunur. Kısmi Rust modülü ancak saf CPU işi tek başına belirgin darboğazsa ayrı araştırma olur; JS–Wasm çağrı/serileştirme maliyeti de aynı benchmark'a dahil edilir.

## 11. Sonuç raporu şablonu

| Workload | JS p50/p95 CPU ms | Rust p50/p95 CPU ms | JS p50/p95 wall ms | Rust p50/p95 wall ms | bytes/s / TTFB | Hata oranı | Karar |
|---|---:|---:|---:|---:|---:|---:|---|
| C1 – statik HTML taraması | — | — | — | — | — | — | — |
| C2 – allowlist/imza | — | — | — | — | — | — | — |
| C3 – Mail metadata parsing | — | — | — | — | — | — | — |
| E1 – resolver cache miss | — | — | — | — | — | — | — |
| E2 – resolver cache hit | — | — | — | — | — | — | — |
| S1/S2 – Range/stream | — | — | — | — | — | — | — |

Raporun başına commit hash, runtime/toolchain, makine, staging bölgesi, warm/cold koşulu, blok/örnek sayısı, fixture checksum ve cache izolasyon yöntemi yazılır. Sonuç kısmı “hangi iş yükünde, ne kadar ve hangi kaynakla sınırlıydı?” sorusunu yanıtlar; ölçülmeyen performans iddiası içermez.

## 12. Platform dayanakları

Cloudflare, Rust Worker desteğini `workers-rs` ve wasm-bindgen/JS glue ile tarif ediyor; Rust/Wasm'ın JS Worker ile aynı implementasyon/ABI olmadığını ve build/başlangıç etkisinin ayrıca ölçülmesi gerektiğini belirtiyor. Resmi platform limitleri CPU süresini (network wait'ten ayrı), 128 MB isolate belleğini, 1 saniye startup limitini ve Worker bundle limitini listeliyor. Değerler plana bakılırken değişebileceğinden benchmark başında güncel doküman tekrar kontrol edilmeli.

- [Cloudflare Workers — Rust desteği](https://developers.cloudflare.com/workers/languages/rust/)
- [Cloudflare Workers — platform limitleri](https://developers.cloudflare.com/workers/platform/limits/)
