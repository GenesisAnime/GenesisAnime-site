# 02 · Veri Hattı

> Son güncelleme: 2026-10-02 · Ölçümler `tools/rapor/veri-raporu.md` çıktısından

## Girdiler

### 1. Arşiv veritabanı

```
Yeni turkanimetv arsiv/güncel database/turkanime-v1 - güncel database.db    (69,6 MB, salt okunur)
```

| Tablo | Satır | Önemli kolonlar |
|---|---:|---|
| `anime` | 6.107 | `id, slug, baslik, bolum_sayisi` |
| `bolum` | 71.694 | `id, anime_id, slug, ad` |
| `link` | 317.146 | `id, bolum_id, player, fansub, tip, deger` |
| `anime_meta` | 6.085 | `anilist_id, mal_id, poster_url, year, score, genres_json, synonyms_json, format, status, season, duration` |
| `ta_fansub_group` | 356 | `name` |
| `ta_anime` | 5.719 | arşiv sitesi anahtar eşlemesi |
| `ta_episode_fansub` | 112.541 | `bolum_id, fansub_group_id, full_info` |

**Boş kolonlar (kritik):** `banner_url`, `summary`, `relations_json`, `native_title` → **0 kayıt**.
Bu yüzden AniList zenginleştirmesi zorunlu bir adımdır.

### 2. Link kontrol geçmişi

```
Linkleri tespit etme araçları/kontrol_gecmisi.jsonl     (4.378 kayıt)
```

| Durum | Adet |
|---|---:|
| çalışıyor | 1.615 |
| ölü | 2.677 |
| engellendi | 86 |

Kayıtların **4.367'si** DB'deki URL'lerle eşleşiyor. Kapsam: 4.378 / 317.132 tekil URL = **%1,38**.
Kontrol edilen küme neredeyse tamamen One Piece bölümlerine ait (kaynak: `Kontrol edilecek/ONE_PIECE_*`).

### 3. AniList GraphQL

5.850 `anilist_id` → 117 parti (`Page(perPage: 50) { media(id_in: [...]) }`), 700 ms aralık.

| Alan | Dolu kayıt |
|---|---:|
| Önbelleğe alınan anime | 5.809 |
| Banner | 4.040 |
| Özet | 5.790 |
| Tür (genres) | 5.787 |
| İlişkili yapım | 4.111 |
| Yasal izleme bağlantısı | 3.920 |
| Fragman | 3.242 |
| Önbellek boyutu | 8,31 MB |

### TMDB eşlemesi · iki aşamalı

1. **Veri kümesi (anahtarsız)** — `npm run tmdb:esle`: AniList kimliği → Fribb `anime-list`
   eşlemesi. Kimlik veriden (`anilist`) okunur. Ölçüm: **4.907** yapım.
2. **Arama (anahtar gerekir)** — `npm run tmdb:ara`: veri kümesinde karşılığı olmayan yapımlar
   için TMDB `/search` ucu. Eşleşme üç bağımsız şarta bağlanır — **animasyon türü (16), başlık
   benzerliği ≥0,85, yıl ±1** — ve her kayıt `tam`/`yakin` güven etiketi taşır; kabul edilenler
   `tools/cache/tmdb.json`'a `kaynak:'arama'` ile yazılır (`tmdb:esle` bu kayıtları korur).

**Risk ölçümü (`npm run tmdb:ara -- --golge=200`).** Arama mantığı, veri kümesinde karşılığı
**olan** 200 yapımda gizlice çalıştırılıp bulunan kimlik Fribb kimliğiyle karşılaştırıldı:

| Sonuç | Adet | Yorum |
|---|---:|---|
| Aynı kimlik | 141/200 (%70,5) | arama doğru kaydı buldu |
| Farklı kimlik — **granülerlik** (film↔dizi, aynı ad+yıl) | 11 | Fribb dizinin kimliğini verirken arama asıl film kaydını buluyor (arşivdeki kayıt film) |
| Farklı kimlik — **aynı tip** (incelenmeli) | 1 | TMDB'de çift kayıt (`saint-seiya-soul-of-gold`); açık yanlış eşleşme değil |
| Bulunamadı | 47/200 (%23,5) | yanlış eşleşme değil, yalnızca kapsam kaybı |

