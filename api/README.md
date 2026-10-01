# api/ — GenesisAnime hesap ve bildirim servisi

Cloudflare Workers + D1 üzerinde çalışan, bağımlılıksız servis (giriş: `src/index.mjs`, yardımcı
katman: `src/yardimci.mjs`). Site bu servis olmadan da tam çalışır; yalnızca hesap, senkron ve
kullanıcı bildirimleri için gerekir.

> **Kural:** Worker giriş modülü yalnızca fonksiyon / ExportedHandler dışa aktarabilir; sabitler ve
> saf yardımcılar bu yüzden `yardimci.mjs` içindedir (workerd aksi hâlde açılmaz — bkz. docs/05 H-18).

- Uçlar, kararlar, gizlilik ve kurulum: [../docs/11-hesaplar-uygulama.md](../docs/11-hesaplar-uygulama.md)
- Parola/jeton gerekçesi: [../docs/kararlar/ADR-0008-workers-parola-ve-jeton.md](../docs/kararlar/ADR-0008-workers-parola-ve-jeton.md)

## Hızlı komutlar (üretim)

Canlı servis (01.10.2026): **https://genesisanime-api.genesisanime.workers.dev** · D1 `genesisanime`
(`abde0636-74dd-4d0e-b9c6-12704d3b1f10`, bölge WEUR) · CORS yalnızca `https://nutaliaxd.github.io`.

```bash
npm install
npx wrangler d1 create genesisanime   # database_id'yi wrangler.toml'a yaz
npm run db:uzak                       # şemayı uygula
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_TOKEN   # npm run link:bildirim bu jetonu kullanır
npx wrangler secret put IP_TUZ        # (isteğe bağlı) IP tuzu
npm run deploy
```

Yeni hesaplarda iki engel çıkar: e-posta doğrulaması (`You need to verify your email address to use
Workers`, `code: 10034`) ve workers.dev alt alan adının kaydı (etkileşimsiz `deploy` bu soruyu
yanıtlayamaz) — ikisi de panelden ücretsiz çözülür; ayrıntı: [../docs/06-yayin-ve-deploy.md](../docs/06-yayin-ve-deploy.md).

Uzak duman testi (CORS yalnızca sitenin kaynağına açık olduğu için `--origin` gerekir):

```bash
cd ..                                  # site kökü
GENESIS_API_URL=https://genesisanime-api.genesisanime.workers.dev \
GENESIS_ADMIN_TOKEN=<ADMIN_TOKEN> \
npm run api:test -- --origin=https://nutaliaxd.github.io
```

## Yerel geliştirme + uçtan uca test

```bash
cd api
npm install                           # wrangler ^4 (3.x uyumluluk tarihini düşürüyor)
npm run db:yerel                      # şemayı yerel D1'e uygula (.wrangler/state; gitignore'da)
printf 'JWT_SECRET=<rastgele>\nADMIN_TOKEN=<rastgele>\nIP_TUZ=<rastgele>\n' > .dev.vars
npx wrangler dev --port 8789 --var CORS_EXTRA:http://127.0.0.1:8000,http://localhost:3000

# başka terminalde (site kökünden):
cd ..
GENESIS_API_URL=http://127.0.0.1:8789 GENESIS_ADMIN_TOKEN=<ADMIN_TOKEN> npm run api:test
```

`--oran` bayrağı 30/gün sınırını gerçekten zorlar; yerel state'i sıfırlamak için
`npx wrangler d1 execute genesisanime --local --command "DELETE FROM oran"`.

Testler kökteki `npm test` içindedir (`tools/testler/bildirim.test.mjs`, sahte D1 ile ağsız koşar);
çalışan bir API'ye karşı uçtan uca duman testi kökteki `npm run api:test` (`tools/api-uctan-uca.mjs`).
