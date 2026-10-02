/**
 * tmdb-ara-esle.mjs — Fribb'de karşılığı olmayan yapımlar için ARAMA tabanlı eşleme
 * ================================================================================
 * Bağlam: `npm run tmdb:esle` topluluk veri kümesi (Fribb `anime-list`) ile 4.907
 * yapımı bağlıyor. Geriye **943** yapım kalıyor: AniList kimlikleri var ama veri
 * kümesinde karşılıkları yok (çoğu OVA/ONA/özel bölüm). Onlar için tek yol TMDB
 * arama ucudur.
 *
 * Risk: **yanlış eşleşme, boş banddan kötüdür** — sayfada başka bir yapımın görseli
 * görünür. Bu yüzden eşleşme üç bağımsız şarta bağlanır (animasyon türü, başlık
 * benzerliği ≥0.85, yıl ±1; bkz. `tools/lib/tmdb.mjs` · `aramaEslesmesi`) ve her
 * kayıt güven etiketi taşır: `tam` (birebir ad + birebir yıl) · `yakin`.
 *
 * RİSK ÖLÇÜMÜ (`--golge=N`): Fribb'de karşılığı **olan** N yapımda arama gizlice
 * çalıştırılır (Fribb kimliği görmezden gelinir) ve bulunan kimlik Fribb'in
 * kimliğiyle karşılaştırılır. Böylece "arama doğru kimliği ne sıklıkla buluyor,
 * ne sıklıkla yanlış kimliğe gidiyor" sorusu gerçek veriyle ölçülür — tahminle
 * değil. Gölge koşusu hiçbir şey yazmaz.
 *
 * Kullanım:
 *   npm run tmdb:ara -- --kuru        # anahtar/hedef denetimi, istek yok
 *   npm run tmdb:ara -- --limit=50    # ilk 50 hedef (sınama)
 *   npm run tmdb:ara -- --golge=200   # risk ölçümü
 *   npm run tmdb:ara                  # kalan tüm hedefler
 *   npm run tmdb:ara -- --yenile      # arama önbelleğini yok say
 *
 * Çıktılar:
 *   tools/cache/tmdb.json      (kabul edilen eşleşmeler `kaynak:'arama'` ile eklenir)
 *   tools/cache/tmdb-arama.json (arama önbelleği: kabul + ret, kesintide devam eder)
 *   tools/rapor/tmdb-arama.json (ölçüm raporu)
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, YOLLAR, baslik, envDeger, log, okuJson, yazJson } from './lib/ortak.mjs';
import { anahtarYontemi, aramaEslesmesi, formatTip } from './lib/tmdb.mjs';

const ESLEME = path.join(ROOT, 'tools', 'cache', 'tmdb.json');
const ONBELLEK = path.join(ROOT, 'tools', 'cache', 'tmdb-arama.json');
const RAPOR = path.join(ROOT, 'tools', 'rapor', 'tmdb-arama.json');
const API = 'https://api.themoviedb.org/3';

const argDeger = (ad) => {
  const a = process.argv.find((x) => x.startsWith(`--${ad}=`));
  return a ? a.slice(ad.length + 3) : null;
};
const argVar = (ad) => process.argv.includes(`--${ad}`);
const limit = argDeger('limit') ? Number(argDeger('limit')) : Infinity;
const golgeAdet = argDeger('golge') ? Number(argDeger('golge')) : 0;
const beklemeMs = argDeger('bekleme') ? Number(argDeger('bekleme')) : 60;
const kuru = argVar('kuru');
const yenile = argVar('yenile');

const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

baslik(golgeAdet ? `TMDB arama eşlemesi — GÖLGE modu (${golgeAdet} örnek)` : 'TMDB arama eşlemesi');

const anahtar =
  process.env.TMDB_ANAHTAR || process.env.TMDB_API_KEY || envDeger(path.join(ROOT, '.env'), 'TMDB_ANAHTAR', 'TMDB_API_KEY');
const yontem = anahtarYontemi(anahtar);
if (!yontem && !kuru) {
  log('   ! TMDB anahtarı yok (.env → TMDB_ANAHTAR).');
  process.exit(1);
}
log(`   anahtar: ${yontem ? (yontem === 'baslik' ? 'v4 token (Bearer)' : 'v3 anahtar (api_key)') : 'YOK (--kuru)'}`);

const esleme = okuJson(ESLEME, { kayitlar: {} });
const onbellek = yenile ? { kayitlar: {} } : okuJson(ONBELLEK, { kayitlar: {} });
const anilist = okuJson(YOLLAR.anilistCache, {});

/** Japonca (kana/kanji) başlıklar TMDB aramasında gürültü üretir; sorgulanmaz. */
const japoncaMi = (s) => /[\u3040-\u30ff\u4e00-\u9fff]/.test(String(s || ''));

