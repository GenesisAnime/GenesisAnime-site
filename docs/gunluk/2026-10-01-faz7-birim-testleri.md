# Günlük · 2026-10-01 · Faz 7 — Birim test koşucusu (bağımlılıksız)

## 1. İstenen

> “`tools/` altındaki `zamanOku`, `sicilDenetim` ve host sınıflandırma mantığı için bağımlılıksız
> birim test koşucusu ekle; H-14 gibi tarih ayrıştırma hataları derleme öncesi yakalanśın.”

## 2. Yaklaşım: mantığı kopyalamadan test etmek

Test edilecek fonksiyonlar `tools/link-tara.mjs` içinde **özel**ti ve dosya bir CLI betiğiydi
(argv ayrıştırma, durum dosyasını append için açma, DB okuma…). İki seçenek vardı:

1. Mantığı `tools/lib/` altına taşımak — tek kaynak olur ama ~250 satırı elle taşımak riskli.
2. `link-tara.mjs`'i **hem CLI hem modül** yapmak.

2. yol seçildi (tek kaynak, kopya yok, küçük diff):

- `DOGRUDAN` ölçütü eklendi: `node`'un çalıştırdığı betik bu modülün kendisi mi?
- Argüman ayrıştırma ve son tarama akışı yalnızca `DOGRUDAN` iken koşar.
- Modül olarak içe alındığında durum dosyasına **yazma tanıtıcısı açılmaz** (testler proje durumuna
  dokunmaz; yalnızca okuma yapılır).
- Saf fonksiyonlar dışa açıldı: `zamanMetni`, `zamanOku`, `hedefBelirle`, `KURALLAR`, `genelKural`,
  `siniflandir`, `ok`/`olu`/`engelli`/`belirsiz`.
- `sicilDenetimi` ikiye ayrıldı: `sicilArtefaktlari(kayitlar, host)` (saf çekirdek, test edilebilir)
  + dosyayı okuyan ince sarmalayıcı.

Test koşucusu: **Node'un yerleşik `node:test` + `node:assert`** — ek bağımlılık yok
(`npm test` → `node --no-warnings --test "tools/testler/*.test.mjs"`). Ağa, SQLite'a ve arşiv
verisine dokunulmaz; tüm HTTP yanıtları sentetik kurulur.

## 3. Test kapsamı (`tools/testler/tarama.test.mjs`)

| Grup | Örnek doğrulamalar |
|---|---|
| `zamanOku` / `zamanMetni` | H-14: yıl/ay/gün bileşenleri kaymaz; gidiş-dönüş kayıpsız; bugün yazılan kayıt taze (<2 sn); bozuk girdi `null`; ISO yedeği |
| `hostAl` | küçük harf, `www.` atma, port, alt alan, `href.li` sarmalı, bozuk adres |
| `hedefBelirle` | href.li açar · mail.ru iki biçim (meta + `/videos/<yol>.json`) · Yandex Disk · pixeldrain köprüsü · Dailymotion oEmbed · bilinmeyen host aynen |
| `genelKural` | 404/410 ölü · 451 engelli · 403 yalnızca bot imzasıyla soğuma sebebi · 429/5xx belirsiz · ENOTFOUND ölü, ECONNRESET belirsiz · oynatıcı işareti “ok” · kısa/kanıtsız yanıt “belirsiz” |
| Host kuralları | sibnet · mail.ru · ok.ru (silinmiş ≠ kısıtlı) · Drive · uqload · mp4upload · voe (DDoS) · VK · MEGA · Yandex · Dailymotion · pixeldrain |
| Regresyon çivileri | H-10 (nihai host) · H-11 (VK'da dosya listesi yok ≠ ölü) · H-12 (MEGA asla “ok”) · H-8 (`"çalışıyor"`/`"ok"` eşlemesi, geçici dosyayla) |
| `KURALLAR` tablosu | isimli, host listesi dolu, **host çakışması yok** (yeni kural eskisini gölgeleyemez) |
| `sicilArtefaktlari` | 20 ardışık “ölü” sonrası damga · 30 dk boşluk = yeni oturum · canlı kayıt sayacı sıfırlar · başka host karışmaz · eksik zaman damgası oturumu bölmez |

## 4. Ölçüm

```
$ npm test
ℹ tests 32   ℹ pass 32   ℹ fail 0   ℹ duration_ms 578
```

Testin gerçekten hata yakaladığı ayrıca ölçüldü (testin ayırt ediciliği):

```
$ node -e "…eski zamanOku mantığı vs yeni…"
eski kod doğru sonucu veriyor mu? false      # H-14 öncesi: 01.10.2026 → 10 Ocak 2026
yeni kod doğru sonucu veriyor mu?  true
```

Yani H-14 geri gelirse `npm test` derlemeden önce kırmızıya döner.

## 5. Doğrulama

- `npm test` → 32/32 (~0,6 sn)
- `npm run typecheck` → 0 hata
- `npm run link:test` → 20/20 (canlı URL sınaması; refactor sonrası sınıflandırıcı aynı davranıyor)
- `npm run link:tara -- --kuru --dilim=3` → plan yine kuruluyor (CLI akışı bozulmadı)
- `npm run build` → 6.107 anime sayfası, `EBUSY` yok (tarayıcı sunucusu kapatıldıktan sonra)

Ayrıca `AGENTS.md` doğrulama kapısına `npm test` eklendi; docs/05'e birim testleri bölümü ve H-14
kaydı yazıldı; README komut tablosu güncellendi.

## 6. Sonraki adım

- Veri bütünlüğü testleri (`katalog.json` ↔ anime dosya sayısı, ölü URL sızıntısı) aynı koşucuya
  eklenebilir; `tools/` testleri saf fonksiyon kaldığı sürece ağsız kalır.
- Kalan tarama havuzu (90.534 → ölçülebilir) `--dilim=17000 --host-es=6 --host-aralik=150` ile
  devam ediyor: ölçüm 10.181 istekte sıfır engel, ~19 istek/sn (varsayılanın 1,64 katı).
