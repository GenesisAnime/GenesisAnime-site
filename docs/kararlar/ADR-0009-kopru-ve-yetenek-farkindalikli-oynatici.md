# ADR-0009 · Köprü ve yetenek farkındalıklı oynatıcı

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-02
- **İlgili:** `src/lib/kopru.ts`, `src/components/IzleIstemci.tsx`, `tools/kopru-test.html`,
  `tools/kopru-komut-test.html`, `docs/04`, ADR-0005

## Bağlam

Kaynaklar `<iframe>` ile gömülüyor ve cross-origin olduğu için videonun `currentTime`/`duration`
değerleri okunamıyordu; ilerleme \"sayfada geçirilen süre\" olarak tahmin ediliyordu. Kullanıcı
\"kendi oynatıcımızı yapıp embed'lerin içinde zorla çalıştırabilir miyiz?\" diye sordu.

Bu soru iki farklı şeyi karıştırıyor: (a) embed'i **söküp** ham akışı kendi `<video>`'muzda
oynatmak, (b) embed'i **yerinde bırakıp** onunla konuşmak. (a) video proxyleme demektir; proje
kapsamı dışıdır (docs/10) ve dağıtıcı konumuna geçme + haftalık bakım kırılganlığı getirir.
(b) ise host'un resmî API'si varsa mümkündür.

## Karar

1. **Embed yerinde kalır.** Hiçbir kaynaktan ham akış çıkarılmaz.
2. **Köprü (postMessage) yalnızca ölçümle kanıtlanmış host için açılır.** Yetenekler
   `src/lib/kopru.ts` içindeki tek tabloda tutulur; tablo ölçümün kendisidir.
3. **Kanıtlanmamış yetenek için düğme gösterilmez.** Opak kaynakta şerit yalnız bilgilendirir.
4. **Gerçek konum cihazda tutulur**, hesap eşitlemesine karıştırılmaz (sunucudaki `saniye`
   farklı bir anlam taşır).
5. **Ölçüm araçları repoda kalır** (`tools/kopru-test.html`, `tools/kopru-komut-test.html`) —
   host davranışı değişirse yetenekler tahminle değil, aynı testle yeniden ölçülür.

## Ölçüm (2026-10-02, gerçek embed'ler)

| Host | Olay kanalı | Komut kanalı | Not |
|---|---|---|---|
| VK | ✓ `inited` (süre 1450 sn), `timeupdate`, `seeked`, `started` | ✓ nesne biçiminde, 1. denemede | `js_api=1` zorunlu; `no-referrer` engel değil |
| Odnoklassniki | ✓ yalnız `initToParent` + `inited` | ✗ 6 denemede sessiz | saniye/süre gelmiyor |
| Mail.ru | ✓ yalnız `inited` + `autoplay` | ✗ 6 denemede sessiz | süre gelmiyor |
| Dailymotion (`api=postMessage`) | ✗ | ✗ | kapsam dışında kaldı |
| Sibnet | ✗ | ✗ | kaynakların ~%42'si; opak |

Ek bulgu: VK adresleri arşivde `href.li/?` sarmalayıcısıyla yazılı; köprü gerçek origin ile
konuşmak zorunda olduğu için sarmalayıcı çözülür.

## Sonuçlar

- Kaynakların ~%7'sinde (VK) gerçek konum/süre ve kendi kontrollerimiz var; kalanında davranış
  değişmedi (bozulma yok, yalnız \"konum okunamaz\" notu).
- Komutlar onay olayı gelene kadar yinelenir; \"gönderdim, oldu\" varsayımı koddan çıkarıldı.
- Yanlış eşleme/ölü düğme riski, yetenek bayraklarının testle sabitlenmesiyle sınırlandı
  (`kopru.test.mjs`): bayrağı true yapmak yeni ölçüm gerektirir.
- İlerleme çubuğu ve otomatik bölüm sonu hâlâ **yapılmadı**: host'ların çoğunda olay yok, olan
  host'ta ise bölüm sonu olayı güvenilir değil. Bu ayrı bir karar ve ayrı bir ölçüm ister.
