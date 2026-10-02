/**
 * tmdb.mjs — TMDB (The Movie Database) yardımcılarının SAF kısmı
 * =============================================================
 * Neden TMDB? Ölçüm (01.10.2026): AniList banner'ları **1900 px**de tavanlanıyor
 * (21 örneğin en genişi 1900; CDN'de `large`/`original` varyantı 404, `?w=`
 * yok sayılıyor). Hero 74vh'lik bir bant olduğu için 4K ekranda ~3840 px
 * isteniyor, yani AniList görseli 2× büyütülüyor. TMDB backdrop'ları 16:9 ve
 * `original` boyutta çoğu kez 3840×2160 → gerçek 4K kaynağı.
 *
 * Eşleme anahtarsız yapılır: banner URL'i AniList kimliğini taşır, `anime-list`
 * (Fribb) veri kümesi `anilist_id → themoviedb_id` eşlemesini verir.
 * Ölçüm: banner'lı 4.075 animenin 3.726'sında (%91,4) TMDB kimliği var.
 *
 * KIRPIM UYARISI: TMDB görselleri 16:9; sitemizdeki bantlar çok daha geniş
 * (hero ~2,4:1 · anime sayfası bandı ~7,8:1). Bu yüzden görselin **dikey
 * kırpımı** değişir: `kirpimOrani` bunu ölçülebilir hâle getirir.
 */

/**
 * AniList CDN şemaları (hepsi ölçüldü):
 *   banner/177879-hash.jpg · banner/n6682-hash.jpg · banner/13859.jpg
 *   cover/large/bx1-hash.png · cover/extraLarge/bx1-hash.png
 * Önek (`n` eski şema, `bx` anime kapağı) kimliğin parçası değildir.
 */
export function anilistKimligiCikar(url) {
  const tam = String(url || '').match(/anilistcdn\/media\/anime\/(?:banner|cover)\/(?:[a-z]+\/)?(?:bx|b|n)?(\d+)/i);
  if (tam) return Number(tam[1]);
  const sade = String(url || '').match(/\/banner\/(?:n)?(\d+)/); // host değişse bile şema aynı
  return sade ? Number(sade[1]) : null;
}

/**
 * `anime-list` kaydından TMDB kimliği seçer.
 * Alan iki biçimde gelir: `{ tv: 26209 }` · `{ movie: 123 }` · bazı kayıtlarda düz sayı.
 * Dizi kaydı varsa o tercih edilir (animelerin çoğunluğu dizi).
 */
export function tmdbIdSec(kayit) {
  const t = kayit && kayit.themoviedb_id;
  if (!t) return null;
  if (typeof t === 'number') return { tip: 'tv', id: t };
  const tv = Number(t.tv);
  const film = Number(t.movie);
  if (Number.isFinite(tv) && tv > 0) return { tip: 'tv', id: tv };
  if (Number.isFinite(film) && film > 0) return { tip: 'movie', id: film };
  return null;
}

/** TMDB görsel CDN adresi. Boyutlar: w300 · w780 · w1280 · original */
export function backdropUrl(dosyaYolu, boyut = 'original') {
  if (!dosyaYolu) return null;
  return `https://image.tmdb.org/t/p/${boyut}${String(dosyaYolu).startsWith('/') ? '' : '/'}${dosyaYolu}`;
}

/**
 * `/images` yanıtından kullanılacak backdrop'u seçer.
 * Kural: en geniş görsel kazanır (4K tercihi), eşitlikte TMDB oyu yüksek olan.
 * `enAzGenislik` altındaki görseller yine de aday olur ama `yeterli:false` işaretlenir
 * — çağıran taraf (veri hattı) böylece "TMDB var ama 4K yok" diyebilir.
 */
export function enIyiBackdrop(images, { enAzGenislik = 3000 } = {}) {
  const list = (images || []).filter((g) => g && g.file_path && Number(g.width) > 0);
  if (!list.length) return null;
  const sirali = [...list].sort(
    (a, b) => Number(b.width) - Number(a.width) || Number(b.vote_average || 0) - Number(a.vote_average || 0)
  );
  const secilen = sirali[0];
  return {
    yol: secilen.file_path,
    genislik: Number(secilen.width),
    yukseklik: Number(secilen.height),
    yeterli: Number(secilen.width) >= enAzGenislik,
  };
}

/**
 * Hedef bantta kaynağın dikey olarak ne kadarının kaldığı (0–1).
 * Örn. 16:9 (1,78) kaynak, 7,8:1 bantta → 0,23: görselin yalnızca %23'ü görünür.
 * Karar verirken "kırpım ne kadar agresif?" sorusunu sayıya çevirir.
 */
export function kirpimOrani(kaynakOran, hedefOran) {
  if (!(kaynakOran > 0) || !(hedefOran > 0)) return 0;
  return Math.min(1, kaynakOran / hedefOran);
}

/**
 * TMDB anahtarının kullanım biçimi.
 *   v3 "API Key": 32 karakter hex → `?api_key=...` sorgu parametresi
 *   v4 "API Read Access Token": uzun JWT (`eyJ…`) → `Authorization: Bearer` başlığı
 * Anahtar yoksa null döner: çağıran taraf kullanıcıya ne yapacağını söyler.
 */
export function anahtarYontemi(anahtar) {
  const a = String(anahtar || '').trim();
  if (!a) return null;
  if (/^eyJ[A-Za-z0-9._-]+$/.test(a) || a.length > 64) return 'baslik';
  return 'param';
}

