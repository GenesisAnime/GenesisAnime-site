# ADR-0005 · Oynatıcı adres şeması: `/izle/?a=<slug>&b=<sıra>`

- **Tarih:** 2026-09-30
- **Durum:** Kabul edildi
- **İlgili:** [ADR-0006](ADR-0006-onrender-ve-indexleme.md), [docs/04-oynatici-ve-kaynaklar.md](../04-oynatici-ve-kaynaklar.md)

## Bağlam

Statik dışa aktarımda her erişilebilir yolun derleme zamanında üretilmesi gerekir. Bölüm sayfaları
net biçimde tanımlı olsaydı **71.694 HTML dosyası** üretilecekti:

| Yaklaşım | Üretilecek dosya | Sorun |
|---|---:|---|
| `/izle/[slug]/[bolum]/` (yol tabanlı) | 71.694 HTML + 71.694 RSC | ~3-4 GB çıktı; GitHub Pages 1 GB sınırı aşılır; derleme süresi saatlere çıkar |
| `/izle/?a=&b=` (sorgu tabanlı) | 1 HTML | Bölüm bazlı SEO yok |
| `/izle/[slug]/` + `?b=` | 6.107 HTML | Her anime sayfası zaten var; bölüm SEO'su yine yok, dosya sayısı artar |

Ayrıca arşivdeki bölüm slug'ları güvenilir değil: 3.808 bölüm slug'ı sayı içermiyor (`-special`),
1.911'i "bolum" kelimesi taşımıyor. Bölümü URL'de slug ile temsil etmek kırılgan olurdu.

## Karar

Oynatıcı tek bir statik sayfadır ve bölümü **sorgu parametreleriyle** temsil eder:

```
/izle/?a=<anime-slug>&b=<1 tabanlı bölüm sırası>
```

- `a`: anime slug'ı (dosya adı, doğrudan `public/data/anime/<slug>.json` isteğine karşılık gelir)
- `b`: bölümün **sıra numarası** (slug'dan çıkarılan numaradan bağımsız; special/movie için de çalışır)
- `b` yoksa kayıtlı ilerlemeden, o da yoksa 1. bölümden başlar
- Bölüm değiştirildiğinde `router.replace` ile adres güncellenir (tarayıcı geçmişi kirlenmez)
- Sayfa içeriği istemcide `fetch('/data/anime/<slug>.json')` ile yüklenir (ortalama 7,5 KB)

## Gerekçe

1. **Ölçek:** 1 HTML yerine 71 bin; çıktı 392 MB'da kalır.
2. **Dayanıklılık:** Sıra numarası arşivdeki eksik/tutarsız slug'lardan etkilenmez.
3. **Basitlik:** Yeni bir bölüm eklendiğinde yeniden derleme gerekmez — veri dosyası güncellenir.
4. **Paylaşılabilirlik:** Adres tek başına yeterlidir; kopyalanıp paylaşılabilir.

## Sonuçlar

**Olumlu:** Küçük çıktı, hızlı derleme, düşük dosya sayısı (Cloudflare Pages 20 bin sınırına sığar).

**Olumsuz / kabul edilen bedeller:**
- Bölüm sayfaları indekslenmez (ADR-0006 ile `noindex`). Uzun kuyruk SEO'su kaybedilir: "naruto 12.
  bölüm izle" aramasında bölüm sayfamız çıkmaz. Buna karşılık anime detay sayfaları (bölüm adlarını
  da listeleyen) indekslenir ve 6.107 sayfa ile SEO taşınır.
- Adresler sorgu parametresi taşıdığı için analitik/görsel olarak "yol tabanlı" kadar şık değildir.
- Birinci bölümün verisi her açılışta istemcide yüklenir (ilk boyama sonrası ~7,5 KB istek).

## Gelecekteki iyileştirme (yol tabanlı adresler)

Statik host'ta `404.html` tabanlı bir SPA yedeği yazılarak `/izle/<slug>/<sıra>` biçimi de
desteklenebilir (GitHub Pages bilinmeyen yollar için `404.html` sunar; istemci `location.pathname`
okuyup aynı oynatıcıyı çalıştırır). Dosya sayısı artmaz. Şu an uygulanmadı çünkü:

- yedek sayfa davranışı host'a bağlıdır ve sessizce bozulabilir,
- sorgu parametreli adres tüm tarayıcılarda aynı şekilde çalışır,
- kanonik adresin tek olması yinelenen içerik riskini azaltır.

Bu iyileştirme yol haritasında (`docs/10-yol-haritasi.md`) değerlendirilecek.