/** Adayları toplayıp en iyisini seçen hedef listesi. */
const hedefler = [];
const fribbKimligi = new Map();
for (const dosya of fs.readdirSync(YOLLAR.animeData)) {
  const a = JSON.parse(fs.readFileSync(path.join(YOLLAR.animeData, dosya), 'utf8'));
  const bilinen = esleme.kayitlar[a.slug];
  if (golgeAdet) {
    // Gölge modu: yalnızca ZATEN eşleşmiş yapımlar taranır (karşılaştırma tabanı).
    if (!bilinen) continue;
    fribbKimligi.set(a.slug, bilinen);
  } else if (bilinen) {
    continue; // zaten eşleşmiş
  }
  if (!a.anilist) continue; // AniList kimliği yok: karşılaştıracak güvenilir başlık da yok
  const an = anilist[String(a.anilist)] || {};
  const adlar = [an.romaji, an.adEn, a.ad, an.adJp]
    .map((x) => String(x || '').trim())
    .filter((x) => x && !japoncaMi(x));
  const tekil = [...new Set(adlar)];
  if (!tekil.length) continue;
  hedefler.push({
    slug: a.slug,
    anilist: a.anilist,
    adlar: tekil,
    yil: a.yil || an.yil || null,
    tip: formatTip(a.format),
    format: a.format,
  });
}

if (golgeAdet) {
  // Deterministik örnek: sıralı listeden eşit aralıklı seçim (koşular karşılaştırılabilir).
  const sirali = [...hedefler].sort((a, b) => a.slug.localeCompare(b.slug, 'tr'));
  const adim = Math.max(1, Math.floor(sirali.length / golgeAdet));
  hedefler.length = 0;
  for (let i = 0; i < sirali.length && hedefler.length < golgeAdet; i += adim) hedefler.push(sirali[i]);
}

log(`   hedef: ${hedefler.length}${golgeAdet ? ' (gölge)' : ''} · önbellek: ${Object.keys(onbellek.kayitlar || {}).length}`);

if (kuru) {
  log(`\n   --kuru: ${hedefler.length} hedef taranacaktı, istek atılmadı.`);
  log('   örnek istek:', `${API}/search/tv?query=<romaji>&first_air_date_year=<yıl>`);
  log('   örnek hedef:', JSON.stringify(hedefler[0]));
  process.exit(0);
}

/** TMDB arama yanıtını ortak aday biçimine çevirir. */
function adayCikar(govde, tip) {
  return (govde.results || []).map((r) => ({
    tip,
    id: r.id,
    ad: tip === 'tv' ? r.name : r.title,
    ozgunAd: tip === 'tv' ? r.original_name : r.original_title,
    yil: Number(String((tip === 'tv' ? r.first_air_date : r.release_date) || '').slice(0, 4)) || null,
    animasyon: Array.isArray(r.genre_ids) && r.genre_ids.includes(16),
    populerlik: Number(r.popularity) || 0,
  }));
}

async function ara(sorgu, tip, yil, anahtarDegeri, yontemTipi) {
  const p = new URLSearchParams({ query: sorgu, include_adult: 'false' });
  if (yil) p.set(tip === 'tv' ? 'first_air_date_year' : 'year', String(yil));
  if (yontemTipi === 'param') p.set('api_key', anahtarDegeri);
  const url = `${API}/search/${tip}?${p.toString()}`;
  const yanit = await fetch(url, { headers: yontemTipi === 'baslik' ? { Authorization: `Bearer ${anahtarDegeri}` } : {} });
  if (yanit.status === 429) {
    log('   · TMDB oran sınırı: 5 sn bekleniyor');
    await uyu(5000);
    return null;
  }
  if (!yanit.ok) return null;
  const govde = await yanit.json();
  await uyu(beklemeMs);
  return adayCikar(govde, tip);
}

