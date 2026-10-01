-- GenesisAnime API şeması (D1 / SQLite)
-- Uygulama: npm run db:uzak   (yerelde: npm run db:yerel)

-- parola_hash biçimi: "iterasyon:base64(tuz):base64(özet)" — tuz hash içinde taşınır.
CREATE TABLE IF NOT EXISTS kullanici (
  id TEXT PRIMARY KEY,
  eposta TEXT NOT NULL UNIQUE,
  parola_hash TEXT NOT NULL,
  olusturma TEXT NOT NULL
);

-- Hem erişim jetonu hem yenileme jetonu yalnızca SHA-256 özetli saklanır.
CREATE TABLE IF NOT EXISTS oturum (
  id TEXT PRIMARY KEY,
  kullanici_id TEXT NOT NULL,
  jeton_hash TEXT NOT NULL,
  yenileme_hash TEXT NOT NULL,
  son_kullanma TEXT NOT NULL,
  olusturma TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oturum_kullanici ON oturum (kullanici_id);
CREATE INDEX IF NOT EXISTS oturum_jeton ON oturum (jeton_hash);
CREATE INDEX IF NOT EXISTS oturum_yenileme ON oturum (yenileme_hash);

-- Kullanıcı durumu tek JSON blob olarak saklanır (izleme listesi, ilerleme,
-- izlenenler, tercihler, çalışmayan işaretleri). Birleştirme istemcide yapılır;
-- sunucu sürüm numarasıyla iyimser kilitleme uygular.
CREATE TABLE IF NOT EXISTS durum (
  kullanici_id TEXT PRIMARY KEY,
  veri TEXT NOT NULL,
  surum INTEGER NOT NULL DEFAULT 1,
  zaman TEXT NOT NULL
);

-- "Kaynak çalışmıyor" bildirimleri (karar değil, tarama önceliği)
CREATE TABLE IF NOT EXISTS bildirim (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  host TEXT NOT NULL,
  anime TEXT,
  bolum INTEGER,
  tur TEXT NOT NULL DEFAULT 'calismiyor',
  ip_hash TEXT NOT NULL,
  zaman TEXT NOT NULL,
  durum TEXT NOT NULL DEFAULT 'yeni'
);
CREATE INDEX IF NOT EXISTS bildirim_zaman ON bildirim (zaman);
CREATE INDEX IF NOT EXISTS bildirim_url ON bildirim (url);

-- Basit pencere sayaçları (IP başına günlük sınır)
CREATE TABLE IF NOT EXISTS oran (
  anahtar TEXT PRIMARY KEY,
  pencere TEXT NOT NULL,
  sayi INTEGER NOT NULL
);
