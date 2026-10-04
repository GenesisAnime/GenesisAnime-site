# 11 · Hesaplar, senkron ve bildirim hattı (uygulama notu)

> Durum: **kod tamam, gerçek Cloudflare hesabına dağıtıldı** (01.10.2026) ve uzak adrese karşı
> 46/46 doğrulandı: `https://genesisanime-api.genesisanime.workers.dev`. Site hesap servisi olmadan
> da eksiksiz çalışır (`NEXT_PUBLIC_API` boşken hiçbir istek atılmaz).
> Aynı Worker üzerinde **yönetici uçları** da koşar (`/tarama/*`): günlük link tarama döngüsünün
> politikası D1'de tutulur, site içindeki **`/yonetim/`** panelinden yönetilir (bkz. § Yönetim paneli).
> Tasarım gerekçeleri: [07-hesaplar-ve-api.md](07-hesaplar-ve-api.md).
> Parola/jeton kararı: [ADR-0008](kararlar/ADR-0008-workers-parola-ve-jeton.md).
> Kurulum komutları, hesap engelleri ve dağıtım ölçümleri: [06-yayin-ve-deploy.md](06-yayin-ve-deploy.md).

## Neden ayrı servis?

Ana site `output: 'export'` ile tamamen statik kalır (bkz. AGENTS §1.7). Hesaplar, senkron ve
bildirimler bu yüzden statik önyüzün **dışında**, ayrı bir Cloudflare Workers + D1 servisi
olarak uygulanır:

```
Statik site (GitHub Pages) ──► out/ (veri değişmez)
        │
        ├── /hesap/         giriş/kayıt + senkron durumu + KVKK (yeni)
        ├── /izle/          "Kaynak çalışmıyor" → src/lib/bildirim.ts kuyruğu
        └── (senkron döngüsü: src/lib/depo/api.ts, kök düzende HesapSenkron)
                                   │  CORS: yalnızca SITE_ORIGIN
                                   ▼
                         api/ (Cloudflare Worker)
                         ├── /bildirim        kullanıcı bildirimi → tarama önceliği
                         ├── /auth/*          kayıt, giriş, yenile, çıkış
                         ├── /me/durum        senkron blob'u (iyimser kilit)
                         └── /me, /me/veri    KVKK silme / veri indirme
                                   │
                                   ▼
                         D1: kullanici · oturum · durum · bildirim · oran
```

## Dosya haritası

| Dosya | Rol |
|---|---|
| `api/src/index.mjs` | Worker **girişi**: yönlendirme + tüm uçlar; yalnızca varsayılan `fetch` dışa aktarır |
| `api/src/yardimci.mjs` | Sabitler + saf yardımcılar (doğrulama, kripto, CORS, D1) — girişten ayrı, çünkü workerd giriş modülünde yalnızca handler dışa aktarımına izin verir (H-18) |
| `api/wrangler.toml` | Worker yapılandırması (D1 binding, CORS kaynağı, secret talimatları) |
| `api/migrations/0001.sql` | D1 şeması: hesap tarafı (5 tablo) |
| `api/migrations/0002-tarama.sql` | Tarama döngüsü politikası: `tarama_ayar` (tek satır), `tarama_kosu` (koşu geçmişi), `tarama_kalp` (makine kalp atışları) |
| `tools/bildirim-cek.mjs` | API'deki bildirimleri `tools/cache/bildirim.jsonl`'e aktarır |
| `tools/api-uctan-uca.mjs` | `npm run api:test`: çalışan API'ye gerçek isteklerle 45 adımlık uçtan uca duman testi |
| `tools/link-tara.mjs --bildirim` | Bildirilen URL'leri tarama kuyruğunun **önüne** alır |
| `src/lib/bildirim.ts` | İstemci kuyruğu (yerel-önce, çevrimdışı dayanıklı) |
| `src/lib/depo/api.ts` | Hesap + senkron sürücüsü (yerel depoyu değiştirmez, yanında çalışır) |
| `src/lib/depo/durum-birlestir.mjs` | Yerel/sunucu durum birleştirmesi (saf JS — test edilebilir) |
| `src/app/hesap/page.tsx` + `src/components/HesapIstemci.tsx` | Hesap ve KVKK arayüzü |
| `src/components/HesapSenkron.tsx` | Senkron döngüsünü kök düzende çalıştırır (görünmez) |
| `src/app/yonetim/page.tsx` + `src/components/YonetimIstemci.tsx` | **Yönetim paneli** (noindex; `robots.ts` ile dizine kapatıldı). Dilim/saat/açık-push ayarları, "şimdi çalıştır", koşu geçmişi, adım özeti/log kuyruğu |

