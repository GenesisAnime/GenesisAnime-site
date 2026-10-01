# ADR-0003 · Link sağlığı stratejisi ve ölü kaynak politikası

- **Tarih:** 2026-09-30
- **Durum:** Kabul edildi (Faz 7 ile genişletilecek)
- **İlgili:** [docs/09-link-sagligi-otomasyonu.md](../09-link-sagligi-otomasyonu.md)

## Bağlam

Arşivde 317.146 bağlantı var. Mevcut link kontrol aracı (`Linkleri tespit etme araçları/link_kontrol.py`)
yalnızca 4.378 bağlantıyı kontrol etmiş (toplamın **%1,38'i**) ve bu küme neredeyse tamamen One Piece
bölümlerine ait:

| Durum | Adet |
|---|---:|
| çalışıyor | 1.615 |
| ölü | 2.677 |
| engellendi | 86 |

Kaynakların çoğu gömülü video servislerinde (Sibnet 133.307, Mail.ru 88.450, Odnoklassniki 36.393,
VK 22.431…) ve zamanla ölüm oranı yüksek. Kullanıcı "bilinen ölü kaynaklar gizlensin" dedi.

## Karar

Üç durumlu bir politika uygulanır:

| Durum | Sitedeki davranış |
|---|---|
| `ok` (kontrol edildi, çalışıyor) | Listelenir, **öne alınır**, “doğrulanmış” rozeti alır |
| `olu` / `engelli` | **Siteye hiç yazılmaz** (üreteç aşamasında elenir) |
| `bilinmiyor` | Listelenir, rozet almaz, güvenilirlik sırasına göre aşağıda durur |

Ek olarak:
1. Kaynak sıralaması doğrulanmış → player güvenilirliği → URL sırasıyla yapılır.
2. Player güvenilirliği `(ok + 1) / (kontrol + 2)` (Laplace) ile hesaplanır ve oynatıcıda çubuk olarak
   gösterilir; kontrol verisi olmayan player nötr 0,5 alır.
3. Kullanıcı, oynatıcıdan "Kaynak çalışmıyor" diyerek bir URL'yi tarayıcısında işaretleyebilir; o
   kaynak o kullanıcı için gizlenir ve otomatik olarak bir sonraki kaynağa geçilir.
4. `/kunye/` sayfası kapsam yüzdesini ve yöntemi açıkça yayınlar — kullanıcı "doğrulanmış" rozetinin
   ne anlama geldiğini ve ne kadarının kapsandığını görür.

## Gerekçe

- **Kullanıcı deneyimi:** Bilinen ölü kaynağı göstermek, kullanıcıyı boş iframe'e sokar. En sık
  bildirilen şikâyet türü budur.
- **Dürüstlük:** %98,6'sı doğrulanmamışken site "tüm kaynaklar çalışıyor" izlenimi vermemelidir.
  Bu yüzden kapsam sayfası ve rozetsiz gösterim zorunludur.
- **Zarar vermeme:** Doğrulanmamış kaynağı gizlemek kataloğu boşaltırdı (141 yapımın hiç kaynağı
  kalmazdı); bu yüzden yalnızca **bilinen** ölüler gizlenir.
- **Geri dönüş kolaylığı:** Gizleme veri hattında yapılır; `kontrol_gecmisi.jsonl` güncellenip
  `npm run veri` çalıştırıldığında karar anında değişir.

## Sonuçlar

- Ölçülen etki: 317.146 → 314.392 kaynak (2.754 kaynak gizlendi), 1.613 kaynak rozetli.
- Oynatıcıda kaynak panelleri player bazında gruplanır ve güvenilirlik çubuğu gösterilir.
- Kullanıcı tarafı işaretlemeler tarayıcıda tutulur (sunucu yok).

## Bilinen zayıflık

Mevcut kontrol verisi eski ve dengesiz: Sibnet için %27 çıkıyor, oysa yüklemeli sayfaların otomatik
kontrol tarafından "ölü" sayılmış olması muhtemel. Faz 7'de:

- `belirsiz` durumu (zaman aşımı/5xx) eklenir ve **gizlenmez**,
- aynı URL iki taramada da ölü çıkarsa kalıcı damga alır,
- player DOM işareti beklenerek "video yüklendi mi" ayrımı netleştirilir,
- kapsam %100'e çıkarılana kadar `/kunye/` sayfası gerçek kapsamı göstermeye devam eder.
