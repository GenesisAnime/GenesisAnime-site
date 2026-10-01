'use client';
/** AltMenu.tsx — mobil alt gezinme çubuğu */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { EvIkon, KesfetIkon, ListeIkon, AraIkon } from './Ikon';

const OGEler = [
  { ad: 'Ana Sayfa', yol: '/', Ikon: EvIkon },
  { ad: 'Keşfet', yol: '/kesfet/', Ikon: KesfetIkon },
  { ad: 'Ara', yol: '/ara/', Ikon: AraIkon },
  { ad: 'Listem', yol: '/listem/', Ikon: ListeIkon },
] as const;

export default function AltMenu() {
  const yol = usePathname();
  return (
    <nav className="alt-menu" aria-label="Mobil menü">
      <div className="alt-menu-ic">
        {OGEler.map(({ ad, yol: y, Ikon }) => {
          const etkin = y === '/' ? yol === '/' : yol.startsWith(y.replace(/\/$/, ''));
          return (
            <Link key={y} className={`alt-menu-oge${etkin ? ' etkin' : ''}`} href={y}>
              <span aria-hidden="true">
                <Ikon boyut={18} />
              </span>
              <span>{ad}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