Yani ölçülen **yanlış yapım bağlama oranı %0**; 6%'lık "farklı kimlik" sınıfının tamamı aynı başlık
ve yıl taşıyan farklı granülerlikteki kayıtlardı. Kuralın muhafazakârlığı bilinçlidir: yanlış görsel,
boş banddan kötüdür.

## Dönüşüm adımları (`tools/export-data.mjs`)

1. **Girdi okuma** — sağlık haritası, AniList önbelleği, SQLite tabloları.
2. **Player güvenilirliği** — `link.deger` host'undan `host → player` haritası kurulur; sağlık
   kayıtları player bazında sayılır. Güvenilirlik = `(ok + 1) / (kontrol + 2)` (Laplace düzeltmesi;
   kontrol verisi olmayan player nötr 0,5 alır).
3. **Veri yapıları** — `anime_id → bölüm[]`, `bolum_id → bölüm`, `bolum_id → ekip[]`.
4. **Filtreleme ve kayıt derleme** — aşağıdaki politika uygulanır.
5. **Ana sayfa satırları** — hero (banner + yıl ≥ 2010 + puan ≥ 70, puan sırası, 24 kayıt; her
   kart `fr` alanında fragman bilgisini de taşır) ve 18 satır (popüler, yeni, sezon, filmler,
   klasikler, kısa seriler + 10 tür satırı).
6. **4K banner (TMDB backdrop)** — `tools/cache/tmdb-backdrop.json` okunur; `genislik ≥ 3000`
   kayıtlar animeye `banner4k`, ana sayfa kartına `ban4k` + `bw` (kaynağın gerçek genişliği,
   `srcSet` adayı) olarak yazılır. 4K'nın altındaki kayıtlar, AniList banner'ı yoksa ya da AniList
   tavanını (1900 px) geçiyorsa `bannerTmdb` alanına düşer. Önbellek yoksa alanlar `null` kalır.
7. **Seri (franchise) grupları** — ilişki grafiği union-find ile birleştirilir; her anime
   dosyasına `seri` alanı, `seriler.json`'a grup listesi yazılır (aşağıda).
8. **Fansub slug'ları** — grup adı `araAnahtari` + tire ile slug'lanır (`TAÇE` → `tace`);
   `taksonomi.fansublar` ve `fansublar.json` bu slug'ı `s` alanında taşır.
9. **Çıktı yazımı** — JSON dosyaları + ölçümler.
10. **Rapor** — `tools/rapor/veri-raporu.{md,json}`.

### Kaynak filtresi politikası (ADR-0003)

```
ham 317.146 kaynak
  ├─ durum = "ölü"        →  2.670 kaynak  →  SİTEYE HİÇ YAZILMAZ
  ├─ durum = "engelli"    →     84 kaynak  →  SİTEYE HİÇ YAZILMAZ
  └─ kalan                → 314.392 kaynak →  listelenir
         └─ durum = "ok"  →   1.613 kaynak →  "doğrulanmış" rozeti alır
```

Ayrıca bölüm içinde `(player, url)` ikilisi tekilleştirilir. Kaynak sıralaması:

1. doğrulanmış çalışanlar önce,
2. sonra player güvenilirliği (99% → 3%),
3. sonra URL alfabetik (deterministik çıktı).

## Çıktılar

| Dosya | Boyut | İçerik |
|---|---|---|
| `public/data/katalog.json` | 1.768 KB | `kolonlar` + 6.107 satır (dizi biçimi) |
| `public/data/anime/<slug>.json` | 6.107 dosya · 44,8 MB | bölümler, kaynaklar, ekip, ilişkili yapımlar |
| `public/data/ana-sayfa.json` | 368 KB | 24 hero + 18 satır × 30 kart (`ban4k`/`bw` 4K alanları dahil) |
| `public/data/taksonomi.json` | 19,8 KB | tür/format/yıl/player/fansub kırılımları (`fansublar[].s`) |
| `public/data/fansublar.json` | grup dizini | grup (`ad`, `s`, bölüm sayısı) → yapım slug'ları |
| `public/data/seriler.json` | seri dizini | 961 franchise grubu: kök slug + üyeler (`s`, `ad`, `yil`, `p`) |
| `public/data/kunye.json` · `saglik.json` | < 1 KB | istatistikler (`seriGrubu`, `fansubGrubu` dahil) |

