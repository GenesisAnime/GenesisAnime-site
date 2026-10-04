# GenesisAnime Wiki

Türkçe anime arşivi: **6.107 anime · 71.694 bölüm · 316.820 kaynak · 961 seri · 363 fansub grubu**.
Site tamamen statiktir (GitHub Pages); hesaplar, cihazlar arası senkron, “kaynak çalışmıyor”
bildirimleri ve link tarama paneli ayrı bir Cloudflare Worker ([API](API)) üzerinden yürür.

## Hızlı bağlantılar

- 🌐 **Site:** https://genesisanime.github.io/GenesisAnime-site/
- 📚 **API belgesi (sitede okunur):** https://genesisanime.github.io/GenesisAnime-site/api-dokumani/
- 🗂️ **Kaynak kodu:** https://github.com/GenesisAnime/GenesisAnime-site
- 📖 **Ayrıntılı belgeler:** depodaki `docs/` klasörü (`01`–`11` + `kararlar/ADR-*`)

## Bu wiki ne için?

Teknik ayrıntının tamamı deponun `docs/` klasöründe durur; wiki **giriş noktasıdır**: kurulum, API,
veri hattı, yayın ve katkı adımlarının kısa hâlini verir ve gerektiğinde ilgili belgeye bağlar.
Bir çelişki olursa **`docs/` kazanır** — wiki özet, kod ve belge kaynak doğrudur.

## Durum (1 Ekim 2026)

| Ölçüm | Değer |
|---|---|
| Arşiv | 6.107 anime · 71.694 bölüm · 316.820 kaynak |
| Site derlemesi | 7.442 sayfa · `out/` 21.046 dosya / 865 MB (GitHub Pages) |
| Link sağlığı | kapsam %58,7 — 173.030 `ok` · 301 `ölü` · 34 `engelli` · 12.861 `belirsiz` |
| Testler | `npm test` **119/119** (ağsız) · `npm run api:test` uzakta **46/46** |
| Otomasyon | gecelik link tarama döngüsü bu makinede saatlik zamanlayıcıda; politika D1'de, panel `/yonetim/` |
| API | Cloudflare Workers + D1 yayında; CORS yalnızca site kaynağına açık |

## Sayfalar

- [API](API) — uçlar, jetonlar, CORS, oran sınırları, örnek istekler
- [Kurulum](Kurulum) — geliştirme ortamı, ortam değişkenleri, komutlar
- [Veri Hattı](Veri-Hatti) — verinin nereden gelip nasıl üretildiği
- [Yayın](Yayin) — GitHub Pages, iş akışı, Worker dağıtımı
- [Katkı](Katki) — değişiklik yapmadan önce koşulacak kapı