const GUVEN_SIRA = { tam: 2, yakin: 1, yok: 0 };
const basla = Date.now();
const sayac = { tam: 0, yakin: 0, bulunamadi: 0, atlanan: 0, hata: 0 };
const kabulOrnek = [];
const retOrnek = [];
/**
 * Gölge sonuçları üç sınıfa ayrılır: aynı kimlik · farklı kimlik · bulunamadı.
 * "Farklı" ikiye bölünür, çünkü ikisi aynı şey değildir:
 *   · `farkliCaprazTip`  — Fribb dizinin TMDB kimliğini verirken arama asıl FİLM
 *     kaydını bulur (arşivdeki kayıt filmdir). Aynı başlık + aynı yıl; granülerlik
 *     farkı, hata değil. Örnek: `clannad-movie` → Fribb tv/24835, arama movie/16516.
 *   · `farkliAyniTip`    — aynı tip, farklı kimlik. Gerçek yanlış eşleşme adayı
 *     (çoğu zaman TMDB'de çift kayıt) — insan gözüyle bakılması gereken sınıf.
 */
const golge = { ayni: 0, farkli: 0, farkliCaprazTip: 0, farkliAyniTip: 0, bulunamadi: 0, ornekFarkli: [], ornekAyniTip: [] };

for (const hedef of hedefler) {
  if (!yenile && onbellek.kayitlar?.[hedef.slug]) {
    sayac.atlanan++;
    continue;
  }
  let enIyi = null;
  let enIyiKaynak = null;
  let denenen = 0;
  const digerTip = hedef.tip === 'tv' ? 'movie' : 'tv';

  // Sıra: kendi tipimiz → yıl filtreli başlıklar → yıl filtresiz → diğer tip.
  const plan = [];
  for (const ad of hedef.adlar) plan.push({ ad, tip: hedef.tip, yil: hedef.yil });
  for (const ad of hedef.adlar) plan.push({ ad, tip: hedef.tip, yil: null });
  for (const ad of hedef.adlar) plan.push({ ad, tip: digerTip, yil: hedef.yil });

  for (const adim of plan) {
    const adaylar = await ara(adim.ad, adim.tip, adim.yil, anahtar, yontem);
    denenen++;
    if (!adaylar) {
      sayac.hata++;
      continue;
    }
    for (const aday of adaylar) {
      const sonuc = aramaEslesmesi(aday, hedef);
      if (sonuc.guven === 'yok') continue;
      const daha = !enIyi || GUVEN_SIRA[sonuc.guven] > GUVEN_SIRA[enIyi.guven] || (sonuc.guven === enIyi.guven && sonuc.puan > enIyi.puan);
      if (daha) {
        enIyi = { ...sonuc, tip: aday.tip, id: aday.id, adayAd: aday.ad, adayYil: aday.yil, populerlik: aday.populerlik };
        enIyiKaynak = adim;
      }
    }
    // Birebir ad + birebir yıl bulunduysa daha fazla sorgu harcamaya gerek yok.
    if (enIyi?.guven === 'tam') break;
  }

  const kayit = enIyi
    ? {
        tip: enIyi.tip,
        id: enIyi.id,
        guven: enIyi.guven,
        neden: enIyi.neden,
        puan: Number(enIyi.puan.toFixed(3)),
        sorgu: enIyiKaynak?.ad || null,
        sorguYilFiltresi: enIyiKaynak?.yil || null,
        adayAd: enIyi.adayAd,
        adayYil: enIyi.adayYil,
        arsivYil: hedef.yil,
      }
    : { bulunamadi: true, denenen };

  if (golgeAdet) {
    const bilinen = fribbKimligi.get(hedef.slug);
    if (!enIyi) {
      golge.bulunamadi++;
    } else if (enIyi.tip === bilinen.tip && Number(enIyi.id) === Number(bilinen.id)) {
      golge.ayni++;
    } else {
      golge.farkli++;
      const caprazTip = enIyi.tip !== bilinen.tip;
      if (caprazTip) golge.farkliCaprazTip++;
      else golge.farkliAyniTip++;
      const kayit = {
        slug: hedef.slug,
        adlar: hedef.adlar.slice(0, 2),
        fribb: `${bilinen.tip}/${bilinen.id}`,
        arama: `${enIyi.tip}/${enIyi.id} (${enIyi.adayAd}, ${enIyi.adayYil})`,
        guven: enIyi.guven,
      };
      if (golge.ornekFarkli.length < 20) golge.ornekFarkli.push(kayit);
      if (!caprazTip && golge.ornekAyniTip.length < 20) golge.ornekAyniTip.push(kayit);
    }
    continue; // gölge modu hiçbir şey yazmaz
  }

  onbellek.kayitlar = onbellek.kayitlar || {};
  onbellek.kayitlar[hedef.slug] = kayit;
  if (enIyi) {
    sayac[enIyi.guven]++;
    if (kabulOrnek.length < 25) {
      kabulOrnek.push({
        slug: hedef.slug,
        arsiv: `${hedef.adlar[0]} (${hedef.yil ?? '—'}, ${hedef.format || '—'})`,
        tmdb: `${enIyi.adayAd} (${enIyi.adayYil ?? '—'}, ${enIyi.tip}/${enIyi.id})`,
        guven: enIyi.guven,
        neden: enIyi.neden,
      });
    }
    esleme.kayitlar[hedef.slug] = { anilist: hedef.anilist, tip: enIyi.tip, id: enIyi.id, kaynak: 'arama', guven: enIyi.guven };
  } else {
    sayac.bulunamadi++;
    if (retOrnek.length < 20) retOrnek.push({ slug: hedef.slug, ad: hedef.adlar[0], yil: hedef.yil, format: hedef.format });
  }

  const toplam = sayac.tam + sayac.yakin + sayac.bulunamadi;
  if (toplam % 50 === 0) {
    log(`   · ${toplam} hedef (tam ${sayac.tam} · yakın ${sayac.yakin} · bulunamadı ${sayac.bulunamadi} · ${Math.round((Date.now() - basla) / 1000)} sn)`);
    yazJson(ONBELLEK, { uretim: new Date().toISOString(), sayac, kayitlar: onbellek.kayitlar }, true);
  }
}