Anime dosyası boyut dağılımı: **ortalama 7,5 KB**, en büyük 367 KB (`one-piece`), en küçük 269 B.
Toplam koşu süresi: **8,6–11,1 sn**.

### Anime JSON sözleşmesi

```jsonc
{
  "slug": "naruto", "anilist": 20, "ad": "Naruto", "adEn": null,
  "yil": 2002, "puan": 80, "format": "TV", "durum": "FINISHED", "sezon": "FALL", "sure": 23,
  "poster": "https://cdn.myanimelist.net/...", "banner": "https://s4.anilist.co/...",
  "banner4k": "https://image.tmdb.org/t/p/original/...", "banner4kGenislik": 3840,
  "bannerTmdb": "https://image.tmdb.org/t/p/original/...", "bannerTmdbGenislik": 1920,
  "ozet": "Naruto Uzumaki, a hyperactive...", "turler": ["Aksiyon", "Macera", "..."],
  "iliski": [{ "t": "SEQUEL", "s": "naruto-shippuuden", "ad": "...", "p": "...", "f": "TV" }],
  "seri": "naruto",
  "fragman": { "site": "youtube", "id": "..." },
  "yasal": [{ "a": "Crunchyroll", "u": "https://..." }],
  "kaynakSayisi": 639, "bolumSayisi": 220,
  "bolumler": [{
    "n": 1, "no": "1", "ad": "1. Bölüm", "slug": "naruto-1-bolum", "ks": 17,
    "ekip": [{ "g": "Benihime Fansub-BD", "e": "Rinrintan / ..." }],
    "src": [["UQLOAD", "Benihime Fansub-BD", "https://uqload.com/embed-...", "ok"]]
  }]
}
```

`src` dizisindeki 4. eleman (`"ok"`) yalnızca çalıştığı doğrulanmış kaynaklarda bulunur.
`seri` alanı 2+ üyeli ilişki ağı yoksa `null` kalır.

`anilist`, kaydın zenginleştirildiği AniList kimliğidir. **Provenans olduğu kadar anahtar da**: TMDB
eşlemesi (`tools/tmdb-esle.mjs`) AniList kimliği → Fribb `anime-list` üzerinden TMDB kimliği bulur.
Bu alan gelmeden önce kimlik yalnızca banner URL'inden çıkarılabiliyordu, yani **banner'ı olmayan
1.775 yapım eşlemeye hiç giremiyordu** (bkz. docs/05 · H-29).

Banner görseli üç katmanlıdır ve sıra `src` seçiminde bellidir:

| Katman | Alan | Eşik | Nerede kullanılır |
|---|---|---|---|
| 4K | `banner4k` | TMDB backdrop ≥3000 px | Hero + detay bandı |
| TMDB (HD) | `bannerTmdb` | <3000 px, ama AniList banner'ı yoksa (boş bandı doldurur) ya da genişlik ≥1900 px (AniList tavanını geçer) | Detay bandı |
| AniList | `banner` | 1900 px tavanı | Yedek (her yerde)| `banner4kGenislik` / `bannerTmdbGenislik` kaynağın gerçek genişliğidir ve `srcSet` adayını bildirir

Ölçüm (02.10.2026, arama aşaması dahil): TMDB kimliği **5.266** yapımda (%86,2 — Fribb 4.907 +
arama 359), backdrop kaydı **5.079**, 4K katmanı **2.495** (%40,9), HD katmanı **2.269**; anime
sayfası bandı **5.306** sayfada (%86,9) dolu, **801** sayfada boş (TMDB'de karşılığı olmayan
tek bölümlük OVA/özel bölümler). Bu huni `npm run tmdb:kapsam` ile her zaman yeniden üretilebilir
(ağ yok; `tools/rapor/tmdb-kapsam.json`).
(ölçüm: **2.060 yapım**). Gerekçe: AniList banner CDN'i 1900 px'de tavanlanıyor (ölçüldü) ve hero
74vh yüksekliğinde 3840 px'e kadar ekranlarda bulanık kalıyordu. Eşleme (`npm run tmdb:esle`) ve
backdrop çekimi (`npm run tmdb:zenginlestir`) TMDB anahtarı gerektirir; önbellek yoksa alan `null`
kalır ve site AniList banner'ında çalışmaya devam eder — eksik 4K bir hata değildir. Görseller
TMDB'den geldiği için `/kunye/` ve alt bilgide **atıf zorunludur** (“This product uses the TMDB API
but is not endorsed or certified by TMDB.”).

