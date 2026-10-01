# ADR-0008 · Workers'ta parola özeti ve oturum jetonları

- **Durum:** kabul edildi (2026-10-01)
- **Bağlam:** Faz 5 hesap servisi (`api/`) Cloudflare Workers + D1 üzerinde çalışır.

## Karar

1. **Parolalar PBKDF2-HMAC-SHA256** ile özetlenir: **100.000 iterasyon** (workerd'in üretimde izin
   verdiği tavan — ilk tasarımdaki 210.000 yerelde çalışsa da dağıtımda
   `NotSupportedError: iteration counts above 100000 are not supported` ile düşürüyordu; bkz.
   docs/05 H-20), 16 bayt rastgele tuz, 32 bayt özet. Saklanan biçim
   `iterasyon:base64(tuz):base64(özet)`; böylece iterasyon artışı ileride kayıt bazında
   yapılabilir — tavan üstü kayıtlar doğrulamada hata fırlatmadan reddedilir. Doğrulama sabit
   süreli karşılaştırmayla yapılır.
2. **Oturumlar opak rastgele jetonlardır** (erişim 32, yenileme 48 bayt). D1'de yalnızca
   SHA-256 özetleri tutulur; erişim jetonu 12 saat, yenileme jetonu 90 gün geçerlidir.
   Yenileme tek kullanımlıktır (her yenilemede döndürülür).
3. **Çerez kullanılmaz.** İstemci jetonları `Authorization: Bearer` başlığıyla taşır ve
   `localStorage`'da saklar.

## Gerekçe

- `docs/07` taslağı argon2id öneriyordu; ancak Workers çalışma zamanında argon2 yoktur ve
  harici WASM bağımlılığı "sıfır bağımlılık" ilkesini (AGENTS §2) bozardı. PBKDF2
  WebCrypto'da yerleşiktir ve OWASP'ın izin verdiği bir seçenektir.
- `docs/07` taslağı JWT + HTTP-only yenileme çerezi öneriyordu. Statik site ile Worker farklı
  kaynaklardadır; çerezle çalışması için `SameSite=None; Secure` gerekir, bu da yerel HTTP
  geliştirmeyi kırar ve CSRF koruması için ek altyapı ister. Taşıyıcı jeton, statik sitede
  sunucu tarafı oturum durumu olmadığından daha basit ve denetlenebilir.
- Jetonların D1'de özetli tutulması, veritabanı sızıntısında oturumların doğrudan
  kullanılmasını engeller (parola özetlerinde olduğu gibi).

## Sonuçlar

- **Platform tavanı güvenlik seçimini sınırlar:** OWASP'ın PBKDF2-HMAC-SHA256 için önerdiği
  600.000 iterasyon Workers'ta mümkün değildir; tavan 100.000'dir. Kayıt/giriş tek istekte
  ~28 ms CPU harcar (ölçüldü) ve ücretsiz planın 10 ms CPU bütçesine sığmaz — hesabın Workers
  Paid olması gerekir. Tavan yükselirse `PBKDF2_TAVAN` güncellenip yeni kayıtlar daha yüksek
  sayıyla üretilebilir (eski kayıtlar kendi sayısını taşır).
- Parola sıfırlama/e-posta doğrulama geldiğinde aynı özet biçimi kullanılacak; iterasyon
  sayısı kayıt başına okunacak.
- Oturum iptali (cihazdan çıkış) `oturum` satırını silmekle yapılır; erişim jetonu kısa ömürlü
  olduğu için ek kara liste gerekmez.
- Jetonlar `localStorage`'da olduğundan XSS etkisi büyür; statik sitede kullanıcı girdisi
  yalnızca derleme zamanlı veriden geldiği için yüzey sınırlıdır. Yine de her yeni istemci
  özelliğinde `dangerouslySetInnerHTML` kullanımı denetlenmelidir.
