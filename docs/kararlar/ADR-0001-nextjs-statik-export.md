# ADR-0001 · Next.js App Router + tamamen statik dışa aktarım

- **Tarih:** 2026-09-30
- **Durum:** Kabul edildi
- **İlgili:** [ADR-0004](ADR-0004-veri-dizini.md), [ADR-0006](ADR-0006-onrender-ve-indexleme.md)

## Bağlam

Kullanıcı Netflix/Crunchyroll benzeri bir anime izleme sitesi istedi; başlangıçta "hesaplar ve
topluluk dahil her şey" beklentisi vardı. Aynı zamanda kullanıcının mevcut projesi (TurkAnimeTV arşivi)
GitHub Pages üzerinde tamamen statik çalışıyor ve bu model kanıtlanmış durumda.

Veri hacmi: 6.107 anime, 71.694 bölüm, 317.146 bağlantı — hepsi önceden biliniyor ve sık
değişmiyor. AniList zenginleştirmesi de derleme zamanında yapılabilir.

## Karar

Site **Next.js 15 (App Router) + TypeScript** ile yazılır ve `output: 'export'` ile **tamamen
statik** dışa aktarılır. Sunucu tarafı çalışma zamanı, API rotası veya middleware kullanılmaz.
Hesaplar ve topluluk özellikleri ayrı bir API servisi olarak sonraki fazlarda eklenir
(bkz. `docs/07-hesaplar-ve-api.md`).

## Gerekçe

1. **Maliyet ve dayanıklılık:** Statik host ücretsiz; DDoS/trafik artışı sorun olmaz.
2. **Hız:** Ön-render edilmiş HTML + 103 KB paylaşılan JS; veritabanı sorgusu yok.
3. **SEO:** 6.107 anime sayfası gerçek HTML olarak sunulur.
4. **Veri zaten statik:** İçerik derleme zamanında biliniyor; her istekte üretilecek bir şey yok.
5. **Hesaplar ayrılabilir:** Kullanıcı durumu zaten `src/lib/depo/` adaptör katmanından geçiyor;
   sunucu geldiğinde önyüz değişmeden API sürücüsüne geçilebilir.

## Sonuçlar

**Olumlu**
- Ücretsiz/ucuz yayın, yüksek önbelleklenebilirlik, tek derleme ile tüm site.
- Statik doğrulama kolay: çıktı dosya ağacı incelenebilir (`npm run yayin:hazirla`).

**Olumsuz / kabul edilen bedeller**
- Dilim bazlı derleme yok: 6.107 sayfa her seferinde üretilir (~90 sn, kabul edilebilir).
- Kişiselleştirme sunucuda yapılamaz → tarayıcı deposu (Faz 5'e kadar).
- `/izle/` sayfası tek statik kabuk olduğu için bölüm bazlı SEO yok (ADR-0006).
- Derleme çıktısı büyük (392 MB) → GitHub Pages uygun, Cloudflare Pages sınırda (18.377/20.000).

## Reddedilen alternatifler

| Alternatif | Neden reddedildi |
|---|---|
| Next.js tam yığın (SSR + API) | Sunucu maliyeti ve bakım yükü; hesaplar zaten sonraki fazda ayrı servisle çözülüyor |
| Vite + React SPA | SEO zayıf; 6.107 sayfa için ön-render altyapısı elle kurulurdu |
| Mevcut statik siteyi genişletmek (vanilla) | 6.107 anime için bileşen/kod organizasyonu sürdürülemez |
| Astro | Teknik olarak uygun; Next.js seçildi çünkü kullanıcı ekosistemi ve App Router'ın dosya tabanlı statik üretimi yeterli |

## Doğrulama

```
npm run build      → ✓ Generating static pages (6119/6119), ✓ Exporting (2/2)
npm run yayin:hazirla → 392,46 MB · 18.377 dosya · GitHub Pages uygun
```