/**
 * Arama için başlık normalizasyonu.
 * Amaç: "Kimetsu no Yaiba: Yuukaku-hen" ile "Demon Slayer: Kimetsu no Yaiba
 * Entertainment District Arc" gibi farklı adlandırmaları karşılaştırılabilir hâle
 * getirmek. Yapılanlar: diakritik sadeleştirme (Türkçe + romaji uzun ünlüler),
 * noktalama → boşluk, küçük harf, sezon/part işaretlerinin atılması, romen rakamı
 * → sayı. **Yıl ve tip ayrıca karşılaştırılır**: normalizasyon tek başına karar
 * vermez, çünkü "Naruto" ile "Naruto: Shippuuden" normalizasyonda yakın görünür.
 */
export function baslikNormalize(ad) {
  const harita = { ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u', ä: 'a', é: 'e', è: 'e', ê: 'e', ñ: 'n', ó: 'o', ō: 'o', û: 'u', ū: 'u', â: 'a', à: 'a', ø: 'o', å: 'a' };
  const romen = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9' };
  return String(ad || '')
    .replace(/[çÇğĞıIİöÖşŞüÜäéèêñóōûūâàøå]/g, (k) => harita[k] ?? k)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(season|sezon|part|kisim|cour|arc)\s*(\d+|[ivx]+)?\b/g, ' ')
    .split(' ')
    .map((t) => romen[t] ?? t)
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * İki başlığın benzerliği (0–1): Dice katsayısı ve "biri diğerini kapsıyor"
 * oranının en iyisi. Kapsama durumu ağırlıkla %90 sayılır — "X" ile "X: Alt
 * Başlık" çoğu zaman aynı yapımdır, ama yıl kontrolü olmadan bu benzerlik
 * yanlış eşleşme üretir (bkz. `aramaEslesmesi`).
 */
export function baslikBenzerligi(a, b) {
  const na = baslikNormalize(a);
  const nb = baslikNormalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const A = new Set(na.split(' '));
  const B = new Set(nb.split(' '));
  let kesisim = 0;
  for (const t of A) if (B.has(t)) kesisim++;
  const dice = (2 * kesisim) / (A.size + B.size);
  const kapsama = kesisim / Math.min(A.size, B.size);
  return Math.max(dice, kapsama * 0.9);
}

/** Arşiv formatı → TMDB uç tipi (film dışındaki her şey dizi sayılır). */
export function formatTip(format) {
  return String(format || '').toUpperCase() === 'MOVIE' ? 'movie' : 'tv';
}

/**
 * Bir TMDB arama adayını arşiv kaydıyla karşılaştırır ve güven etiketi üretir.
 *
 * Neden bu kadar muhafazakâr? Yanlış eşleşme, bandı boş bırakmaktan kötüdür:
 * sayfada başka bir yapımın görseli görünür. Bu yüzden üç bağımsız şart aranır —
 * animasyon türü, başlık benzerliği ve yıl — ve etiket iki kademelidir:
 *   `tam`   : normalize başlık birebir + yıl birebir + tip aynı
 *   `yakin` : başlık çok benzer (≥0.85) + yıl ±1 + tip aynı — ya da birebir
 *             başlıkta yıl boş/±1 (TMDB yılı sık sık bir yıl kayar)
 *
 * @param {{ad?:string, ozgunAd?:string, yil?:number|null, tip:'tv'|'movie', animasyon?:boolean, populerlik?:number}} aday
 * @param {{adlar?:string[], yil?:number|null, tip:'tv'|'movie'}} hedef
 * @returns {{guven:'tam'|'yakin'|'yok', puan:number, neden:string, ad?:string}}
 */
export function aramaEslesmesi(aday, hedef) {
  if (!aday) return { guven: 'yok', puan: 0, neden: 'aday-yok' };
  if (!aday.animasyon) return { guven: 'yok', puan: 0, neden: 'animasyon-degil' };

  const adlar = (hedef?.adlar || []).filter(Boolean);
  let puan = 0;
  let enIyi = '';
  for (const a of adlar) {
    for (const t of [aday.ad, aday.ozgunAd].filter(Boolean)) {
      const s = baslikBenzerligi(t, a);
      if (s > puan) {
        puan = s;
        enIyi = a;
      }
    }
  }

  const yilFark = aday.yil && hedef?.yil ? Math.abs(Number(aday.yil) - Number(hedef.yil)) : null;
  const tipAyni = aday.tip === hedef?.tip;
  const sonuc = (guven, neden) => ({ guven, puan, neden, ad: aday.ad || aday.ozgunAd || '' });

  if (puan >= 0.999) {
    if (yilFark === 0 && tipAyni) return sonuc('tam', 'birebir ad + birebir yıl');
    if (yilFark === null) return sonuc('yakin', 'birebir ad, yıl bilinmiyor');
    if (yilFark <= 1) return sonuc('yakin', `birebir ad, yıl ±${yilFark}`);
    return sonuc('yok', `yıl uzak (${yilFark})`);
  }
  if (puan >= 0.85 && tipAyni && (yilFark === 0 || yilFark === 1)) return sonuc('yakin', 'benzer ad + yıl');
  if (puan >= 0.95 && tipAyni && yilFark === null) return sonuc('yakin', 'çok benzer ad, yıl bilinmiyor');
  return sonuc('yok', puan < 0.85 ? `ad benzemiyor (${puan.toFixed(2)})` : 'yıl/tip uyuşmuyor');
}

/** Bant yüksekliği verildiğinde hedef oran (ör. 1480 px genişlik / 190 px yükseklik). */
export function bantOrani(genislik, yukseklik) {
  if (!(genislik > 0) || !(yukseklik > 0)) return 0;
  return genislik / yukseklik;
}
