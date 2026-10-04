/**
 * surum.ts — servis çalışanı sürüm çubuğunun sözleşmesi
 *
 * Neden: yeni bir servis çalışanı `skipWaiting()` ile hemen devralıyor, ama açık
 * sekmedeki **eski chunk'lar** bellekte kalmaya devam ediyor; kullanıcı elle
 * yenilemedikçe eski sürümde kalıyor (canlıda yaşandı: önbellekteki eski parça
 * yüzünden düzeltmeler görünmedi). Çubuk bunu görünür ve tek tıkla çözülebilir
 * kılar.
 *
 * Metin ve karar tek kaynakta: bileşen yazmaz, testler de bu sözleşmeyi okur.
 */

export const SURUM_CUBUGU_METNI = 'Yeni sürüm hazır — yenile';
export const SURUM_KAPAT_ETIKETI = 'Yeni sürüm çubuğunu kapat';

/**
 * Çubuk ne zaman görünür?
 *
 * İki şart birlikte: sayfa **zaten** bir servis çalışanıyla kontrol ediliyordu ve
 * yeni bir sürüm devraldı. İlk kurulumda (`kontrolcu` yokken) çubuk çıkmaz —
 * orada eski sürüm diye bir şey yok.
 */
export function cubukGerekli(kontrollu: boolean, yeniSurum: boolean): boolean {
  return Boolean(kontrollu) && Boolean(yeniSurum);
}
