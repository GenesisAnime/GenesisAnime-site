# 08 · Topluluk Katmanı (Faz 6 tasarımı)

> Durum: **planlandı, uygulanmadı.** Faz 5 (hesaplar + API) ön koşuldur.

## Neden değerli?

Arşivde 112.541 bölüm-ekip kaydı ve (Wayback aynasında) yorum/forum verisi var. Bu projenin en
ayırt edici yanı "hangi bölümü kim çevirdi" sorusunu cevaplaması. Topluluk katmanı bu veriyi
canlı tutar: kullanıcılar ölü kaynak bildirir, eksik bölüm ekler, çeviri künyesini düzeltir.

## Kapsam

| Özellik | Not |
|---|---|
| Bölüm yorumları | Anime/bölüm bazlı; spoiler etiketi zorunlu seçenek |
| Puanlama | 5 yıldız + isteğe bağlı kısa değerlendirme |
| "Bu kaynak çalışmıyor" bildirimi | Oynatıcıdan tek tıkla; Faz 7 kuyruğuna yazılır (mevcut yerel işaretin sunucu karşılığı) |
| "Bu bölüm eksik" bildirimi | Arşiv boşluklarını toplulukla kapatma |
| Beğeni | Yorum ve bildirim oylaması |
| Moderasyon | Şikâyet kuyruğu, otomatik küfür/spam filtresi, moderatör rolleri |
| Yönetim paneli | Ayrı, kimlik doğrulamalı; statik siteye dahil edilmez |

## Kötüye kullanım riskleri ve önlemler

| Risk | Önlem |
|---|---|
| Spam/otomatik yorum | Hesap yaşı + e-posta doğrulama şartı, oran sınırı, ilk 3 yorum moderasyon kuyruğunda |
| Telifli içerik/dosya paylaşımı | Yorumlarda bağlantı yasağı (yalnızca site içi referans), otomatik URL redaksiyonu |
| Spoiler | Varsayılan gizli spoiler bloğu, başlıkta spoiler yasağı |
| Yanlış "ölü kaynak" bildirimi | Oy eşiği (ör. 3 bağımsız bildirim) sonrası otomatik gizleme, moderatör onayı ile geri alma |
| Kişisel veri | KVKK aydınlatma, silme hakkı, veri indirme uçları |

## Veri modeli (taslak)

```sql
yorum(id, kullanici_id, anime_slug, bolum, metin, spoiler, ust_yorum_id, olusturma, durum)
puan(kullanici_id, anime_slug, deger, olusturma)          -- PK(kullanici_id, anime_slug)
bildirim_oy(id, bildirim_id, kullanici_id)                -- tekrar oylamayı engeller
sikayet(id, hedef_tip, hedef_id, kullanici_id, sebep, durum)
moderasyon_kaydi(id, yonetici_id, hedef_tip, hedef_id, islem, gerekce, zaman)
```

Anime başına özet puan ortalaması, derleme sırasında statik veriye de yazılabilir
(`public/data/anime/<slug>.json` → `toplulukPuan`) — böylece liste sayfaları API çağrısı yapmaz.

## Mevcut (arşivden gelen) topluluk verisi

`avenor/turkanime-arsiv/08-yorumlar/` altında dönemin yorumları duruyor. İçe aktarma yapılırsa:

1. Yorumlar "arşiv" etiketiyle ve dönemin tarihiyle taşınır (anonimleştirme gerekli: kullanıcı
   adları eşlenmeli, e-posta/IP gibi alanlar kesinlikle alınmaz).
2. Eski forum kullanıcı verisi (`02-kullanicilar/`) **alınmaz** — kişisel veri, üstelik sahipleri
   bu siteye rıza vermedi.
3. Devre dışı bırakılmış eski yorumlar taşınmaz.

## Sıra

Faz 6, Faz 5'in API'si üzerine kurulur; yönetim paneli ayrı bir uygulama olarak (korumalı,
`noindex`) yazılır. Statik önyüzde yalnızca okuma ve yazma çağrıları yapan istemci bileşenleri olur.
