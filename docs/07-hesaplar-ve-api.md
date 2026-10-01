# 07 · Hesaplar ve API (Faz 5 tasarımı)

> Durum: **tasarlanan çerçeve uygulandı (01.10).** Uygulama notu ve sapmalar:
> [11-hesaplar-uygulama.md](11-hesaplar-uygulama.md); yayın (deploy) kullanıcı hesabı bekliyor.
> Bu belge tasarım gerekçesi olarak korunur.

## Neden ayrı bir servis?

Site bilinçli olarak `output: 'export'` (tam statik) çalışıyor: sunucu maliyeti yok, ücretsiz
host, ölçeklenir. Hesaplar ve topluluk sunucu + veritabanı gerektirir. Bu nedenle statik önyüz
**korunur**, hesaplar ayrı bir API servisi olarak eklenir.

## Mevcut hazırlık: depo adaptör katmanı

Tüm kullanıcı durumu `src/lib/depo/` üzerinden geçer:

| Dosya | Rol |
|---|---|
| `depo/yerel.ts` | localStorage sürücüsü (bugün) |
| `depo/kanca.ts` | React kancaları: `useListe`, `useIlerlemeListesi`, `useTercihler`, … |

Faz 5'te `depo/api.ts` yazılır ve `kanca.ts` sürücüyü değiştirir. **Sayfalar ve bileşenler
değişmez.** Bu, planın en başındaki "backend takıldığında önyüz kodu değişmez" taahhüdünün
karşılığıdır.

## Hedef mimari

```
        Statik önyüz (GitHub Pages)                API servisi (VPS / Vercel / Workers+D1)
        ─────────────────────────                  ──────────────────────────────────────
        /anime/*  ── okuma ──► public/data/*.json  (değişmez)
                                                       ┌──────────────┐
        Giriş / kayıt  ──────────────────────────────► │  /auth/*     │  JWT + yenileme
        İzleme listesi ──────────────────────────────► │  /me/liste   │  (yerel kopya + senkron)
        İlerleme       ──────────────────────────────► │  /me/ilerleme│
        "Çalışmıyor"   ──────────────────────────────► │  /bildirim   │  → link sağlığı kuyruğu
                                                       └──────┬───────┘
                                                              ▼
                                                     Postgres / SQLite
```

Çakışma çözümü: yerel kayıt her zaman kaynak; oturum açıldığında yerel veri birleştirilir
(`zaman` alanı en yeni olan kazanır), sonra sunucu kopyası güncellenir. Çevrimdışı çalışma korunur.

## Kapsam (faz sırası)

1. **Kimlik:** e-posta + parola (argon2id), e-posta doğrulama, parola sıfırlama,
   isteğe bağlı Google/GitHub OAuth.
2. **Senkron:** izleme listesi, ilerleme, izlenen bölümler, tercihler.
3. **Bildirim:** "kaynak çalışmıyor" işaretlerinin sunucuya iletilmesi (Faz 7 kuyruğuna girer).
4. **Profil:** görünen ad, avatar, herkese açık liste (isteğe bağlı), veri indirme/silme (KVKK).

## Teknik seçimler (öneri)

| Konu | Seçilen | Gerekçe |
|---|---|---|
| Çalışma ortamı | Cloudflare Workers (saf JS modül, bağımlılıksız) | Site her zaman statik; `api/` ayrı paket, kök bağımlılık artmaz |
| Veritabanı | **D1** (SQLite) — `api/migrations/0001.sql` | 6 bin anime + kullanıcı verisi küçük |
| Kimlik doğrulama | **PBKDF2-HMAC-SHA256 + opak taşıyıcı jeton** | Workers'ta argon2 yok; cross-origin çerez kırılgan → [ADR-0008](kararlar/ADR-0008-workers-parola-ve-jeton.md) |
| Barındırma | Cloudflare Workers + D1 | Ücretsiz katman; CORS ile statik siteye bağlanır |
| Şema yönetimi | Tek SQL migrasyonu + `wrangler d1 execute` | Faz 1 veri hattıyla aynı felsefe: bağımlılık az |

### Taslak şema

```sql
kullanici(id, eposta, parola_hash, ad, olusturma, dogrulandi)
oturum(id, kullanici_id, yenileme_hash, son_kullanma)
izleme_listesi(kullanici_id, anime_slug, ekleme)            -- PK(kullanici_id, anime_slug)
ilerleme(kullanici_id, anime_slug, bolum, bolum_adi, saniye, zaman)  -- PK(kullanici_id, anime_slug)
izlenen(kullanici_id, anime_slug, bolum, zaman)             -- PK(kullanici_id, anime_slug, bolum)
tercih(kullanici_id, anahtar, deger)
bildirim(id, url, anime_slug, bolum, kullanici_id, zaman, durum)  -- Faz 7 kuyruğu
```

## Güvenlik gereksinimleri

- Parolalar `PBKDF2-HMAC-SHA256` (100.000 iterasyon — workerd üretim tavanı, kayıt başına tuz;
  ilk tasarımdaki 210.000 yerel çalışma zamanında geçer ama üretimde reddedilir, bkz. docs/05 H-20)
  ile saklanır; düz metin
  log'lanmaz. (Taslaktaki argon2id, Workers çalışma zamanında bulunmadığı için uygulanamadı;
  gerekçe: [ADR-0008](kararlar/ADR-0008-workers-parola-ve-jeton.md).)
- Oran sınırlama: IP başına kayıt/giriş denemesi (ör. 10/dk), parola sıfırlama 3/saat.
- Tüm girdiler şema doğrulamasından geçer (`Anime slug` deseni, `bolum` pozitif tam sayı).
- CORS yalnızca site kaynağına açık; çerezler `HttpOnly`, `Secure`, `SameSite=Lax`.
- Veri indirme ve hesap silme uçları (KVKK/GDPR).
- `bildirim` ucu spam'e kapalı: IP başına günlük sınır (uygulamada 30/gün) + 24 saat tekilleştirme.

Uygulamada taslak şema yerine **tek JSON blob** (`durum` tablosu) kullanılır: istemci zaten tüm
kişisel durumu tek nesne olarak yönetiyor, birleştirme istemcide yapılıyor ve sunucu sürüm
numarasıyla iyimser kilit uyguluyor (bkz. [11](11-hesaplar-uygulama.md)).

## Uygulananlar (01.10)

- Bildirim ucu + admin kuyruğu (`GET /bildirim`, `POST /bildirim/:id`) ve oynatıcı istemci kuyruğu.
- Kayıt/giriş/yenile/çıkış, senkron blob'u (`GET`/`PUT /me/durum`), KVKK veri indirme ve hesap silme.
- Yerel-önce birleştirme (`durum-birlestir.mjs`) ve gecikmeli itme döngüsü.
- 22 yeni ağsız test (bildirim + hesap); toplam 69.

## Yapılmayacaklar (bilinçli)

- Statik önyüzde sunucu tarafı render'a dönmek (maliyet ve host bağımlılığı).
- Kullanıcı verisini statik host'a yazmak.
- Video proxy'lemek/indirmek (yasal ve teknik olarak kapsam dışı).