## Uçlar

| Yöntem · yol | Gövde | Yanıt | Not |
|---|---|---|---|
| `POST /bildirim` | `{url, anime?, bolum?, tur?}` | `{ok}` · 201 | Şema doğrulaması + IP başına 30/gün + 24 saat tekilleştirme |
| `GET /bildirim?durum=&limit=` | — | `{kayitlar}` | `ADMIN_TOKEN` (Bearer) gerekir |
| `POST /bildirim/:id` | `{durum}` | `{ok}` | `incelendi` · `gecersiz` |
| `POST /auth/kayit` | `{eposta, parola}` | `{jeton, yenileme, eposta}` · 201 | IP başına 20/saat |
| `POST /auth/giris` | `{eposta, parola}` | aynı | Kullanıcı yoksa da özet hesaplanır (zamanlama sızıntısı) |
| `POST /auth/yenile` | `{yenileme}` | yeni jeton çifti | Yenileme jetonu tek kullanımlık (rotasyon) |
| `POST /auth/cikis` | `{yenileme}` | `{ok}` | Jeton + yenileme özetini siler |
| `GET /me/durum` | — | `{veri, surum}` | Bearer |
| `PUT /me/durum` | `{veri, surum}` | `{surum}` · 409 `cakisma` | İyimser kilit |
| `GET /me/veri` | — | `{eposta, durum, indirme}` | KVKK veri indirme |
| `DELETE /me` | — | `{silindi}` | Kullanıcı + oturum + durum satırları silinir |

Gövde sınırı 64 KB'dir (genel uçlar); `/me/durum` taşıma sınırı 1,09 MB'dir çünkü iç içe JSON
dizesi tırnak kaçışıyla ~2 katına şişebilir. Senkron blob'u **512 KB (UTF-8 bayt)** ile
sınırlıdır — D1 satır sınırı 2 MB olduğu için ölçü bayt cinsindendir (H-19). Hata yanıtları
`{ok:false, hata}` biçimindedir.

### Yönetim uçları (tarama döngüsü)

Hepsi `ADMIN_TOKEN` (Bearer) ister; yetkisiz istek 401, bilinmeyen yol 404 döner.

| Yöntem · yol | Gövde | Yanıt | Not |
|---|---|---|---|
| `GET /tarama/ayar` | — | `{ayar}` | `tarama_ayar` tek satırı (id=1) |
| `PUT /tarama/ayar` | `{aktif, dilim, saat, yayinla, push, hemen}` | `{ayar}` | Değerler normalize edilir (dilim 25…20.000; saat 0–23) |
| `GET /tarama/durum` | — | `{ayar, kosular, kalpler, sunucu_zaman}` | Panelin tek isteği: son 50 koşu + 5 kalp atışı |
| `POST /tarama/kosu` | `{dilim, sure_sn, sonuc, kapsam, not_metni}` | `{ok}` · 201 | Döngü her koşudan sonra yazar; 500 satırla sınırlı |
| `POST /tarama/kalp` | `{makine, surum, son_karar}` | `{ok}` | Makine uyanık sinyali ("panelde görünüyor ama iş durmuş" durumunu ayırt eder) |

> **Neden politika D1'de, iş yerelde?** `npm run veri` arşiv SQLite'ını okur ve o dosya depoda
değildir ([ADR-0004](kararlar/ADR-0004-veri-dizini.md)); 316 bin kaynağın rozet durumu tam da o
adımda üretilir. Ayrıntı ve zamanlayıcı kurulumu: [09](09-link-sagligi-otomasyonu.md) §10.

### Yönetim paneli (`/yonetim/`)

Statik derlemenin parçasıdır (sunucu tarafı yoktur); jeton **`localStorage`**'da saklanır ve
hiçbir yere gönderilmez, yalnızca Worker'a `Authorization` başlığında gider. `robots.ts`
`/yonetim/` yolunu tarayıcı botlarına kapatır ve sayfa `<meta name="robots" content="noindex">`
taşır — güvenlik jeton doğrulamasıdır, gizlilik değil.