const sure = Math.round((Date.now() - basla) / 1000);

if (golgeAdet) {
  const toplam = golge.ayni + golge.farkli + golge.bulunamadi;
  log('\n   gölge ölçüm (arama vs Fribb kimliği)');
  log(`     aynı kimlik   : ${golge.ayni}/${toplam} (%${((100 * golge.ayni) / toplam).toFixed(1)})`);
  log(`     farklı kimlik : ${golge.farkli}/${toplam} (%${((100 * golge.farkli) / toplam).toFixed(1)})`);
  log(`       granülerlik (film↔dizi, aynı ad+yıl): ${golge.farkliCaprazTip}`);
  log(`       AYNI tip farklı kimlik (incelenmeli) : ${golge.farkliAyniTip}`);
  log(`     bulunamadı    : ${golge.bulunamadi}/${toplam} (%${((100 * golge.bulunamadi) / toplam).toFixed(1)})`);
  for (const o of golge.ornekAyniTip.slice(0, 8)) log(`       ! ${o.slug}: Fribb ${o.fribb} vs arama ${o.arama} [${o.guven}]`);
  yazJson(
    RAPOR,
    { uretim: new Date().toISOString(), mod: 'golge', ornek: hedefler.length, golge, ornekFarkli: golge.ornekFarkli, sure_sn: sure },
    true
  );
  log(`\n   rapor: tools/rapor/tmdb-arama.json · süre ${sure} sn · hiçbir dosya yazılmadı (gölge)`);
} else {
  const kabul = sayac.tam + sayac.yakin;
  log('\n   ölçüm');
  log(`     hedef                 : ${hedefler.length} (atlanan ${sayac.atlanan} · hata ${sayac.hata})`);
  log(`     kabul (tam)           : ${sayac.tam}`);
  log(`     kabul (yakın)         : ${sayac.yakin}`);
  log(`     bulunamadı            : ${sayac.bulunamadi}`);
  log(`     kabul oranı           : %${((100 * kabul) / Math.max(1, hedefler.length - sayac.atlanan)).toFixed(1)}`);
  log(`     süre                  : ${sure} sn`);
  log('\n   kabul örnekleri');
  for (const k of kabulOrnek.slice(0, 12)) log(`     ${k.guven.padEnd(5)} ${k.slug}\n           arşiv: ${k.arsiv}\n           tmdb : ${k.tmdb} · ${k.neden}`);

  yazJson(ONBELLEK, { uretim: new Date().toISOString(), sayac, kayitlar: onbellek.kayitlar }, true);
  yazJson(ESLEME, esleme, true);
  yazJson(
    RAPOR,
    {
      uretim: new Date().toISOString(),
      mod: 'arama',
      hedef: hedefler.length,
      sayac,
      kabulOrnek,
      retOrnek,
      sure_sn: sure,
    },
    true
  );
  log(`\n   yazıldı: tools/cache/tmdb.json · tools/cache/tmdb-arama.json`);
  log("   sonraki adım: `npm run tmdb:zenginlestir` (yeni kimliklerin backdrop'ları) → `npm run veri`");
}
