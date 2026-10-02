/**
 * oynatici.ts — oynatıcı kullanılabilirlik durumu (elle karar, tarihli, gözden geçirilebilir)
 *
 * Neden var: bazı player'ların kaynakları **bizim taraftan** erişilemez hâle geliyor
 * (sunucu isteklerimize 403 dönüyor, oynatıcı işareti okunamıyor). Bu, "kaynak ölü"
 * işaretlemesinden (`calismayanlar`, kullanıcı bildirimi) farklı bir durumdur:
 *
 *   · **Ölü kaynak** → tek tek URL'ler bitti; kullanıcı işaretledi, tarama doğruladı.
 *   · **Kullanım dışı player** → player'ın tamamı bizim ölçümümüzden geçici olarak
 *     çıkarıldı; kaynaklar duruyor, yalnızca **önerilmiyor** ve etiketleniyor.
 *
 * Kural: kullanım dışı player'ın kaynakları **gizlenmez, silinmez**. Kaynak arşivin
 * parçasıdır; durumu değişirse (host tekrar cevap verirse) tek bir satır silinerek
 * geri açılır. Bu yüzden liste yalnızca `oynatici.ts` içinde tutulur — veri hattına
 * ya da üretilen `public/data` dosyalarına dokunmaz.
 *
 * Karar **tarihlidir ve gözden geçirme tarihi taşır**: "şu anlık erişim yok" ifadesi
 * süresiz bir yasak değildir. Etiket kullanıcıya sebebi ve ne zaman yeniden
 * bakılacağını söyler (ölçüm kanıtı: `docs/09`, `docs/olcum/akis-2026-10-02.json`).
 */

export interface OynatıcıDurum {
  /** Taksonomideki player anahtarı (`bicim.ts` · `PLAYER_ADLARI` ile aynı yazım). */
  player: string;
  /** Kullanıcıya gösterilen kısa etiket. */
  etiket: string;
  /** Neden kullanım dışı — kullanıcıya gösterilir, tahmin değil ölçüm olmalı. */
  sebep: string;
  /** Kararın verildiği gün (elle yazılır: yerel saat dilimine bağlı biçimlendirme yok). */
  karar: string;
  /** Yeniden değerlendirilecek tarih. */
  gozdenGecirme: string;
  /** Geçici mi (yeniden ölçümle açılabilir) yoksa kalıcı mı? */
  gecici: boolean;
  /** Kanıtın bulunduğu belge (depo yolu). */
  belge: string;
}

/** Etiket her yerde aynı yazılsın diye tek sabit. */
export const KULLANIM_DISI_ETIKETI = 'Kullanım dışı';

/**
 * Şu an kullanım dışı sayılan player'lar.
 *
 * `SIBNET` — kaynakların ~%42,1'i, ama 02.10 ölçümünde hem otomatik kontrolde hem
 * canlı testte akış alınamadı: `video.sibnet.ru` isteklerimize 403
 * ("administrative rules") döndürüyor ve sayfa oynatıcı işareti içermiyor.
 * Kaynaklar listede kalır; varsayılan seçimde geri plana düşer ve "Kullanım dışı"
 * etiketiyle gösterilir.
 */
const KULLANIM_DISI: OynatıcıDurum[] = [
  {
    player: 'SIBNET',
    etiket: KULLANIM_DISI_ETIKETI,
    sebep: 'Sunucu isteklerimize 403 ("administrative rules") döndürüyor; akış adresi alınamıyor.',
    karar: '3 Ekim 2026',
    gozdenGecirme: '3 Kasım 2026',
    gecici: true,
    belge: 'docs/olcum/akis-2026-10-02.json',
  },
];

/** Player kullanım dışı mı? (kaynak gizlenmez, yalnızca işaretlenir ve geri plana düşer) */
export function kullanimDisiMi(player: string): boolean {
  return KULLANIM_DISI.some((d) => d.player === player);
}

/** Player'ın durum kaydı (yoksa null). */
export function oynaticiDurumu(player: string): OynatıcıDurum | null {
  return KULLANIM_DISI.find((d) => d.player === player) ?? null;
}

/** Tüm kullanım dışı kayıtlar (künye listesi için). */
export function kullanimDisiPlayerlar(): OynatıcıDurum[] {
  return [...KULLANIM_DISI];
}

/** Tek satırlık durum açıklaması: "geçici · karar 3 Ekim 2026 · gözden geçirme 3 Kasım 2026". */
export function durumOzeti(d: OynatıcıDurum): string {
  return `${d.gecici ? 'geçici' : 'kalıcı'} · karar ${d.karar} · gözden geçirme ${d.gozdenGecirme}`;
}
