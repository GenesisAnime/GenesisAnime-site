# Katkı

Depo **yaşayan bir belge** olarak yönetilir: ölçümler (test sayısı, yayın boyutu, kapsam) ve durum
tabloları her anlamlı değişiklikte tazelenir. Katkı gönderirken aynı kural geçerlidir.

## Kapı (iş “bitti” sayılmadan önce)

```bash
npm run typecheck     # 0 hata
npm test              # 119 test (ağsız)
npm run build         # statik çıktı üretilmeli
npm run yayin:hazirla # boyut denetimi (< 1 GB)
```

Kurallar:

- `tools/`, `src/lib/depo/` ve `api/src/` mantığı değiştiyse `npm test` **zorunludur**.
- Yeni bir **karar kuralı** eklerken `tools/testler/` içine sentetik bir örnek yazılır; testler
  ağsız ve bağımlılıksız kalır (API testleri sahte D1 kullanır).
- Belge güncel tutulur: kullanıcıya dönük API değişikliğinde `src/app/api-dokumani/page.tsx`
  güncellenir — testi (`api-dokumani.test.mjs`) belgeyi yönlendiriciyle karşılaştırır.
- Gerçek bir hata bulunduğunda belgeye **kanıtla** yazılır (`docs/05` “Tuzaklar”, H-xx numaralı
  bölümler) — ölçüm, belirti ve düzeltme birlikte.
- Sır (jeton, anahtar) commit edilmez; kök `.env` gitignore'dadır.

## Doğrulama kültürü

Her iddia ölçümle desteklenir: yeni bir kaynak seçilirken karşılaştırma yapılır (ör. “AniList banner
tavanı 1900 px, CDN'de büyük varyant 404, Kitsu 15 başlıkta 8 kez daha dar”), bir tuzağın gerçekten
kapandığı **gerçek** bir senaryoyla sınanır (ör. çalışma dizini `out/` olan bir süreçle kilit kurup
derlemeyi zorlamak). Sınırlar da yazılır: “kanıtlanan bu, kanıtlanmayan şu” (ör. gece boyu koşu
ancak ardıl günlerin kaydıyla kanıtlanır).

## Nelere katkı ihtiyaç var?

- Analytics kararı (çerez/IP nedeniyle KVKK onay katmanı gerektirir)
- Yayın boyutunu ~400 MB küçültme
- 4K banner'lar (TMDB eşlemesi hazır; `banner4k` alanı ve atıf satırı bekliyor)
- Bot duvarlı host'lar (voe, dood, MEGA) için tarayıcı katmanı
- Erişilebilirlik ve klavye ile tam gezinme

## Bağlantılar

- [Kurulum](Kurulum) · [Veri Hattı](Veri-Hatti) · [Yayın](Yayin) · [API](API)
- Depo belgeleri: `docs/01`–`docs/11` + `docs/kararlar/ADR-*`
