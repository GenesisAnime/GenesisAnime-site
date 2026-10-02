# 03 · Tasarım Sistemi

> Son güncelleme: 2026-10-01 · Tek kaynak: `src/app/globals.css`

## Yön

Netflix'in "önce vitrin" mantığı + Crunchyroll'un yoğun katalog hissi, koyu tema ve mor/magenta
vurguyla. Harici CSS çatısı yok; tasarım belirteçleri ve bileşen sınıfları tek dosyada tanımlı
(gerekçe: ADR-0002).

## Belirteçler (`:root`)

| Belirteç | Değer | Kullanım |
|---|---|---|
| `--bg` / `--bg2` | `#08060d` / `#0d0916` | Sayfa ve panel zemini |
| `--card` / `--card2` / `--card3` | `#140f1e` / `#1b1428` / `#241a34` | Kart, çip, no rozeti katmanları |
| `--line` / `--line2` | `#271c3a` / `#33244a` | Kenarlıklar |
| `--tx` / `--tx2` / `--tx3` | `#f4effc` / `#a89cc2` / `#6d6285` | Metin hiyerarşisi |
| `--ac` / `--ac2` | `#a855f7` / `#ec4899` | Mor / magenta vurgu, gradyanlar |
| `--ok` / `--bad` / `--uyari` | `#34d399` / `#fb7185` / `#fbbf24` | Durum renkleri |
| `--rad` / `--rad-kucuk` | `14px` / `9px` | Köşe yarıçapı |
| `--golge` | `0 18px 40px -18px rgba(0,0,0,.85)` | Kart gölgesi |
| `--gecis` | `180ms cubic-bezier(.4,0,.2,1)` | Geçiş süresi |

Gövde zemini iki radyal gradyan taşır (sol üstte mor, sağ üstte magenta parıltı) ve
`background-attachment: fixed` ile sabitlenir.

## Bileşen sınıfları

| Sınıf | Görev |
|---|---|
| `.kap` | İçerik kabı (maks. 1480 px, 28 px yan boşluk) |
| `.ust`, `.ust-ic`, `.logo`, `.ust-menu`, `.ust-arama` | Yapışkan üst bar + arama |
| `.hero`, `.hero-gorsel`, `.hero-perde`, `.hero-ic` | Banner vitrin; üç katmanlı perde okunabilirlik sağlar |
| `.satir`, `.satir-kaydirma`, `.satir-ok` | Yatay kaydırma satırı; oklar yalnızca hover'da görünür |
| `.kart`, `.kart-gorsel`, `.kart-rozet`, `.kart-ilerleme` | Anime kartı; hover'da yükselir ve görsel %6 büyür |
| `.izgara`, `.liste-gorunum`, `.liste-satir` | Katalog görünümleri |
| `.anime-bant` | Anime detay sayfasındaki dekoratif geniş bant (`height: clamp(190px, 21vw, 320px)`, `object-position: center 30%`); görsel sırası **4K TMDB → TMDB (HD) → AniList banner'ı** |
| `.rozet`, `.istatistik` | Künye kutuları |
| `.bolum`, `.bolum-no`, `.bolum-liste` | Bölüm satırı ve kaydırmalı liste |
| `.oynatici-izgara`, `.oynatici-kutu` | Oynatıcı düzeni (16:9 kilitli, 1fr + 350 px) |
| `.cip`, `.kaynak-grup`, `.guven-cubuk` | Kaynak çipleri ve güvenilirlik çubuğu |
| `.uyari-kutu.bilgi/.uyari/.hata` | Bilgilendirme şeritleri |
| `.katman`, `.katman-ic`, `.katman-kapat` | Tıkla-yükle kaplamaları (hero fragmanı) |
| `.hesap-izgara`, `.hesap-kutu`, `.alan`, `.hesap-durum`, `.hesap-nokta` | Hesap/KVKK sayfası |
| `.iskelet` + `@keyframes parildama` | Yükleme iskeletleri |
| `.alt`, `.alt-izgara`, `.alt-menu` | Alt bilgi ve mobil menü |

