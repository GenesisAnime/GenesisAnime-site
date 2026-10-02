/**
 * export-data.mjs — arşiv veritabanından site verisini üretir
 * ==================================================================
 * Girdi (salt okunur):
 *   - "Yeni turkanimetv arsiv/güncel database/turkanime-v1 - güncel database.db"
 *   - "Linkleri tespit etme araçları/kontrol_gecmisi.jsonl"
 *   - tools/cache/anilist.json  (enrich-anilist.mjs üretir; yoksa zenginleştirme atlanır)
 *
 * Çıktı (hepsi public/data altında, GitHub Pages statik export'a girer):
 *   katalog.json        tüm animeler, kompakt kolon dizisi (arama + /kesfet filtresi)
 *   anime/<slug>.json   oynatıcı ve detay sayfası verisi (bölümler + çalışan kaynaklar)
 *   taksonomi.json      tür/format/yıl/player/fansub kırılımları + player güvenilirliği
 *   ana-sayfa.json      ana sayfa satırları (build zamanında okunur, istemciye gitmez)
 *   kunye.json          site istatistikleri
 *   saglik.json         link sağlık kontrolü kapsam/özet raporu
 *
 * Kullanım: npm run veri        (  node --no-warnings tools/export-data.mjs  )
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ROOT,
  YOLLAR,
  DURUM,
  saglikOku,
  hostAl,
  araAnahtari,
  bolumNoCikar,
  bolumEtiketi,
  ekipBilgisiTemizle,
  ANILIST_TUR,
  ETIKET_TUR,
  turEsle,
  turSirala,
  yazJson,
  okuJson,
  kb,
  mb,
  log,
  baslik,
  varMiYol,
} from './lib/ortak.mjs';

const BASLA = Date.now();
const URETIM_ZAMANI = new Date().toISOString();
const KANCA = { cagrildi: false };

if (!varMiYol(YOLLAR.db)) {
  console.error(`\n[!] Arşiv veritabanı bulunamadı:\n    ${YOLLAR.db}\n` +
    `    GENESIS_DB ortam değişkeni ile yolu elle verebilirsin.\n`);
  process.exit(1);
}

/* ================================================================ */
baslik('1/7 · Girdiler okunuyor');
/* ================================================================ */

const saglik = saglikOku(); // arşiv kaydı + kendi tarayıcımız (link-durum.jsonl) birleşik
const kendiSaglik = saglikOku([YOLLAR.linkDurum]);
const anilist = okuJson(YOLLAR.anilistCache, {});
const anilistVar = Object.keys(anilist).length > 0;

// TMDB backdrop'ları (4K banner): `npm run tmdb:zenginlestir` üretir, anahtar
// gerektirir ve depoda tutulmaz. Yoksa site AniList banner'ında kalır — eksik
// dosya bir hata değil, "4K yok" demektir.
const tmdbOnbellek = okuJson(path.join(ROOT, 'tools', 'cache', 'tmdb-backdrop.json'), {});
const tmdbDortK = new Map();
for (const [slug, k] of Object.entries(tmdbOnbellek.kayitlar || {})) {
  if (k && k.yeterli && k.url && k.genislik > 0) tmdbDortK.set(slug, k);
}

log(`   link sağlık kaydı : ${saglik.size}`);
log(`   AniList önbelleği : ${anilistVar ? `${Object.keys(anilist).length} anime` : 'YOK (zenginleştirme atlanacak)'}`);
log(`   TMDB 4K backdrop  : ${tmdbDortK.size ? `${tmdbDortK.size} anime (≥3000 px)` : 'YOK (banner geliştirmesi atlanacak)'}`);

const db = new DatabaseSync(YOLLAR.db, { readOnly: true });

const animeSatirlari = db.prepare('SELECT id, slug, baslik, bolum_sayisi FROM anime ORDER BY id').all();
const metaSatirlari = db.prepare('SELECT * FROM anime_meta').all();
const bolumSatirlari = db.prepare('SELECT id, anime_id, slug, ad FROM bolum ORDER BY anime_id, id').all();
const linkSatirlari = db.prepare('SELECT bolum_id, player, fansub, deger FROM link ORDER BY bolum_id, id').all();
const ekipSatirlari = db
  .prepare(
    'SELECT e.bolum_id AS bolum_id, g.name AS grup, e.full_info AS info ' +
      'FROM ta_episode_fansub e JOIN ta_fansub_group g ON g.id = e.fansub_group_id'
  )
  .all();
db.close();

log(`   anime ${animeSatirlari.length} · bölüm ${bolumSatirlari.length} · link ${linkSatirlari.length} · ekip kaydı ${ekipSatirlari.length}`);

/* ================================================================ */
baslik('2/7 · Player güvenilirliği hesaplanıyor (link kontrol verisinden)');
/* ================================================================ */

// Not: `kontrol` yalnızca KESİN kararları sayar (ok/olu/engelli). "Belirsiz"
// kayıtlar (bot duvarı, DDoS koruması, kanıtsız yanıt) güvenilirlik paydasına
// girmez; aksi halde kararsız kalınan her ölçüm player'ı haksız yere düşürürdü.

