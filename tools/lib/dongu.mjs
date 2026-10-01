/**
 * dongu.mjs — günlük tarama döngüsünün SAF karar mantığı
 * =======================================================
 * Ağ yok, dosya yok, saat yok: karar "şimdi" olarak verilen tarihle verilir ve
 * yalnızca panel ayarı + son koşulara bakar. Böylece node:test ile ağsız sınanır
 * (tools/testler/dongu.test.mjs). Gerçek koşuyu tools/gunluk-dongu.mjs yapar.
 *
 * Neden "günde bir" mantığı zamanlayıcının kendisine bırakılmadı? Çünkü bilgisayar
 * gece kapalıysa Windows görevi kaçırır. Görev saatte bir uyanır, karar burada
 * verilir: gün içinde saat geldiyse ve bugün koşulmadıysa koşar — yani makine
 * ne zaman açılırsa o gün mutlaka bir kez çalışır.
 */

/** Yerel saat diliminde gün anahtarı (koşu damgaları UTC, ayar saati yerel). */
export function yerelGun(tarih) {
  const d = tarih instanceof Date ? tarih : new Date(tarih);
  const iki = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
}

const HATA_SONRASI_BEKLEME_MS = 3 * 3600 * 1000;

/**
 * Koşmalı mıyız?
 * @param {{ayar?: object, kosular?: object[], simdi?: Date, zorla?: boolean}} girdi
 * @returns {{kos: boolean, neden: string}}
 */
export function donguKarari({ ayar, kosular, simdi = new Date(), zorla = false } = {}) {
  if (zorla) return { kos: true, neden: 'zorla' };
  if (!ayar) return { kos: false, neden: 'ayar-yok' };
  if (ayar.aktif !== 1) return { kos: false, neden: 'kapali' };
  if (ayar.hemen === 1) return { kos: true, neden: 'hemen' };

  const bugun = yerelGun(simdi);
  const son = (kosular || [])
    .filter((k) => k && k.zaman && yerelGun(k.zaman) === bugun)
    .sort((a, b) => String(b.zaman).localeCompare(String(a.zaman)))[0];

  if (son?.sonuc === 'ok') return { kos: false, neden: 'bugun-kostu' };
  if (son?.sonuc === 'hata') {
    const gecen = simdi.getTime() - new Date(son.zaman).getTime();
    // Başarısız koşudan hemen sonra tekrar denemek hedef siteleri boşuna yorar;
    // birkaç saat sonra (makine o saatte hâlâ açıksa) bir kez daha denenir.
    if (gecen < HATA_SONRASI_BEKLEME_MS) return { kos: false, neden: 'hata-sonrasi-bekleme' };
  }

  if (simdi.getHours() < Number(ayar.saat ?? 4)) return { kos: false, neden: 'saat-gelmedi' };
  return { kos: true, neden: 'gunluk' };
}

/** Kararı insan okunur tek satıra çevirir (log ve panel için). */
export function kararMetni(karar) {
  const sozluk = {
    zorla: 'zorla çalıştırıldı',
    kapali: 'panelden kapatılmış',
    hemen: 'panelden istenmiş (hemen çalıştır)',
    'bugun-kostu': 'bugün zaten koştu',
    'hata-sonrasi-bekleme': 'son koşu hatalı, birkaç saat sonra tekrar denenecek',
    'saat-gelmedi': 'saati gelmedi',
    gunluk: 'günlük koşu',
    'ayar-yok': 'panel ayarı okunamadı',
  };
  return sozluk[karar.neden] || karar.neden;
}