## 01.10 paketleme ekleri (tur A/D)

| Öğe | Uygulama |
|---|---|
| Hero vitrini | `.hero` içine iki düğme eklendi: **▶ Fragman** (varsa) ve **Şansıma ne çıkarsa** (rastgele bölüm). Fragman tıklanınca `.katman` kaplaması açılır, iframe ancak o an yüklenir (`youtube-nocookie`), Escape/arka plan/✕ kapatır, gövde kaydırması kilitlenir. |
| Seri (franchise) sayfaları | `/seriler/` tablo indeksi, `/seri/<slug>/` kronolojik kart ızgarası; mevcut `.kart` ve `.satir` sınıfları yeniden kullanılır. |
| Fansub profilleri | `/fansub/<slug>/` grup başlığı + katkı sayısı + katalog (`.izgara`). |
| 404 sayfası | En iyi 6 yapım kartı + rastgele bölüm düğmesi + `/seriler/` bağlantısı; böylece hatalı bağlantı çıkmaz sokak olmaz. |
| PWA | `manifest.webmanifest` (standalone, 192/512/maskable ikonlar) + `public/sw.js`; ikonlar `tools/simge-uret.mjs` ile bağımlılıksız üretilir. Kayıt yalnızca üretim derlemesinde ve localhost dışında yapılır. |
| OG kartı | Site geneli `public/og.png` (1200×630) — paylaşımda marka kartı; anime başına kart bilinçli olarak ertelendi (1 GB Pages sınırı, bkz. docs/06). |

## Etkileşim ilkeleri

- **Hover ile keşif:** Kartta puan ve kaynak sayısı her zaman görünür; "doğrulanmış kaynak"
  rozeti yalnızca hover'da çıkar (bilgi yoğunluğunu gizli tutmak için).
- **Odak görünürlüğü:** Tüm etkileşimli öğelerde `:focus-visible` 2 px mor çerçeve.
- **Hareket azaltma:** `prefers-reduced-motion: reduce` tüm animasyon ve geçişleri kapatır.
- **Kaydırma çubuğu gizleme:** Satırlarda `scrollbar-width: none`; kaydırma okları ve dokunma.

## Duyarlılık

| Kırılma noktası | Davranış |
|---|---|
| > 1100 px | Oynatıcı 2 kolon, detay 300 px afiş + içerik |
| ≤ 1100 px | Oynatıcı tek kolona iner, afiş 220 px |
| ≤ 860 px | Üst menü hamburger, alt menü çubuğu açılır (`display: block`), kartlar 142 px, satır okları gizlenir, yan boşluklar 16 px |

Mobil alt menü `env(safe-area-inset-bottom)` desteğiyle iOS çentikli ekranlarda güvenli alan bırakır.

### Geniş bant kırpım politikası (02.10)

Anime detay bandının yüksekliği sabit 190 px'ti. Kaynak TMDB'nin 16:9 backdrop'u olunca ölçüm
şuydu: bant sağ kolonda 1.086 px geniş → 190 px yükseklik 5,7:1 demek, yani görselin dikey
ekseninin yalnızca **%31'i** görünüyor (AniList'in 1900×400 banner'ı 4,75:1 olduğu için eski
görselde kayıp daha azdı). Bant artık `clamp(190px, 21vw, 320px)`: masaüstünde 320 px → **%52**
görünür, dar ekranda alt sınır devreye girip mobil düzeni değiştirmez.

Kararın gerekçesi: sol kolondaki afiş (~450 px) bandan uzun olduğu için bant büyümesi ızgara satır
yüksekliğini artırmıyor — **masaüstünde ek kaydırma maliyeti yok**, yalnızca daha çok görsel
görünüyor. Kırpım penceresi `object-position: center 30%` ile ortadan biraz yukarıdadır (anahtar
görsellerin odağı üst-orta bölgede). Ölçü `tools/testler/tmdb.test.mjs` tarafından `globals.css`
okunarak doğrulanır: CSS değişip kırpım %50'nin altına inerse test kırmızıya döner.