Panolun gösterdikleri: bağlantı durumu (API sürümü), **kalp atışı kutusu** (son makine + "kaç
dakika önce" + son karar), özet satırı (son koşunun sonucu/makinesi/süresi), ayar formu
(aktif, dilim, saat, `yayinla`, `push`), **"Şimdi çalıştır"** (D1'de `hemen=1` yazar; yerel döngü
bir sonraki uyanışında koşar) ve koşu geçmişi (satır açılınca adım süreleri + tarama log kuyruğu).

Panelin kurduğu sözleşme ile döngünün uyguladığı karar aynı eşikleri paylaşır
(`TARAMA_DILIM_EN_AZ/EN_COK`); panel formu döngünün kabul etmeyeceği bir dilim göndermez.

## Kimlik doğrulama kararları

- **Parola:** PBKDF2-HMAC-SHA256, **100.000 iterasyon (platform tavanı)**, 16 bayt rastgele tuz,
  32 bayt özet. Saklanan biçim `iterasyon:base64(tuz):base64(özet)` — tuz hash içinde taşınır;
  tavanın üzerindeki eski kayıtlar üretimde yeniden hesaplanamayacağı için doğrulama hata
  fırlatmaz, reddeder (`false`).
  Workerd üretimde PBKDF2'de 100.000'in üzerini reddeder
  (`NotSupportedError: iteration counts above 100000 are not supported`) — yerel `wrangler dev`
  ise reddetmez; bu yüzden 210.000 ile bütün yerel testler geçerken üretimde kayıt/giriş 500
  dönüyordu (H-20, ilk gerçek deploy'da bulundu). Workers'ta argon2 yoktur (ADR-0008).
- **Jetonlar:** opak, rastgele (erişim 32 bayt / yenileme 48 bayt), D1'de yalnızca SHA-256
  özetli saklanır. Erişim 12 saat, yenileme 90 gün.
- **Çerez yok:** statik site ile Worker farklı kaynaklardadır; `SameSite=None` çerezi yerel
  HTTP geliştirmeyi kıracağı için taşıyıcı (Bearer) jeton seçildi. Jetonlar yalnızca
  `localStorage`'da tutulur; XSS yüzeyi statik sitede derleme zamanlı üretimle sınırlıdır.
- Bilinçli eksikler: e-posta doğrulama, parola sıfırlama, OAuth. Sıradaki iş olarak
  `docs/10`'da duruyor.

## Gizlilik (KVKK)

- **Ham IP hiçbir yerde tutulmaz.** Bildirim ve giriş oran sayaçlarında yalnızca
  `SHA-256(tuz|ip)` kullanılır (`IP_TUZ` secret'ı; tanımsızsa `JWT_SECRET`).
- Veri indirme: `/hesap/` → “Verilerimi indir” hem yerel (`localStorage`) hem sunucu kopyasını
  tek JSON dosyasında indirir.
- Hesap silme: `DELETE /me` sunucu kopyasını siler, ardından istemci yerel durumu temizler.
  Hesap yoksa yalnızca yerel temizleme düğmesi gösterilir.
- Bildirim kayıtları kişiye bağlanmaz (yalnızca tuzlu IP özeti); hesap silme bunları etkilemez,
  çünkü bunlar sitede kullanıcıya ait veriler değil kaynak sağlığı kanıtıdır.

## Yerel-önce senkron akışı

1. Kullanıcı giriş yapar → jetonlar `localStorage`'a yazılır.
2. `HesapSenkron` → `senkronBaslat()`: `GET /me/durum` çekilir.
3. `durumBirlestir(yerel, uzak)` — alan alan “en yeni kazanır”:
   ilerleme ve izlenenler `zaman` damgasına göre; liste slug başına en yeni; tercihlerde yerel
   kazanır (cihaz davranışı); “çalışmayan” URL'ler birleşim (en çok 500).
4. Birleşik durum yerel depoya yazılır ve `PUT /me/durum` ile sunucuya itilir.
5. Yerel değişiklikler (izleme listesi, ilerleme, tercihler) 3 saniyelik gecikmeyle itilir;
   sekme görünür olduğunda ve çevrimiçi olayında bir kez denenir.
6. Sürüm çakışmasında (409) sunucu yeniden çekilir, birleştirilir ve bir kez daha denenir.
7. Ağ yoksa hiçbir şey kaybolmaz: yerel depo tek gerçek kaynak olmaya devam eder.

## Kurulum ve canlı dağıtım (yapıldı)

Kurulum 01.10.2026'da gerçekleştirildi. Yeni hesaplarda çıkan iki engel (e-posta doğrulaması ve
workers.dev alt alan adının kaydı) ile çözümleri [06-yayin-ve-deploy.md](06-yayin-ve-deploy.md)
içindedir.

| Öğe | Canlı değer |
|---|---|
| Worker adresi | **https://genesisanime-api.genesisanime.workers.dev** |
| D1 veritabanı | `genesisanime` · `abde0636-74dd-4d0e-b9c6-12704d3b1f10` · bölge WEUR |
| Secret'lar | `JWT_SECRET`, `ADMIN_TOKEN`, `IP_TUZ` (panoda tutulmaz; `wrangler secret put` ile yönetilir) |
| CORS | `SITE_ORIGIN=https://genesisanime.github.io` — başka kaynak izinli değil |

```bash
cd api
npm install
npx wrangler d1 create genesisanime     # çıkan database_id'yi wrangler.toml'a yaz
npm run db:uzak                         # şemayı uygula
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_TOKEN     # tools/bildirim-cek.mjs bu jetonu kullanır
npx wrangler secret put IP_TUZ          # (isteğe bağlı) IP tuzu
npm run deploy
```

Site tarafı derleme değişkenleri:
`NEXT_PUBLIC_API=https://genesisanime-api.genesisanime.workers.dev` (hesap/senkron),
`NEXT_PUBLIC_BILDIRIM_API=https://genesisanime-api.genesisanime.workers.dev` (oynatıcı bildirimi).
Bu değerlerle derlenmiş `out/` yayına hazırdır; tarayıcıda uzak API'ye karşı kayıt → senkron →
bildirim → KVKK silme zinciri sınandı (geçici `CORS_EXTRA` ile; sonra izin kaldırıldı).

Uzak duman testi:

```bash
GENESIS_API_URL=https://genesisanime-api.genesisanime.workers.dev \
GENESIS_ADMIN_TOKEN=<ADMIN_TOKEN> \
npm run api:test -- --origin=https://genesisanime.github.io
```

## Bildirim hattı (uçtan uca)

1. Kullanıcı oynatıcıda “Kaynak çalışmıyor”a basar → `calismayanIsaretle()` kaynağı o cihazda
   gizler, `bildirimGonder()` kuyruğa yazar ve gönderir.
2. Worker şemayı doğrular, IP'yi tuzlar, oran sınırını uygular ve tekrarları eler.
3. `npm run link:bildirim` (`tools/bildirim-cek.mjs`) kayıtları `tools/cache/bildirim.jsonl`'e
   aktarır; geçersiz/yaşlı/tekrar satırlar süzülür.
4. `npm run link:tara -- --bildirim` bu URL'leri **karar değil öncelik** olarak kuyruğun önüne
   alır; durum yine somut HTTP kanıtıyla belirlenir (AGENTS §1.4b).
5. Yönetici `POST /bildirim/:id {durum:"incelendi"}` ile kaydı kapatır.

## Yerel uçtan uca test (wrangler dev + yerel D1)

Gerçek Worker çalışma zamanı + gerçek D1 şemasıyla tüm zincir sunanır. Gereken: `api/` içinde
`npm install` (wrangler **^4.145**; 3.x uyumluluk tarihini 2025-07-18'e düşürüyordu).

```bash
cd api
npm run db:yerel                       # şemayı .wrangler/state içindeki yerel D1'e uygula
printf 'JWT_SECRET=<rastgele>\nADMIN_TOKEN=<rastgele>\nIP_TUZ=<rastgele>\n' > .dev.vars
npx wrangler dev --port 8789 --var CORS_EXTRA:http://127.0.0.1:8000,http://localhost:3000
# başka terminalde:
cd ..
GENESIS_API_URL=http://127.0.0.1:8789 GENESIS_ADMIN_TOKEN=<ADMIN_TOKEN> npm run api:test
GENESIS_API_URL=http://127.0.0.1:8789 GENESIS_ADMIN_TOKEN=<ADMIN_TOKEN> npm run link:bildirim -- --kuru
```

`.dev.vars` ve `.wrangler/` sürüm kontrolü dışındadır (`.gitignore`). `npm run api:test` bayrakları:
`--api=`, `--token=`, `--origin=` ve `--oran` (gerçek 30/gün sınırını 31 istekle zorlar; kayıtlar
sonunda yönetici olarak `gecersiz` işaretlenir). Yerelde `CF-Connecting-IP` gelmediği için IP
anahtarı sabittir; bu normaldir. İzole yerel state temizliği için:
`cd api && npx wrangler d1 execute genesisanime --local --command "DELETE FROM oran"`.

Kapsanan zincir (45 adım): sağlık ve yönlendirme → CORS (izinli/izinsiz) → bildirim ekleme,
tekilleştirme, yönetici kuyruğu, durum güncelleme, oran sınırı → kayıt (normalizasyon, çift kayıt),
giriş hataları → senkron okuma/yazma, 409 çakışma, 413 blob → yenileme rotasyonu ve çıkışın
jetonları geçersizleştirmesi → KVKK veri indirme ve hesap silme (silinen e-posta yeniden kayıt
olabilir). Tarayıcı tarafı da (Next dev + `NEXT_PUBLIC_API` + `NEXT_PUBLIC_BILDIRIM_API`) aynı
yerel API'ye karşı sınandı: kayıt → oynatıcıda “İzledim”/“Kaynak çalışmıyor” → senkron itmesi
(`surum` artışı, ilerleme/tercih/çalışmayan alanları sunucuda), kuyrukta kalan bildirimin `online`
olayında yeniden denenip kuyruğa düşmesi, `link:bildirim` ile JSONL'e aktarım + tekilleştirme,
KVKK hesap silme (tarayıcıdan) sonrası girişin 401 dönmesi.

## Testler

`npm test` içinde üç dosya bu hattı kapsar (ağsız, D1'siz):

- `tools/testler/bildirim.test.mjs` (24): kuyruk süzgeçleri, URL/host doğrulaması (IP ve
  localhost reddi), host'un URL'den türetilmesi, yönlendirme tablosu, PBKDF2 gidiş-dönüşü,
  sabit süreli karşılaştırma, IP tuzlama, CORS denetimi, admin jetonu, oran penceresi,
  tekilleştirme (sentetik sahte D1 ile), **tarama uçlarının yol çözümü + ayar/koşu
  normalizasyonu** (dilim ve saat sınırları, bilinmeyen alanlar atılır) + H-18/H-19/H-20
  regresyonları (giriş modülü yalnızca handler dışa aktarır; blob taşıma sınırı blob sınırını
  gölgelemez; iterasyon sayısı platform tavanını aşmaz ve tavan üstü kayıtlar hata
  fırlatmadan reddedilir).
- `tools/testler/hesap.test.mjs` (7): birleştirme kuralları (en yeni kazanır, yerel tercih,
  liste birleşimi, 500 sınırı, boş sunucu kopyasının veri silmemesi).
- `tools/testler/dongu.test.mjs` (8): döngü kararı — gün anahtarının yerel saatte hesaplanması,
  panel kapalıyken koşmama, saat gelmeden koşmama, günde bir koşma, başarısız koşudan sonra
  bekleme, `hemen`/`--zorla` bayrakları, ayar okunamazsa güvenli davranış.

## Bilinen sınırlamalar

- Uçtan uca test üç katmanda yapıldı: `wrangler dev` + yerel D1, gerçek Worker + uzak D1
  (`api:test`, 45/45) ve tarayıcı (derlenmiş `out/`, uzak API). Kalan tek operasyonel iş yayına
  **push** (GitHub Pages) — o kullanıcı kararıdır.
- Kayıt/giriş tek istekte ~28 ms CPU harcar (ölçüldü); PBKDF2 100.000 iterasyon platform tavanıdır
  ve ücretsiz planın 10 ms CPU bütçesine sığmaz — hesabın Workers Paid tarafında olduğu ölçümle
  görüldü, panelden teyit edilmeli.
- E-posta doğrulama ve parola sıfırlama yok (istenirse ayrı iş).
- Senkron blob'u büyüdükçe (çok sayıda anime) 512 KB sınırına yaklaşabilir; ölçüm yapılmadı.
- Üretim D1'de henüz yalnızca test kayıtları var: e2e'nin bıraktığı bildirim satırları
  (`incelendi`/`gecersiz`) ve temizlenmiş oran sayaçları. Kullanıcı verisi yok.
