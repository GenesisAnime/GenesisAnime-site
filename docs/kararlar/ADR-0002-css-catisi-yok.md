# ADR-0002 · Harici CSS çatısı kullanılmaması (el yazımı tasarım sistemi)

- **Tarih:** 2026-09-30
- **Durum:** Kabul edildi

## Bağlam

Plan aşamasında Tailwind CSS öngörülmüştü. Site ise çok sayıda özel görsel bileşen gerektiriyor:
Netflix tarzı yatay kaydırma satırları, hover'da büyüyen kartlar, katmanlı hero perdeleri,
güvenilirlik çubukları, oynatıcı düzeni, mobil alt menü. Bu bileşenlerin çoğu yine özel CSS yazmayı
gerektirir. Ayrıca projenin veri hattı bilinçli olarak sıfır bağımlılıkla çalışıyor.

## Karar

Tailwind kurulmaz. Tek bir `src/app/globals.css` dosyası, CSS özel değişkenleri (belirteçler) ve
adlandırılmış bileşen sınıflarıyla tasarım sistemi elle yazılır.

## Gerekçe

1. **Bağımlılık azaltma:** `postcss` + `tailwindcss` zinciri ve yapılandırması gerekmez; derleme
   yüzeyi küçülür.
2. **Tam kontrol:** Hero perdeleri, kart hover animasyonları, kaydırma okları gibi parçalar zaten
   özel CSS; yardımcı sınıflarla karıştırmak okunabilirliği düşürürdü.
3. **Tema değişkenleri:** Koyu tema + mor/magenta kimlik tek bir `:root` bloğunda toplanır; tema
   değişikliği tek dosyada yapılır.
4. **Mevcut proje uyumu:** Kullanıcının çalışan arşiv sitesi de el yazımı CSS kullanıyor; süreklilik.

## Sonuçlar

**Olumlu:** Küçük CSS çıktısı, hızlı derleme, öngörülebilir sınıf adları, kolay tema değişikliği.

**Olumsuz / kabul edilen bedeller:**
- Yeni bir bileşen yazarken sınıf uydurmak yerine mevcut sistemden seçmek gerekir; bu yüzden
  `docs/03-tasarim-sistemi.md` bir sınıf kataloğu olarak tutulur.
- Medya sorguları elle yazılır; kırılma noktaları iki tanedir (1100 px, 860 px).

## Uygulama notları

- Belirteçler `:root` içinde; bileşen sınıfları dosya sonuna doğru artan özgüllükte sıralanır.
- Yardımcı sınıflar sınırlı tutulur (`.kap`, `.gizli-gorsel`, `.devam`).
- Duyarlılık ve `prefers-reduced-motion` en sonda toplanır.

## Gözden geçirme tetikleyicisi

Aşağıdakilerden biri olursa bu karar yeniden değerlendirilir:
- `globals.css` 2.000 satırı aşarsa,
- bağımsız bir tasarım sistemi paketi (örtüşen bileşen kütüphanesi) projeye eklenirse,
- tema desteği (açık tema) talep edilip belirteçler yetmezse.