### Oynatıcı köprü şeridi (02.10)

`/izle` sayfasında iframe'in altında ince bir şerit var: `.oynatici-kopru`. Yalnızca postMessage
API'si yayınlayan kaynakta görünür (ölçüm: `docs/04`):

- `.oynatici-kopru-nokta` — 8 px durum noktası; `.canli` sınıfı **yalnızca kaynak gerçekten cevap
  verdiğinde** eklenir (yeşil). Kaynak değişip köprü kurulmazsa nokta gri kalır: sessiz durumu
  canlı gibi göstermeyiz.
- `.oynatici-kopru-saat` — `font-variant-numeric: tabular-nums`, çünkü saniye sayacı her saniye
  değişiyor; orantılı rakamlarda genişlik oynar ve şerit titrer.
- `.oynatici-kopru-dugmeler` — yalnız **komut kanalı kanıtlanmış** host'ta basılır. Kanıt yoksa
  yerine `.oynatici-kopru-not` ("bu kaynak kendi oynatıcısını kullanır") gelir. Kural: ölü düğme
  göstermek, düğme göstermemekten kötüdür.
- `.oynatici-kopru-olcum` — yetenek koda gömülü tablodan değil **bu cihazdaki ölçümden** geliyorsa
  görünen küçük "ölçüldü" rozeti; ipucu gözlem sayısını ve son görülme tarihini taşır. "Neden
  burada düğme var?" sorusunu görünmez bir varsayıma değil kanıta bağlar.
- `.oynatici-kopru-kesif` — sınama ya da kullanıcı komutu bir yeteneği **ilk kez** açtığında bir
  kerelik duyuru (`role="status"`); 8 sn sonra kaybolur. Ölçümün tamamı ve sıfırlama `/kunye`
  sayfasındaki "Oynatıcı köprüsü" bölümünde görünür (sayfanın kendi dili: `.satir-baslik` + `.tablo`).

> Not: panel ilk yazıldığında `.kart` ile sarıldı ve kart sınıfı anime kartı ölçüsü taşıdığı için
> bölüm 178 px'e sıkıştı (tarayıcıda görüldü, 02.10). Sayfa bölümleri `.kart` kullanmaz.

Bölüm **statik HTML'de de vardır**: açıklama ve önsel tablo derleme çıktısına yazılır, ölçüme bağlı
satır (gözlem/tarih/sıfırlama düğmesi) hidrasyondan sonra belirir. Alternatif — ölçüm okunana kadar
`null` dönmek — bölümü JS'siz ziyaretçiden tamamen saklar ve yüklenince sayfayı aşağı kaydırırdı;
ilk gösterilen veri de yanlış olmaz, çünkü ölçümsüz hâli zaten doğru önsel tablodur.

## Erişilebilirlik

- `lang="tr"`, "İçeriğe geç" bağlantısı, `aria-label`/`aria-pressed`/`aria-selected` alanları
- Köprü durum noktası dekoratif (`aria-hidden`): anlamı taşıyan şey yanındaki metin ve saattir
- Oynatıcıda tam klavye gezinme: `←/→` bölüm, `1-9` kaynak, `F` tam ekran, `/` arama
- Görsel gölgeler ve kontrast: gövde metni `#f4effc` üzerine `#08060d` (≈18:1)
- Anlamlı görsellere `alt`, dekoratif olanlara `alt="" aria-hidden="true"`

## Bilinen pürüzler

- Hero'daki `.hero-puan` rozeti 2026-09-30'da eklendi; daha önce `.kart-rozet` (mutlak konumlu)
  yeniden kullanıldığı için sayfanın sol üstüne kayıyordu.
- Türkçe metinlerde `Şu An Popüler` gibi başlıklarda büyük harf dönüşümü CSS ile yapılmıyor
  (Türkçe `i/ı` sorunu nedeniyle); başlıklar doğrudan istenen biçimde yazılır.
- Özet metinleri İngilizce (kaynak veri); tipografi buna göre ayarlandı.
