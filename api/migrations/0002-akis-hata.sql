-- Akış çözümleme hataları (site playerı) — hangi host, hangi bölümde çözülemedi?
-- Karar değil, ölçüm verisi: yönetici panelinde host bazında toplanır ve kapsam
-- listesini gerçek sonuçlarla besler (bkz. docs/12-akis-koprusu.md).
--
-- Gizlilik: IP adresi saklanmaz, yalnızca tuzlu SHA-256 özeti (ip_hash) tutulur —
-- bildirim tablosuyla aynı kural. Tekilleştirme: aynı IP + kaynak + hata kodu
-- 1 saat içinde ikinci kez yazılmaz (zincir aynı kaynağı tekrar denerse şişmez).
CREATE TABLE IF NOT EXISTS akis_hata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  host TEXT NOT NULL,
  anime TEXT,
  bolum INTEGER,
  hata TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  zaman TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS akis_hata_zaman ON akis_hata (zaman);
CREATE INDEX IF NOT EXISTS akis_hata_host ON akis_hata (host);
CREATE INDEX IF NOT EXISTS akis_hata_url ON akis_hata (url);
