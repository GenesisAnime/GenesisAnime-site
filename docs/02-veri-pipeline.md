# 02 · Veri Hattı

> Son güncelleme: 2026-10-01 · Ölçümler `tools/rapor/veri-raporu.md` çıktısından

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
6. **Seri (franchise) grupları** — ilişki grafiği union-find ile birleştirilir; her anime
   dosyasına `seri` alanı, `seriler.json`'a grup listesi yazılır (aşağıda).
7. **Fansub slug'ları** — grup adı `araAnahtari` + tire ile slug'lanır (`TAÇE` → `tace`);
   `taksonomi.fansublar` ve `fansublar.json` bu slug'ı `s` alanında taşır.
8. **Çıktı yazımı** — JSON dosyaları + ölçümler.
9. **Rapor** — `tools/rapor/veri-raporu.{md,json}`.

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
| `public/data/ana-sayfa.json` | 319 KB | 24 hero + 18 satır × 30 kart |
| `public/data/taksonomi.json` | 19,8 KB | tür/format/yıl/player/fansub kırılımları (`fansublar[].s`) |
| `public/data/fansublar.json` | grup dizini | grup (`ad`, `s`, bölüm sayısı) → yapım slug'ları |
| `public/data/seriler.json` | seri dizini | 961 franchise grubu: kök slug + üyeler (`s`, `ad`, `yil`, `p`) |
| `public/data/kunye.json` · `saglik.json` | < 1 KB | istatistikler (`seriGrubu`, `fansubGrubu` dahil) |

Anime dosyası boyut dağılımı: **ortalama 7,5 KB**, en büyük 367 KB (`one-piece`), en küçük 269 B.
Toplam koşu süresi: **8,6–11,1 sn**.

### Anime JSON sözleşmesi

```jsonc
{
  "slug": "naruto", "ad": "Naruto", "adEn": null,
  "yil": 2002, "puan": 80, "format": "TV", "durum": "FINISHED", "sezon": "FALL", "sure": 23,
  "poster": "https://cdn.myanimelist.net/...", "banner": "https://s4.anilist.co/...",
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