### Seri (franchise) grubu nasıl kurulur?

`iliski` kenarları (SEQUEL, PREQUEL, SIDE_STORY, SPIN_OFF, ALTERNATIVE, PARENT, SUMMARY) union-find
ile birleştirilir. İki koruma vardır:

- **Crossover köprüsü kurulamaz:** başlığında `vs` kelimesi geçen ilişkiler köprü sayılmaz
  (`KROS_AD = /\bvs\.?\b/i`). Bu kural olmadan Lupin III ile Detective Conan gibi çapraz filmler
  tüm serileri tek gruba bağlıyordu.
- **Hedef slug çözümü:** ilişki kaydındaki AniList kimliği, arşiv slug'ına haritalanır; gruplar
  yalnızca arşivde karşılığı olan yapımları içerir.
- **Kök seçimi:** adı en çok üyenin başlığının öneki olan yapım (eşitlikte: kısa ad, eski yıl,
  slug). Örn. One Piece 42, Dragon Ball 40, Naruto 19, Lupin III 18 üye.

Ölçüm: **961 grup / 3.244 yapım** (arşivin %53'ü). Bu kural `docs/05`'te testle korunur
(tek grup üyeliği, simetri, geçerli slug).

## Karşılaşılan tuzaklar (kayıt)

### 1. `score` kolonu 0–10 ölçeğinde

`anime_meta.score` alanı `5.59`, `6.31`, `9.12` gibi **0–10** değerler içeriyor (MAL ölçeği),
ama ilk uygulama 0–100 varsaydı. Sonuç: `Math.round(score) >= 70` filtresi hiçbir kaydı geçmedi ve
**hero vitrini boş kaldı** (18 satır oluştu, 0 hero).

Teşhis yöntemi: filtre aşamalarını ayrı ayrı sayan geçici bir ölçüm satırı eklendi —
`havuz 6085 → kaynaklı 5947 → bannerlı 4003 → banner+yıl≥2010 2966 → +puan≥70 0`.
Son sıçrama sorunu tek başına gösterdi.

Düzeltme: `puan = an.puan ?? Math.round(meta.score * 10)` — AniList `averageScore` (0–100) varsa o,
yoksa DB değeri ×10. Sonuç: 1.581 aday, 24 hero.

### 2. Tür eşlemesi büyük/küçük harf duyarlıydı

`genres_json` alanı küçük harfli etiketler içeriyor (`"adventure"`, `"based on a manga"`), eşleme
tablosu ise AniList'in `"Adventure"` biçimini bekliyordu. Sonuç: tür satırları boş kalıyordu.
Düzeltme: `turEsle()` fonksiyonu büyük/küçük harf gözetmeden eşler ve küçük harfli AniList tür
karşılıkları tabloya eklendi. Tür sayısı 44'e çıktı.

### 3. `full_info` alanında URL ve ayraç artıkları

Bölüm-ekip kayıtlarındaki `full_info` bazen yalnızca URL listesi içeriyor, bazen
`"Rinrintan / /"` gibi sondaki ayraçları bırakıyor. Düzeltme: URL'ler ayıklanıyor, `|` parçaları
tek tek kırpılıyor, art arda gelen `/` ayraçları teke indiriliyor; boş kalan kayıt yazılmıyor.

### 3b. Kırpma regex'inde kaçışsız tire (sessiz veri bozulması)

Kırpma sınıfı `[\s/\\-–—,.]` olarak yazılmıştı. `\\` tek bir kaçışlı ters bölü olduğu için onu
izleyen `-` **aralık** kurdu (`\` U+005C → `–` U+2013): aradaki **tüm** karakterler sınıfa girdi ve
kelimelerin sonundaki harfler silindi (`"Rinrintan"` → `"R"`, `"Magic_Lord"` → `"Magic_L"`).

Düzeltme: `const SON_KIRP = /[\s/–—,.\-]+$/;` — tire kaçışlı ve sınıfın sonunda. Doğrulama:
"Rinrintan / /" → "Rinrintan"; "Magic_Lord / Deat H Note. & S.E" → değişmeden korunur.

Üretilen veri kontrolü: `public/data/anime/naruto.json` 1. bölüm ekip kaydı
`[{"g":"AniSekai","e":"Magic_Lord / Deat H Note. & S.Erturk"}, {"g":"Benihime Fansub-BD","e":"Rinrintan"}, …]`
olarak doğrulandı. Kalıcı ders `AGENTS.md` ve `docs/05` içine yazıldı.

### 4. Arama anahtarında tekrar

`synonyms_json` aynı başlığı defalarca içerebiliyor (`naruto naruto naruto naruto ...`).
Düzeltme: `araAnahtariTekil()` kelimeleri tekilleştirir ve 140 karakterle sınırlar.

## Komutlar

```bash
npm run veri                                   # tam hat (~9 sn)
npm run veri:anilist                           # zenginleştirme (~4 dk, önbellekli)
npm run veri:anilist -- --limit 300            # deneme
npm run veri:anilist -- --yenile               # önbelleği yok say

GENESIS_DB=/başka/yol.db npm run veri          # farklı veritabanı
```

## Sonraki adımlar

- Faz 7: 317 bin bağlantının partiler halinde taranması → `health.json` kapsamının %100'e çıkarılması
- Özetlerin Türkçeleştirilmesi (AniList özetleri İngilizce)
- `anime_meta` eksik 22 yapım için AniList eşleştirmesi (şu an 6.085/6.107)

## Kapak kalitesi: `p2` (AniList 460 px)

Arşiv kapaklarının %98'i MyAnimeList'ten gelir ve MAL'ın en büyük anime kapağı **225×320**.
Kart görseli mobilde 142 CSS px, masaüstünde 178 CSS px'tir; 2×/3× yoğunluklu telefon
284–426 px ister. MAL CDN'i bu isteği **büyütme** ile karşılıyordu (`/r/356x508/` = 225 px
kaynağın şişirilmiş hâli: 31–38 KB ve bulanık). Ölçüm (04.10, 6 poster): orijinal 225×320
35/42/15/15/16/18 KB · `/r/178x254/` 10–15 KB · `/r/225x319/` 15–24 KB · `/r/356x508/` 31–38 KB.

Çözüm: aynı yapımın **AniList** kapağı gerçek 460×662 kaynaktır (~95–100 KB) ve anime
dosyalarına `p2` alanı olarak yazılır (`npm run poster:xl` → `tools/poster-xl.mjs`):
`anime_meta.anilist_id` eşleşmeleri 50'lik `Page(media(id_in:…))` istekleriyle çekilir
(117 istek, 1,5 sn aralık, 429/5xx'te artan bekleme), parçalar `tools/cache/poster-xl/`
altında önbelleklenir, yalnız `/cover/large/*.jpe?g` kabul edilir (aynı yolun PNG'leri
326–489 KB iniyor). Kapsam: **3.067/6.107** anime dosyası (AniList kimliği eşleşen ve JPEG
kapağı olanlar); ana sayfa verisine 353, kırpılmış kart dosyasına 339 `p2` düştü.

İstemci sözleşmesi (`src/lib/gorsel.ts`):

| aday | kaynak | nerede seçilir |
|---|---|---|
| `178w` | MAL `/r/178x254/` (10–15 KB) | 1× ekran — bayt aynı kaldı |
| `225w` | MAL `/r/225x319/` (15–24 KB) | 1× geniş kart / 2× küçük kart |
| `460w` | AniList `p2` (95–100 KB) | 2×/3× telefon, retina masaüstü |

`/r/356x508/` adayı **kaldırıldı** (büyütme = bulanıklık). Mobil hero ise `<picture>` ile
sanat yönetimi yapar: ≤860 px'te dikey kapak (`p2` → MAL 225), üstünde 4K backdrop;
tarayıcı yalnız tek görsel indirir (iki `<img>` + CSS gizleme hilesi gizli görseli de indirir).
