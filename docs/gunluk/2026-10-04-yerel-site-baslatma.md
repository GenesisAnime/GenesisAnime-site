# 2026-10-04 · Tek tıkla yerel site

## Amaç

GenesisAnime artık `GenesisAnime/GenesisAnime-site` reposunda geliştiriliyor. GitHub Pages kullanılmayacağı
kararıyla Windows'tan tek tıkla açma/kapatma yolu eklendi.

## Değişiklik

- `siteyi-baslat.cmd`: proje kökünden çift tıklanınca ilk seferde `npm ci`, ardından `127.0.0.1:3000`'de
  Next geliştirme sunucusu başlar; yanıt hazır olunca tarayıcı açılır.
- `siteyi-durdur.cmd`: sadece launcher'ın başlattığı PowerShell süreç ağacını kapatır. Portu başka bir
  uygulama kullanıyorsa o sürece dokunmaz.
- `.github/workflows/yayinla.yml` kaldırıldı. `main` push'u GitHub Pages deploy etmez.
- Eski repo kopyasındaki akış kapsamı denemesinde taşınmış `setSaniye` satırı vardı; state kaldırıldığı için
  `saniyeRef.current` olarak düzeltilerek tip hatası giderildi.
- `.gitlab-ci.yml` içindeki zorunlu `workflow.rules` kaldırıldı; branch ve MR varsayılanlarında her push için
  job seçimini GitLab'a bırakır. Eski pipeline `2909484748` `yaml invalid` göstermişti. Yerel YAML ve job
  şekli kontrolleri geçiyor; GitLab CI lint API'si 403 döndürdüğünden uzaktaki doğrulama bekliyor.

## Doğrulama

- `git diff --check` — geçti.
- `npm run typecheck` — geçti.
- `TZ=UTC npm test` — 206 geçti, 1 isteğe bağlı TMDB önbellek testi atlandı, 0 hata. Atlanan test için
  TMDB önbelleği/anahtarı yerel ortamda yok.
- `npm run build` — 7.448 sayfa; statik üretim başarılı.
- `npm run yayin:hazirla` — 21.049 dosya / 873,51 MB.
- Başlatıcı ile yerel HTTP kontrolü: `/`, `/izle/?a=naruto&b=1`, `/kunye/` — hepsi 200.
- Durdurucu sonrası port 3000 dinleyicisi yok ve `.genesisanime-local.pid` temizlendi.
- PowerShell 5.1 parser kontrolü geçti.

## Kullanım

1. `siteyi-baslat.cmd` dosyasına çift tıkla.
2. Tarayıcı `http://127.0.0.1:3000/` adresinde açılır.
3. Kapatmak için `siteyi-durdur.cmd` dosyasına çift tıkla (veya sunucu penceresinde Ctrl+C).

Pages yerine başka bir yayın host'u seçilmedi. Eski oynatıcı/kaynak refaktörü eski `site/genesisanime`
kopyasında henüz aktarılmamış, ayrı bir taşıma/gözden geçirme işidir.