/** host -> player (link tablosundan) */
const hostPlayer = new Map();
for (const l of linkSatirlari) {
  const h = hostAl(l.deger);
  if (h && !hostPlayer.has(h)) hostPlayer.set(h, l.player);
}

const playerIstatistik = new Map(); // player -> { ok, olu, engelli, belirsiz, kontrol }
function playerSayac(p) {
  let s = playerIstatistik.get(p);
  if (!s) {
    s = { ok: 0, olu: 0, engelli: 0, belirsiz: 0, kontrol: 0 };
    playerIstatistik.set(p, s);
  }
  return s;
}

// Aynı URL birden fazla player altında görünüyorsa hepsine yaz (nadir).
const hostCache = new Map();
for (const [url, kayit] of saglik) {
  const h = url.includes('://') ? hostAl(url) : '';
  let player = hostCache.get(h);
  if (player === undefined) {
    player = hostPlayer.get(h) || null;
    hostCache.set(h, player);
  }
  if (!player) player = 'DIGER';
  const s = playerSayac(player);
  if (kayit.durum === DURUM.OK) {
    s.ok++;
    s.kontrol++;
  } else if (kayit.durum === DURUM.OLU) {
    s.olu++;
    s.kontrol++;
  } else if (kayit.durum === DURUM.ENGELLI) {
    s.engelli++;
    s.kontrol++;
  } else {
    s.belirsiz++;
  }
}

/** Laplace düzeltmeli güvenilirlik: (ok+1)/(kontrol+2). Kontrol verisi yoksa nötr 0.5. */
function guvenilirlik(p) {
  const s = playerIstatistik.get(p);
  if (!s || s.kontrol === 0) return 0.5;
  return (s.ok + 1) / (s.kontrol + 2);
}

for (const l of linkSatirlari) playerSayac(l.player).kontrol; // player'lar listeye girsin
const guvenSirasi = new Map(
  [...playerIstatistik.keys()]
    .sort((a, b) => guvenilirlik(b) - guvenilirlik(a))
    .map((p, i) => [p, i])
);

log(`   ${playerIstatistik.size} player · en güvenilir 5: ` +
  [...guvenSirasi.keys()].slice(0, 5).map((p) => `${p}(${(guvenilirlik(p) * 100).toFixed(0)}%)`).join(', '));

/* ================================================================ */
baslik('3/7 · Veri yapıları kuruluyor');
/* ================================================================ */

const metaById = new Map();
for (const m of metaSatirlari) metaById.set(m.anime_id, m);

const animeById = new Map();
for (const a of animeSatirlari) animeById.set(a.id, a);

/** AniList kimliği -> arşiv slug'ı (ilişkili yapımları tıklanabilir yapmak için) */
const anilistIdToSlug = new Map();
for (const m of metaSatirlari) {
  if (!m.anilist_id) continue;
  const a = animeById.get(m.anime_id);
  if (a) anilistIdToSlug.set(String(m.anilist_id), a.slug);
}

const bolumlerByAnime = new Map();
const bolumById = new Map();
for (const b of bolumSatirlari) {
  let dizi = bolumlerByAnime.get(b.anime_id);
  if (!dizi) {
    dizi = [];
    bolumlerByAnime.set(b.anime_id, dizi);
  }
  const kayit = { id: b.id, slug: b.slug, ad: b.ad, sira: dizi.length + 1, kaynaklar: [] };
  dizi.push(kayit);
  bolumById.set(b.id, kayit);
}

const ekipByBolum = new Map();
for (const e of ekipSatirlari) {
  let dizi = ekipByBolum.get(e.bolum_id);
  if (!dizi) {
    dizi = [];
    ekipByBolum.set(e.bolum_id, dizi);
  }
  dizi.push(e);
}

let baglanmayanLink = 0;
for (const l of linkSatirlari) {
  const b = bolumById.get(l.bolum_id);
  if (!b) {
    baglanmayanLink++;
    continue;
  }
  b.kaynaklar.push(l);
}

log(`   anime ${animeSatirlari.length} · bölüm ${bolumById.size} · eşleşmeyen link ${baglanmayanLink}`);

/* ================================================================ */
baslik('4/7 · Anime kayıtları derleniyor');
/* ================================================================ */

const sayac = {
  atilanOlu: 0,
  atilanEngelli: 0,
  tutulanKaynak: 0,
  tekilKaynak: new Set(),
  dogrulanmisKaynak: 0,
  banner4k: 0,
  bölümsüzAnime: 0,
  kaynaksizAnime: 0,
  zenginlestirilmis: 0,
  iliskiToplam: 0,
  yasalToplam: 0,
};

const katalog = [];
const anaSayfaHavuz = [];
const turSayaci = new Map();
const formatSayaci = new Map();
const yilSayaci = new Map();
const fansubSayaci = new Map();
const playerLinkSayaci = new Map();

