-- 0002 · Link tarama döngüsü (yönetici paneli + yerel otomatik döngü)
-- Uygulama: npm run db:uzak   (yerelde: npm run db:yerel)
--
-- Neden sunucuda? Taramanın kendisi arşiv SQLite'ını okuduğu için yalnızca arşivin
-- bulunduğu makinede koşabilir (ADR-0004). Ama *politika* ve *kayıt* sunucuda durur:
-- panelden ayarları değiştirirsin, yerel döngü her uyanışta ayarı okur ve koşu
-- sonucunu buraya yazar. Böylece "dün gece koştu mu?" sorusunun yanıtı sitede olur.

-- Tek satırlık ayar (id = 1). Dilim/saat/yayınla bayrakları yerel döngüyü yönetir.
CREATE TABLE IF NOT EXISTS tarama_ayar (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  aktif INTEGER NOT NULL DEFAULT 1,
  dilim INTEGER NOT NULL DEFAULT 1500,
  saat INTEGER NOT NULL DEFAULT 4,
  yayinla INTEGER NOT NULL DEFAULT 0,
  push INTEGER NOT NULL DEFAULT 0,
  -- panelden "şimdi çalıştır" isteği; yerel döngü koşuyu bitirince 0'lar
  hemen INTEGER NOT NULL DEFAULT 0,
  guncelleme TEXT NOT NULL
);

-- Koşu geçmişi (son 500 kayıt tutulur; eskiler budanır).
CREATE TABLE IF NOT EXISTS tarama_kosu (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zaman TEXT NOT NULL,
  makine TEXT NOT NULL DEFAULT '',
  dilim INTEGER NOT NULL DEFAULT 0,
  sure_sn INTEGER NOT NULL DEFAULT 0,
  sonuc TEXT NOT NULL DEFAULT 'ok',
  kapsam TEXT NOT NULL DEFAULT '',
  not_metni TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tarama_kosu_zaman ON tarama_kosu (zaman);

-- Makine kalp atışları: "bilgisayar açık mı, döngü ayakta mı?"
CREATE TABLE IF NOT EXISTS tarama_kalp (
  makine TEXT PRIMARY KEY,
  zaman TEXT NOT NULL,
  surum TEXT NOT NULL DEFAULT '',
  son_karar TEXT NOT NULL DEFAULT ''
);
