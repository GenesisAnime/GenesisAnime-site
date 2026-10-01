# ADR-0004 · Üretilmiş verinin (`public/data/`) sürüm kontrolünde tutulması

- **Tarih:** 2026-09-30
- **Durum:** Kabul edildi
- **İlgili:** [ADR-0001](ADR-0001-nextjs-statik-export.md), [docs/06-yayin-ve-deploy.md](../06-yayin-ve-deploy.md)

## Bağlam

Veri hattı (`npm run veri`) iki dış girdiye bağlıdır:

1. `turkanime-v1 - güncel database.db` — **69,6 MB**, arşiv klasöründe, bu deponun dışında
2. `kontrol_gecmisi.jsonl` — link sağlık geçmişi, aynı şekilde dışarıda

Bu dosyalar bilinçli olarak depoya alınmadı: telifli içerik listeleri içeriyorlar ve depo boyutunu
büyütürler. Ancak CI (GitHub Actions) yalnızca depoya erişebilir.

Üretilen çıktı: `public/data/` → 6.107 anime JSON'u + katalog + taksonomi ≈ **47 MB**.

## Karar

`public/data/` **sürüm kontrolüne dahil edilir** (`.gitignore` dışında tutulur).
`tools/cache/` (AniList önbelleği, 8,3 MB) ve `tools/rapor/` ise ignore edilir.
CI yalnızca `npm run build` çalıştırır ve veri dosyalarının varlığını doğrular.

`tools/cache/` neden dışarıda: AniList önbelleği yeniden üretilebilir ve 117 parça dosyası içerir;
depo geçmişini şişirmeye değmez (gerekirse `public/data/` içindeki çıktıda zaten özetlenmiş hâlde var).

## Gerekçe

1. **CI basitliği:** Derleme adımı deterministik ve dış girdi gerektirmez.
2. **Yayın tekrarlanabilirliği:** Aynı commit her zaman aynı siteyi üretir.
3. **Veri denetlenebilirliği:** Üretilmiş verideki değişiklikler diff'te görünür (ör. bir kaynağın
   ölü olarak işaretlenip gizlenmesi).
4. **Kullanıcı alışkanlığı:** Mevcut arşiv projesi de 6.107 `b/*.js` dosyasını depoda tutuyor;
   aynı model sürdürülüyor.

## Sonuçlar

**Olumlu:** CI'da veri üretimi gerekmez; yayın hattı 5 adıma iner.

**Olumsuz / kabul edilen bedeller:**
- Depo boyutu ~47 MB büyür; her veri güncellemesinde tekrar commit edilir (6.107 dosya diff'i).
  Bu, kullanıcının mevcut projesindeki `yukle.ps1` ile parçalı push alışkanlığıyla yönetilebilir.
- `public/data` içeriği ile `tools/` üreteç kodu arasında tutarsızlık riski: yayınlanan veri
  depodaki koddan eski olabilir. Önlem: `katalog.json` ve `kunye.json` içindeki `uretim` alanı
  ISO zaman damgası taşır ve `/kunye/` sayfasında gösterilir.

## Alternatifler

| Alternatif | Neden reddedildi |
|---|---|
| Arşiv DB'sini depoya koyup CI'da veri üretmek | 70 MB ikili dosya + telifli liste; ayrıca CI her seferinde 4 dakikalık AniList çağrısı yapardı |
| Veriyi sürüm eki (release asset) olarak yayınlamak | Ek indirme/kimlik doğrulama adımı; kırılgan |
| Git LFS | Ücretsiz kota sınırları ve 6.107 küçük dosya için uygun değil |
| Veriyi ayrı bir "veri" deposunda tutmak | İki depo senkronu; kullanıcının mevcut iş akışına aykırı |

## Uygulama

```gitignore
tools/cache/     # AniList yanıt parçaları — yeniden üretilebilir
tools/rapor/     # ölçüm raporları — yeniden üretilebilir
# public/data/   ← ignore EDİLMEZ (gerekçesi .gitignore içinde yorum olarak da yazılı)
```

Yayın öncesi kontrol: `.github/workflows/yayinla.yml` içindeki "Veri dosyalarını doğrula" adımı
`public/data/katalog.json` yoksa anlaşılır bir hatayla durur.