/** AniList `genres` (öncelikli), arşiv `genres_json` etiketleri ve AniList `tags` birleşiminden Türkçe kategori listesi. */
function turleriCikar(meta, an) {
  const set = new Set();
  if (an && Array.isArray(an.tur)) for (const g of an.tur) {
    const ad = turEsle(g);
    if (ad) set.add(ad);
  }
  if (an && Array.isArray(an.etk)) {
    for (const t of an.etk.slice(0, 15)) {
      const ad = turEsle(t);
      if (ad) set.add(ad);
    }
  }
  if (meta && meta.genres_json) {
    let dizi = [];
    try {
      dizi = JSON.parse(meta.genres_json) || [];
    } catch {
      dizi = [];
    }
    for (const t of dizi) {
      const ad = turEsle(t);
      if (ad) set.add(ad);
    }
  }
  return [...set].sort(turSirala).slice(0, 8);
}

/** Arama anahtarı: normalize edilmiş, tekrarsız kelime listesi. */
function araAnahtariTekil(metin) {
  const kelimeler = araAnahtari(metin).split(' ').filter(Boolean);
  const tekil = [];
  const gorulen = new Set();
  for (const k of kelimeler) {
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    tekil.push(k);
    if (tekil.join(' ').length > 140) break;
  }
  return tekil.join(' ');
}

function kaynakSirala(kaynaklar) {
  return kaynaklar.sort((a, b) => {
    const da = a.durum === 'ok' ? 0 : 1;
    const dbb = b.durum === 'ok' ? 0 : 1;
    if (da !== dbb) return da - dbb;
    const ga = guvenSirasi.get(a.player) ?? 999;
    const gb = guvenSirasi.get(b.player) ?? 999;
    if (ga !== gb) return ga - gb;
    return a.url.localeCompare(b.url);
  });
}

