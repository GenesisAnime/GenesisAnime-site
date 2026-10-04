'use client';
/**
 * UstBar.tsx — üst menü + anlık arama
 *
 * Arama kutusu ilk odaklandığında katalog.json'u tembel indirir (tek sefer),
 * sonrasında yazarken tamamen yerel arama yapar. "/" kısayolu kutuyu açar.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { genelYol } from '@/lib/yollar';
import { posterSrcSet } from '@/lib/gorsel';
import { ara, katalogHazir, katalogYukle } from '@/lib/istemci/katalog';
import type { KatalogSatiri } from '@/lib/tipler';
import { AraIkon, KapatIkon, MenuIkon } from './Ikon';

const MENU = [
  { ad: 'Ana Sayfa', yol: '/' },
  { ad: 'Keşfet', yol: '/kesfet/' },
  { ad: 'Fansublar', yol: '/fansublar/' },
  { ad: 'Listem', yol: '/listem/' },
  { ad: 'Hesap', yol: '/hesap/' },
  { ad: 'Künye', yol: '/kunye/' },
];

export default function UstBar() {
  const yol = usePathname();
  const router = useRouter();
  const [sorgu, setSorgu] = useState('');
  const [sonuclar, setSonuclar] = useState<KatalogSatiri[]>([]);
  const [acik, setAcik] = useState(false);
  const [secili, setSecili] = useState(-1);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [menuAcik, setMenuAcik] = useState(false);
  const girdiRef = useRef<HTMLInputElement>(null);
  const kapRef = useRef<HTMLDivElement>(null);

  const hazirla = useCallback(() => {
    if (katalogHazir()) return;
    setYukleniyor(true);
    katalogYukle()
      .catch(() => undefined)
      .finally(() => setYukleniyor(false));
  }, []);

  // "/" kısayolu arama kutusunu odaklar; Esc kapatır
  useEffect(() => {
    const tusla = (e: KeyboardEvent) => {
      const hedef = e.target as HTMLElement | null;
      const yazilanYer =
        hedef && (hedef.tagName === 'INPUT' || hedef.tagName === 'TEXTAREA' || hedef.isContentEditable);
      if (e.key === '/' && !yazilanYer) {
        e.preventDefault();
        girdiRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setAcik(false);
        girdiRef.current?.blur();
      }
    };
    window.addEventListener('keydown', tusla);
    return () => window.removeEventListener('keydown', tusla);
  }, []);

  // dış tıklamada önerileri kapat
  useEffect(() => {
    const dinle = (e: MouseEvent) => {
      if (!kapRef.current?.contains(e.target as Node)) setAcik(false);
    };
    document.addEventListener('mousedown', dinle);
    return () => document.removeEventListener('mousedown', dinle);
  }, []);

  useEffect(() => {
    setMenuAcik(false);
    setAcik(false);
  }, [yol]);

  // yazarken ara
  useEffect(() => {
    if (!sorgu.trim()) {
      setSonuclar([]);
      setSecili(-1);
      return;
    }
    const zamanlayici = setTimeout(() => {
      katalogYukle()
        .then((satirlar) => {
          setSonuclar(ara(satirlar, sorgu, 8));
          setSecili(-1);
          setAcik(true);
        })
        .catch(() => setSonuclar([]));
    }, 110);
    return () => clearTimeout(zamanlayici);
  }, [sorgu]);

  const gonder = (e: React.FormEvent) => {
    e.preventDefault();
    if (secili >= 0 && sonuclar[secili]) {
      router.push(`/anime/${sonuclar[secili][0]}/`);
      return;
    }
    if (sorgu.trim()) {
      setAcik(false);
      router.push(`/ara/?q=${encodeURIComponent(sorgu.trim())}`);
    }
  };

  const tusla = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!acik || sonuclar.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSecili((s) => (s + 1) % sonuclar.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSecili((s) => (s <= 0 ? sonuclar.length - 1 : s - 1));
    }
  };

  const etkin = (y: string) => (y === '/' ? yol === '/' : yol.startsWith(y.replace(/\/$/, '')));

  return (
    <header className="ust">
      <div className="ust-ic">
        <Link className="logo" href="/" aria-label="GenesisAnime ana sayfa">
          <span className="logo-isaret" aria-hidden="true">
            G
          </span>
          <span className="logo-metin">GenesisAnime</span>
        </Link>

        <nav className={`ust-menu${menuAcik ? ' acik' : ''}`} aria-label="Ana menü">
          {MENU.map((m) => (
            <Link key={m.yol} className={`ust-baglanti${etkin(m.yol) ? ' etkin' : ''}`} href={m.yol}>
              {m.ad}
            </Link>
          ))}
        </nav>

        <div className="ust-arama" ref={kapRef}>
          <span className="arama-ikon" aria-hidden="true">
            <AraIkon />
          </span>
          <form onSubmit={gonder} role="search">
            <input
              ref={girdiRef}
              type="search"
              value={sorgu}
              placeholder="Anime ara…"
              aria-label="Anime ara"
              autoComplete="off"
              onFocus={() => {
                hazirla();
                if (sorgu.trim()) setAcik(true);
              }}
              onChange={(e) => setSorgu(e.target.value)}
              onKeyDown={tusla}
            />
          </form>
          <span className="arama-kisayol" aria-hidden="true">
            /
          </span>

          {acik ? (
            <div className="ust-arama-sonuc">
              {yukleniyor && !katalogHazir() ? (
                <div className="arama-oge">
                  <span className="arama-oge-alt">Katalog yükleniyor…</span>
                </div>
              ) : sonuclar.length === 0 ? (
                <div className="arama-oge">
                  <span className="arama-oge-alt">Sonuç bulunamadı — Enter ile tüm aramada dene.</span>
                </div>
              ) : (
                sonuclar.map((s, i) => (
                  <Link
                    key={s[0]}
                    className={`arama-oge${i === secili ? ' secili' : ''}`}
                    href={`/anime/${s[0]}/`}
                    onClick={() => setAcik(false)}
                  >
                    {s[5] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s[5]} srcSet={posterSrcSet(s[5]) ?? undefined} sizes="38px" alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="iskelet" style={{ width: 38, height: 54, flex: 'none' }} />
                    )}
                    <span className="arama-oge-bilgi">
                      <span className="arama-oge-ad">{s[1]}</span>
                      <span className="arama-oge-alt">
                        {[s[2], s[4], `${s[6]} bölüm`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          ) : null}
        </div>

        <button
          className="ust-dugme"
          onClick={() => setMenuAcik((a) => !a)}
          aria-label={menuAcik ? 'Menüyü kapat' : 'Menüyü aç'}
          aria-expanded={menuAcik}
        >
          {menuAcik ? <KapatIkon /> : <MenuIkon />}
        </button>
      </div>
    </header>
  );
}
