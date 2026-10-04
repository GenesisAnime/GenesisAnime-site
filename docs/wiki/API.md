# API

Statik siteye dokunmadan hesapları, senkronu, “kaynak çalışmıyor” bildirimlerini ve link tarama
panelini taşıyan servis. **Cloudflare Workers + D1**, sıfır npm bağımlılığı, WebCrypto kullanır.

- **Adres:** https://genesisanime-api.genesisanime.workers.dev
- **Kaynak kodu:** [`api/`](https://github.com/GenesisAnime/GenesisAnime-site/tree/main/api)
- **Sitede okunur hâli:** https://genesisanime.github.io/GenesisAnime-site/api-dokumani/

> Belgenin koddan kopmaması otomatik testle garanti edilir
> (`tools/testler/api-dokumani.test.mjs`): belgedeki her satır gerçekten yönlendiriliyor mu ve uç
> listesi `api/src/index.mjs` ile birebir aynı mı.

## Genel uçlar

| Yöntem · yol | Gövde | Yanıt | Not |
|---|---|---|---|
| `GET /` | — | `{ok, ad, surum}` | Sürüm bilgisi |
| `GET /saglik` | — | `{ok, zaman}` | Servis ayakta mı? |
| `POST /bildirim` | `{url, anime?, bolum?, tur?}` | `{ok}` · 201 | IP başına 30/gün · 24 saat tekilleştirme · host izin listesi |

`tur`: `calismiyor` · `eksik` · `yanlis-bolum` · `donuk`. Aynı URL tekrar gönderilirse
`{ok:true, tekrar:true}` döner — bildirimi tekrarlamak zararsızdır.

## Hesap ve senkron

| Yöntem · yol | Gövde | Yanıt | Not |
|---|---|---|---|
| `POST /auth/kayit` | `{eposta, parola}` | `{jeton, yenileme, eposta}` · 201 | IP başına 20/saat · parola ≥ 10 karakter |
| `POST /auth/giris` | `{eposta, parola}` | aynı | Kullanıcı yoksa da özet hesaplanır |
| `POST /auth/yenile` | `{yenileme}` | yeni jeton çifti | Yenileme jetonu tek kullanımlık (90 gün) |
| `POST /auth/cikis` | `{yenileme}` | `{ok}` | Oturumu kapatır |
| `GET /me/durum` | — (Bearer) | `{veri, surum}` | Senkron blob’u okur |
| `PUT /me/durum` | `{veri, surum}` | `{surum}` · 409 `cakisma` | İyimser kilit · blob ≤ 512 KB |
| `GET /me/veri` | — (Bearer) | `{eposta, durum, indirme}` | KVKK veri indirme |
| `DELETE /me` | — (Bearer) | `{silindi}` | Hesap + oturumlar + durum silinir |

Erişim jetonu **12 saat**, yenileme jetonu **90 gün** geçerlidir.

## Yönetici uçları (`ADMIN_TOKEN`)

| Yöntem · yol | Gövde | Yanıt |
|---|---|---|
| `GET /bildirim?durum=&limit=` | — | `{kayitlar}` |
| `POST /bildirim/:id` | `{durum}` | `{ok}` |
| `GET /tarama/ayar` | — | `{ayar}` |
| `PUT /tarama/ayar` | `{aktif, dilim, saat, yayinla, push, hemen}` | `{ayar}` |
| `GET /tarama/durum` | — | `{ayar, kosular, kalpler, sunucu_zaman}` |
| `POST /tarama/kosu` | `{dilim, sure_sn, sonuc, kapsam, not_metni}` | `{ok}` · 201 |
| `POST /tarama/kalp` | `{makine, karar}` | `{ok}` |

## CORS

Üretimde yalnızca **https://genesisanime.github.io** kaynağına açıktır (`SITE_ORIGIN`). Başka bir site bu
API’yi ziyaretçinin tarayıcısından çağıramaz; sunucudan sunucuya istekler CORS’a takılmaz.

Yerelde panel/arayüz denemek için geçici izin (`wrangler deploy --var CORS_EXTRA:...`) verilebilir —
**iş bitince izinsiz yeniden dağıtılmalıdır**. Doğrulama: `Origin` başlıklı iki `curl` (izinli
kaynakta `Access-Control-Allow-Origin` olmalı, diğerinde **olmamalı**).

## Hata kodları

| Kod | `hata` | Anlamı |
|---|---|---|
| 400 | `govde-gecersiz`, `url-gecersiz`, `eposta-gecersiz`, `parola-gecersiz` … | Şema doğrulanamadı |
| 401 | `yetkisiz` | Jeton yok/süresi geçmiş |
| 404 | `yol-yok` | Bilinmeyen yol |
| 405 | `yontem-yok` | Yol var, yöntem yok |
| 409 | `cakisma` | Senkron sürümü eski |
| 429 | `cok-fazla-istek` | Oran sınırı |
| 500 | `sunucu-hatasi` | Beklenmeyen hata |

## Örnekler

```bash
API=https://genesisanime-api.genesisanime.workers.dev

curl -s $API/saglik

curl -s -X POST $API/bildirim -H 'Content-Type: application/json' \
  -d '{"url":"https://ornek.com/bolum/1","anime":"naruto","bolum":"1","tur":"calismiyor"}'

curl -s -X POST $API/auth/kayit -H 'Content-Type: application/json' \
  -d '{"eposta":"ornek@ornek.com","parola":"en-az-on-karakter"}'

curl -s $API/me/durum -H "Authorization: Bearer $TOKEN"
curl -s $API/tarama/durum -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Gizlilik

IP adresi **saklanmaz**; oran sınırı ve tekilleştirme yalnızca tuzlu SHA-256 özetiyle çalışır.
Parolalar PBKDF2-HMAC-SHA256 ile (platform tavanı 100.000 iterasyon) özetlenir; jetonlar da
yalnızca özet olarak durur. Site hesap açmadan tamamen çalışır.