/* ---- seri (franchise) grupları: ilişki ağında birleşim-bul ---- */
const SERI_ILISKI = new Set(['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'PARENT', 'SUMMARY']);
// Crossover yapımlar ("… vs. …") iki franchise'ı tek grupta birleştirir
// (ör. Lupin III vs. Detective Conan); köprü kurmalarına izin verilmez.
const KROS_AD = /\bvs\.?\b/i;
const slugKumesi = new Set(animeSatirlari.map((a) => a.slug));
const seriBilgi = new Map(); // slug -> { ad, yil, p }
for (const a of animeSatirlari) {
  const m = metaById.get(a.id);
  const an = m?.anilist_id ? anilist[String(m.anilist_id)] : null;
  seriBilgi.set(a.slug, { ad: a.baslik, yil: m?.year ?? null, p: m?.poster_url || an?.xl || null });
}
const ebeveyn = new Map();
const kokBul = (x) => {
  let r = x;
  while (ebeveyn.get(r) !== r) r = ebeveyn.get(r);
  let c = x;
  while (ebeveyn.get(c) !== r) {
    const n = ebeveyn.get(c);
    ebeveyn.set(c, r);
    c = n;
  }
  return r;
};
for (const s of slugKumesi) ebeveyn.set(s, s);
for (const a of animeSatirlari) {
  const m = metaById.get(a.id);
  const an = m?.anilist_id ? anilist[String(m.anilist_id)] : null;
  if (!an || !Array.isArray(an.iliski)) continue;
  for (const r of an.iliski) {
    // Ham AniList kaydında hedef yapım `id` ile gelir; arşiv slug'ına çevrilir.
    const hedef = r?.id ? anilistIdToSlug.get(String(r.id)) : null;
    if (!hedef || !SERI_ILISKI.has(r.t) || !slugKumesi.has(hedef)) continue;
    if (KROS_AD.test(seriBilgi.get(a.slug)?.ad || '') || KROS_AD.test(seriBilgi.get(hedef)?.ad || '')) continue;
    const ra = kokBul(a.slug);
    const rb = kokBul(hedef);
    if (ra !== rb) ebeveyn.set(ra, rb);
  }
}
const seriGruplari = new Map(); // kök -> [slug]
for (const s of slugKumesi) {
  const kok = kokBul(s);
  if (!seriGruplari.has(kok)) seriGruplari.set(kok, []);
  seriGruplari.get(kok).push(s);
}
/** slug -> seri slug'ı (yalnızca 2+ üyeli gruplar) */
const seriBySlug = new Map();
const seriler = [];
for (const uyeler of seriGruplari.values()) {
  if (uyeler.length < 2) continue;
  const sirali = uyeler
    .map((s) => ({ s, ...(seriBilgi.get(s) || { ad: s, yil: null, p: null }) }))
    .sort((a, b) => (a.yil ?? 9999) - (b.yil ?? 9999) || a.s.localeCompare(b.s, 'tr'));
  // Kök, seri adresini ve adını belirler: adı en çok üyenin öneki olan yapım
  // (franchise tabanı: "Naruto", "Dragon Ball") önce; eşitlikte en kısa ad,
  // sonra en eski yıl, sonra slug.
  const adNorm = new Map(sirali.map((u) => [u.s, araAnahtari(u.ad)]));
  const onekSayi = new Map(
    sirali.map((u) => {
      const n = adNorm.get(u.s);
      const sayi = sirali.filter((o) => {
        if (o.s === u.s) return false;
        const no = adNorm.get(o.s);
        return no === n || no.startsWith(`${n} `);
      }).length;
      return [u.s, sayi];
    })
  );
  const kok = [...sirali].sort(
    (a, b) =>
      (onekSayi.get(b.s) ?? 0) - (onekSayi.get(a.s) ?? 0) ||
      a.ad.length - b.ad.length ||
      (a.yil ?? 9999) - (b.yil ?? 9999) ||
      a.s.localeCompare(b.s, 'tr')
  )[0];
  for (const u of sirali) seriBySlug.set(u.s, kok.s);
  seriler.push({ s: kok.s, ad: kok.ad, uyeler: sirali });
}
seriler.sort((a, b) => b.uyeler.length - a.uyeler.length || a.ad.localeCompare(b.ad, 'tr'));
log(`   seri grubu: ${seriler.length} · kapsanan yapım: ${seriBySlug.size}`);
let islenen = 0;
for (const a of animeSatirlari) {
  const meta = metaById.get(a.id) || null;
  const an = meta && meta.anilist_id ? anilist[String(meta.anilist_id)] || null : null;
  if (an) sayac.zenginlestirilmis++;

  const dizi = bolumlerByAnime.get(a.id) || [];
  if (dizi.length === 0) sayac.bölümsüzAnime++;

  const bolumler = [];
  let animeKaynak = 0;

  for (const b of dizi) {
    const goruldu = new Set();
    const kaynaklar = [];

    for (const l of b.kaynaklar) {
      const durum = saglik.get(l.deger)?.durum || DURUM.BILINMIYOR;
      if (durum === DURUM.OLU) {
        sayac.atilanOlu++;
        continue;
      }
      if (durum === DURUM.ENGELLI) {
        sayac.atilanEngelli++;
        continue;
      }
      const anahtar = `${l.player}|${l.deger}`;
      if (goruldu.has(anahtar)) continue;
      goruldu.add(anahtar);

      const fansub = l.fansub && l.fansub !== 'Varsayılan' ? l.fansub : null;
      const kayit = { player: l.player, fansub, url: l.deger, durum };
      kaynaklar.push(kayit);
      sayac.tekilKaynak.add(l.deger);
      playerLinkSayaci.set(l.player, (playerLinkSayaci.get(l.player) || 0) + 1);
      if (durum === DURUM.OK) sayac.dogrulanmisKaynak++;
    }

    kaynakSirala(kaynaklar);
    animeKaynak += kaynaklar.length;
    sayac.tutulanKaynak += kaynaklar.length;

    // bölüm ekibi (fansub grubu + çevirmen/redaktör bilgisi)
    const ekipGoruldu = new Set();
    const ekip = [];
    for (const e of ekipByBolum.get(b.id) || []) {
      const anahtar = `${e.grup}|${e.info}`;
      if (ekipGoruldu.has(anahtar)) continue;
      ekipGoruldu.add(anahtar);
      ekip.push({ g: e.grup, e: ekipBilgisiTemizle(e.info) || null });
    }
    if (ekip.length === 0) {
      for (const k of kaynaklar) {
        if (!k.fansub || ekipGoruldu.has(k.fansub)) continue;
        ekipGoruldu.add(k.fansub);
        ekip.push({ g: k.fansub, e: null });
      }
    }
    for (const e of ekip) {
      let f = fansubSayaci.get(e.g);
      if (!f) {
        f = { anime: new Set(), bolum: 0 };
        fansubSayaci.set(e.g, f);
      }
      f.bolum++;
      f.anime.add(a.slug);
    }

    const labelsiz = bolumEtiketi(b.ad, a.baslik);
    bolumler.push({
      n: b.sira,
      no: bolumNoCikar(b.slug),
      ad: labelsiz || b.ad,
      slug: b.slug,
      ks: kaynaklar.length,
      ekip,
      src: kaynaklar.map((k) =>
        k.durum === 'ok' ? [k.player, k.fansub, k.url, 'ok'] : [k.player, k.fansub, k.url]
      ),
    });
  }

  if (animeKaynak === 0) sayac.kaynaksizAnime++;

  const poster = meta?.poster_url || an?.xl || null;
  const banner = an?.ban || null;
  // 4K banner yalnızca gerçekten geniş bir TMDB backdrop'u varsa yazılır: eşit
  // veya daha küçük bir görsel için kaynak değiştirmenin anlamı yok.
  const dortK = tmdbDortK.get(a.slug) || null;
  const banner4k = dortK ? dortK.url : null;
  // Genişlik `srcSet` adayını doğru bildirmek için taşınır (detay bandı ve hero).
  const banner4kGenislik = dortK ? dortK.genislik : null;
  if (banner4k) sayac.banner4k++;
  const yil = meta?.year || null;
  // DİKKAT: arşivdeki `score` kolonu 0–10 ölçeğinde saklanıyor (ör. 5.59 = 56).
  // AniList averageScore ise 0–100. İkisini tek ölçekte (0–100) birleştiriyoruz.
  const puanHam = an?.puan ?? (typeof meta?.score === 'number' ? meta.score * 10 : null);
  const puan = puanHam == null ? null : Math.round(puanHam);
  const format = meta?.format || null;
  const durum = meta?.status || null;
  const sezon = meta?.season || null;
  const sure = meta?.duration || null;

  const turler = turleriCikar(meta, an);

  const iliski = [];
  if (an && Array.isArray(an.iliski)) {
    for (const r of an.iliski.slice(0, 12)) {
      if (!r || !r.ad) continue;
      const s = r.id ? anilistIdToSlug.get(String(r.id)) || null : null;
      if (s === a.slug) continue;
      iliski.push({ t: r.t || null, s, ad: r.ad, p: r.p || null, f: r.f || null });
    }
    sayac.iliskiToplam += iliski.length;
  }

  const yasal = [];
  if (an && Array.isArray(an.yasal)) {
    for (const y of an.yasal.slice(0, 6)) if (y && y.u) yasal.push({ a: y.a || 'Kaynak', u: y.u });
    sayac.yasalToplam += yasal.length;
  }

  const ozet = an?.oz || null;
  const fragman = an?.frag || null;

  const adAnahtar = [
    a.baslik,
    meta?.english_title || '',
    an?.adEn || '',
    an?.romaji || '',
    an?.adJp || '',
    ...(meta?.synonyms_json
      ? (() => {
          try {
            return (JSON.parse(meta.synonyms_json) || []).slice(0, 6);
          } catch {
            return [];
          }
        })()
      : []),
  ]
    .filter(Boolean)
    .join(' ');

  const animeKaydi = {
    slug: a.slug,
    ad: a.baslik,
    adEn: meta?.english_title || an?.adEn || null,
    yil,
    puan,
    format,
    durum,
    sezon,
    sure,
    poster,
    banner,
    banner4k,
    banner4kGenislik,
    ozet,
    turler,
    iliski,
    seri: seriBySlug.get(a.slug) ?? null,
    fragman,
    yasal,
    kaynakSayisi: animeKaynak,
    bolumSayisi: dizi.length,
    bolumler,
  };

  fs.mkdirSync(YOLLAR.animeData, { recursive: true });
  yazJson(path.join(YOLLAR.animeData, `${a.slug}.json`), animeKaydi, true);

  katalog.push([
    a.slug,
    a.baslik,
    yil,
    puan,
    format,
    poster,
    dizi.length,
    turler,
    araAnahtariTekil(adAnahtar),
    durum,
    animeKaynak,
    a.id,
  ]);

  if (poster) {
    anaSayfaHavuz.push({
      s: a.slug,
      ad: a.baslik,
      yil,
      puan,
      format,
      p: poster,
      ban: banner,
      ban4k: banner4k,
      bw: dortK ? dortK.genislik : null,
      bs: dizi.length,
      ks: animeKaynak,
      t: turler.slice(0, 3),
      oz: ozet ? ozet.slice(0, 260) : null,
      id: a.id,
      sezon,
      fr: fragman?.site === 'youtube' ? fragman.id : null,
    });
  }

  for (const t of turler) turSayaci.set(t, (turSayaci.get(t) || 0) + 1);
  if (format) formatSayaci.set(format, (formatSayaci.get(format) || 0) + 1);
  if (yil) yilSayaci.set(yil, (yilSayaci.get(yil) || 0) + 1);

  islenen++;
  if (islenen % 1000 === 0) log(`   ... ${islenen}/${animeSatirlari.length}`);
}

log(`   anime dosyası yazıldı: ${islenen}`);
log(`   atılan ölü kaynak: ${sayac.atilanOlu} · engelli: ${sayac.atilanEngelli} · tutulan: ${sayac.tutulanKaynak}`);

/* ---- fansub grup slug'ları (kalıcı sayfa adresi) ---- */
function slugla(metin) {
  return araAnahtari(metin).replace(/ /g, '-').replace(/^-+|-+$/g, '') || 'grup';
}
const fansubSluglari = new Map();
const slugSayaci = new Map();
for (const ad of [...fansubSayaci.keys()].sort((a, b) => a.localeCompare(b, 'tr'))) {
  const temel = slugla(ad);
  const n = (slugSayaci.get(temel) ?? 0) + 1;
  slugSayaci.set(temel, n);
  fansubSluglari.set(ad, n === 1 ? temel : `${temel}-${n}`);
}
log(`   fansub slug'ı: ${fansubSluglari.size}`);

/* ================================================================ */
baslik('5/7 · Ana sayfa satırları ve taksonomi');
/* ================================================================ */

const havuz = anaSayfaHavuz;
const kaynakliHavuz = havuz.filter((x) => x.ks > 0);
const puanli = (x) => (typeof x.puan === 'number' ? x.puan : 0);

function satir(baslikMetin, kayitlar, tur = null) {
  const goruldu = new Set();
  const ogeler = [];
  for (const k of kayitlar) {
    if (!k || goruldu.has(k.s)) continue;
    goruldu.add(k.s);
    ogeler.push(k);
    if (ogeler.length >= 30) break;
  }
  return { baslik: baslikMetin, tur, ogeler };
}

log(
  `   hero havuzu: ${havuz.length} · kaynaklı: ${kaynakliHavuz.length} · ` +
    `bannerlı: ${kaynakliHavuz.filter((x) => x.ban).length} · ` +
    `4K: ${kaynakliHavuz.filter((x) => x.ban4k).length} · ` +
    `banner+yıl≥2010: ${kaynakliHavuz.filter((x) => (x.ban || x.ban4k) && x.yil && x.yil >= 2010).length} · ` +
    `+puan≥70: ${kaynakliHavuz.filter((x) => (x.ban || x.ban4k) && x.yil && x.yil >= 2010 && puanli(x) >= 70).length}`
);

// Hero görseli ya AniList banner'ından ya TMDB 4K backdrop'undan gelir; ikisi de
// yoksa aday olamaz. 4K varsa hero onu kullanır (16:9 → bantta dikey %82 görünür).
const hero = kaynakliHavuz
  .filter((x) => (x.ban || x.ban4k) && x.yil && x.yil >= 2010 && puanli(x) >= 70)
  .sort((a, b) => puanli(b) - puanli(a))
  .slice(0, 24);
log(`   hero: ${hero.length} kayıt · 4K: ${hero.filter((x) => x.ban4k).length}`);

const satirlar = [
  satir(
    'Şu An Popüler',
    kaynakliHavuz.slice().sort((a, b) => puanli(b) - puanli(a))
  ),
  satir(
    'Yeni Eklenenler',
    kaynakliHavuz.slice().sort((a, b) => b.id - a.id)
  ),
  satir(
    '2026 Sezonu',
    kaynakliHavuz.filter((x) => x.yil === 2026).sort((a, b) => puanli(b) - puanli(a))
  ),
  satir(
    'Son 5 Yılın En İyileri',
    kaynakliHavuz.filter((x) => x.yil && x.yil >= 2021 && x.yil <= 2026).sort((a, b) => puanli(b) - puanli(a))
  ),
  satir(
    'Uzun Soluklu Seriler',
    kaynakliHavuz.filter((x) => x.bs >= 100).sort((a, b) => b.bs - a.bs)
  ),
  satir(
    'Filmler',
    kaynakliHavuz.filter((x) => x.format === 'MOVIE').sort((a, b) => puanli(b) - puanli(a))
  ),
  satir(
    'Klasikler (2010 ve Öncesi)',
    kaynakliHavuz.filter((x) => x.yil && x.yil <= 2010).sort((a, b) => puanli(b) - puanli(a))
  ),
  satir(
    'Kısa ve Tatlı (13 bölüm ve altı)',
    kaynakliHavuz.filter((x) => x.bs > 0 && x.bs <= 13 && x.format === 'TV').sort((a, b) => puanli(b) - puanli(a))
  ),
  ...[
    'Aksiyon',
    'Macera',
    'Komedi',
    'Dram',
    'Fantastik',
    'Bilim Kurgu',
    'Romantik',
    'Günlük Yaşam',
    'Gizem',
    'Isekai',
  ].map((tur) =>
    satir(
      tur,
      kaynakliHavuz.filter((x) => x.t.includes(tur)).sort((a, b) => puanli(b) - puanli(a)),
      tur
    )
  ),
].filter((s) => s.ogeler.length >= 6);

const anaSayfa = {
  uretim: URETIM_ZAMANI,
  hero,
  satirlar,
};

const taksonomi = {
  uretim: URETIM_ZAMANI,
  turler: [...turSayaci.entries()].map(([ad, sayi]) => ({ ad, sayi })).sort((a, b) => b.sayi - a.sayi),
  formatlar: [...formatSayaci.entries()].map(([ad, sayi]) => ({ ad, sayi })).sort((a, b) => b.sayi - a.sayi),
  yillar: [...yilSayaci.entries()].map(([yil, sayi]) => ({ yil, sayi })).sort((a, b) => b.yil - a.yil),
  playerlar: [...playerIstatistik.entries()]
    .map(([ad, s]) => ({
      ad,
      guvenilirlik: Number(guvenilirlik(ad).toFixed(3)),
      kontrol: s.kontrol,
      ok: s.ok,
      olu: s.olu,
      engelli: s.engelli,
      belirsiz: s.belirsiz,
      link: playerLinkSayaci.get(ad) || 0,
    }))
    .sort((a, b) => b.link - a.link),
  fansublar: [...fansubSayaci.entries()]
    .map(([ad, v]) => ({ ad, s: fansubSluglari.get(ad), anime: v.anime.size, bolum: v.bolum }))
    .sort((a, b) => b.bolum - a.bolum),
};

/* ================================================================ */
baslik('6/7 · Çıktılar yazılıyor');
/* ================================================================ */

const boyutlar = {};
boyutlar.katalog = yazJson(
  path.join(YOLLAR.publicData, 'katalog.json'),
  {
    uretim: URETIM_ZAMANI,
    kolonlar: [
      'slug', 'ad', 'yil', 'puan', 'format', 'poster', 'bolumSayisi',
      'turler', 'ara', 'durum', 'kaynakSayisi', 'id',
    ],
    anime: katalog,
  },
  true
);
boyutlar.anaSayfa = yazJson(path.join(YOLLAR.publicData, 'ana-sayfa.json'), anaSayfa, true);
boyutlar.taksonomi = yazJson(path.join(YOLLAR.publicData, 'taksonomi.json'), taksonomi, true);

const hamTekilUrl = new Set(linkSatirlari.map((l) => l.deger)).size;
const dagilim = { calisiyor: 0, olu: 0, engellendi: 0, belirsiz: 0 };
for (const v of saglik.values()) {
  if (v.durum === DURUM.OK) dagilim.calisiyor++;
  else if (v.durum === DURUM.OLU) dagilim.olu++;
  else if (v.durum === DURUM.ENGELLI) dagilim.engellendi++;
  else dagilim.belirsiz++;
}
const kesinKarar = dagilim.calisiyor + dagilim.olu + dagilim.engellendi;
const saglikOzet = {
  uretim: URETIM_ZAMANI,
  kaynak: 'kontrol_gecmisi.jsonl (arşiv) + tools/cache/link-durum.jsonl (kendi taramamız)',
  kontrolEdilenUrl: saglik.size,
  hamTekilUrl,
  kapsamYuzdesi: Number(((saglik.size / hamTekilUrl) * 100).toFixed(2)),
  // Kapsam "denendi" demek; aşağıdaki oran yalnızca kesin karara varılanları sayar.
  kesinKapsamYuzdesi: Number(((kesinKarar / hamTekilUrl) * 100).toFixed(2)),
  kendiTaramaUrl: kendiSaglik.size,
  kullanilan: dagilim,
  sitedeGizlenen: { olu: sayac.atilanOlu, engelli: sayac.atilanEngelli },
  not:
    'Her kaynak HTTP kanıtıyla yoklanır: 404/410 ve hosta özgü "dosya silindi" imzası ölü, ' +
    'oynatıcı işareti çalışıyor sayılır; bot duvarı, DDoS koruması veya kanıtsız yanıt ' +
    '"belirsiz" olur. Belirsiz kaynaklar gizlenmez, rozet de almaz.',
};
boyutlar.saglik = yazJson(path.join(YOLLAR.publicData, 'saglik.json'), saglikOzet, true);
boyutlar.seriler = yazJson(path.join(YOLLAR.publicData, 'seriler.json'), { uretim: URETIM_ZAMANI, seriler }, true);

// Grup bazlı fansub dizini: hangi grup hangi animelere katkı verdi
const fansubDizin = [...fansubSayaci.entries()]
  .map(([ad, v]) => ({ ad, s: fansubSluglari.get(ad), bolum: v.bolum, anime: [...v.anime].sort() }))
  .sort((a, b) => b.bolum - a.bolum);
boyutlar.fansublar = yazJson(
  path.join(YOLLAR.publicData, 'fansublar.json'),
  { uretim: URETIM_ZAMANI, gruplar: fansubDizin },
  true
);

const kunye = {
  uretim: URETIM_ZAMANI,
  anime: animeSatirlari.length,
  bolum: bolumById.size,
  kaynak: sayac.tutulanKaynak,
  banner4k: sayac.banner4k,
  tekilKaynak: sayac.tekilKaynak.size,
  dogrulanmisKaynak: sayac.dogrulanmisKaynak,
  fansubGrubu: taksonomi.fansublar.length,
  seriGrubu: seriler.length,
  player: taksonomi.playerlar.length,
  tur: taksonomi.turler.length,
  kataloğaGiren: katalog.length,
  bölümsüzAnime: sayac.bölümsüzAnime,
  kaynaksizAnime: sayac.kaynaksizAnime,
  zenginlestirilmisAnime: sayac.zenginlestirilmis,
  iliskiKaydi: sayac.iliskiToplam,
  yasalIzlemeBaglantisi: sayac.yasalToplam,
};
boyutlar.kunye = yazJson(path.join(YOLLAR.publicData, 'kunye.json'), kunye, false);

/* ================================================================ */
baslik('7/7 · Rapor');
/* ================================================================ */

const rapor = {
  uretim: URETIM_ZAMANI,
  sureSaniye: Number(((Date.now() - BASLA) / 1000).toFixed(1)),
  girdi: {
    db: YOLLAR.db,
    saglikJsonl: YOLLAR.health,
    linkDurumJsonl: YOLLAR.linkDurum,
    anilistOnbellek: anilistVar ? YOLLAR.anilistCache : null,
  },
  hamSayilar: {
    anime: animeSatirlari.length,
    bolum: bolumById.size,
    link: linkSatirlari.length,
    ekipKaydi: ekipSatirlari.length,
  },
  filtreleme: {
    atilanOlu: sayac.atilanOlu,
    atilanEngelli: sayac.atilanEngelli,
    tutulan: sayac.tutulanKaynak,
    dogrulanmisCalisiyor: sayac.dogrulanmisKaynak,
  },
  cikti: {
    kunye,
    katalogKaydi: katalog.length,
    anaSayfaSatiri: satirlar.length,
    heroKaydi: hero.length,
    hero4k: hero.filter((x) => x.ban4k).length,
    banner4kAnime: sayac.banner4k,
    dosyaBoyutlari: {
      katalog: kb(boyutlar.katalog),
      anaSayfa: kb(boyutlar.anaSayfa),
      taksonomi: kb(boyutlar.taksonomi),
      kunye: kb(boyutlar.kunye),
      saglik: kb(boyutlar.saglik),
      fansublar: kb(boyutlar.fansublar),
      seriler: kb(boyutlar.seriler),
    },
    animeDosyalari: islenen,
    boyutToplam: mb(katalog.reduce((t, k) => t, 0) + boyutlar.katalog),
  },
  playerlar: taksonomi.playerlar.slice(0, 12),
  fansublar: taksonomi.fansublar.slice(0, 12),
  turler: taksonomi.turler.slice(0, 20),
};

fs.mkdirSync(YOLLAR.rapor, { recursive: true });
yazJson(path.join(YOLLAR.rapor, 'veri-raporu.json'), rapor, false);

const mdSatirlari = [
  '# Veri hattı raporu',
  '',
  `- Üretim zamanı: \`${URETIM_ZAMANI}\``,
  `- Süre: **${rapor.sureSaniye} sn**`,
  `- Kaynak DB: \`${YOLLAR.db}\``,
  '',
  '## Ham veri',
  '',
  '| Ölçüm | Değer |',
  '|---|---:|',
  `| Anime | ${rapor.hamSayilar.anime} |`,
  `| Bölüm | ${rapor.hamSayilar.bolum} |`,
  `| Link (ham) | ${rapor.hamSayilar.link} |`,
  `| Bölüm-ekip (fansub/çevirmen) kaydı | ${rapor.hamSayilar.ekipKaydi} |`,
  '',
  '## Link filtresi',
  '',
  '| Ölçüm | Değer |',
  '|---|---:|',
  `| Ölü olduğu bilinen, **gizlenen** | ${sayac.atilanOlu} |`,
  `| Engelli olduğu bilinen, **gizlenen** | ${sayac.atilanEngelli} |`,
  `| Sitede tutulan kaynak | ${sayac.tutulanKaynak} |`,
  `| Doğrulanmış çalışıyor (rozetli) | ${sayac.dogrulanmisKaynak} |`,
  `| Tekil URL | ${sayac.tekilKaynak.size} |`,
  '',
  '## Link sağlığı kapsamı',
  '',
  '| Ölçüm | Değer |',
  '|---|---:|',
  `| Kontrol edilen URL | ${saglik.size} (%${saglikOzet.kapsamYuzdesi}) |`,
  `| → kendi taramamız | ${kendiSaglik.size} |`,
  `| Kesin karara varılan | ${kesinKarar} (%${saglikOzet.kesinKapsamYuzdesi}) |`,
  `| Belirsiz (gizlenmez, rozetsiz) | ${dagilim.belirsiz} |`,
  '',
  '## Üretilen dosyalar',
  '',
  '| Dosya | Boyut |',
  '|---|---:|',
  `| public/data/katalog.json | ${kb(boyutlar.katalog)} |`,
  `| public/data/ana-sayfa.json | ${kb(boyutlar.anaSayfa)} |`,
  `| public/data/taksonomi.json | ${kb(boyutlar.taksonomi)} |`,
  `| public/data/kunye.json | ${kb(boyutlar.kunye)} |`,
  `| public/data/fansublar.json | ${kb(boyutlar.fansublar)} |`,
  `| public/data/saglik.json | ${kb(boyutlar.saglik)} |`,
  `| public/data/anime/*.json | ${islenen} dosya |`,
  '',
  '## Player güvenilirliği (link kontrolüne dayalı)',
  '',
  '| Player | Link | Kontrol | Çalışıyor | Ölü | Güvenilirlik |',
  '|---|---:|---:|---:|---:|---:|',
  ...taksonomi.playerlar.map(
    (p) => `| ${p.ad} | ${p.link} | ${p.kontrol} | ${p.ok} | ${p.olu} | ${(p.guvenilirlik * 100).toFixed(1)}% |`
  ),
  '',
  '## En büyük 12 fansub grubu',
  '',
  '| Grup | Anime | Bölüm |',
  '|---|---:|---:|',
  ...taksonomi.fansublar.slice(0, 12).map((f) => `| ${f.ad} | ${f.anime} | ${f.bolum} |`),
  '',
  '## Katalogdaki türler (ilk 20)',
  '',
  ...taksonomi.turler.slice(0, 20).map((t) => `- ${t.ad}: ${t.sayi}`),
  '',
];
fs.writeFileSync(path.join(YOLLAR.rapor, 'veri-raporu.md'), mdSatirlari.join('\n'), 'utf8');

log(`   süre: ${rapor.sureSaniye} sn`);
log(`   katalog.json         ${kb(boyutlar.katalog)}`);
log(`   ana-sayfa.json       ${kb(boyutlar.anaSayfa)} (${satirlar.length} satır, ${hero.length} hero)`);
log(`   taksonomi.json       ${kb(boyutlar.taksonomi)}`);
log(`   kunye.json           ${kb(boyutlar.kunye)}`);
log(`   anime/*.json         ${islenen} dosya`);
log(`\n   Rapor: tools/rapor/veri-raporu.md`);
