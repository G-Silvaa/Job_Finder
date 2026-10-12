import { Earth, Globe } from 'lucide-react';
import { useId } from 'react';
import type { Region } from '../lib/types';

/** Bandeirinhas em SVG (emoji de bandeira não aparece no Windows). */
export function RegionIcon({ region, className = 'h-3 w-[18px]' }: { region: Region; className?: string }) {
  const clip = useId();
  if (region === 'WORLDWIDE') return <Globe className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden />;
  if (region === 'LATAM') return <Earth className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  return (
    <svg viewBox="0 0 30 20" className={`${className} shrink-0 rounded-[2px] ring-1 ring-black/10 dark:ring-white/15`} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <rect width="30" height="20" rx="2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {region === 'BR' && (
          <>
            <rect width="30" height="20" fill="#009c3b" />
            <path d="M15 2.4 27.3 10 15 17.6 2.7 10z" fill="#ffdf00" />
            <circle cx="15" cy="10" r="4.4" fill="#002776" />
            <path d="M10.8 9.1c2.9-.7 6.1-.2 8.6 1.5" stroke="#fff" strokeWidth=".9" fill="none" />
          </>
        )}
        {region === 'PT' && (
          <>
            <rect width="30" height="20" fill="#ff0000" />
            <rect width="12" height="20" fill="#006600" />
            <circle cx="12" cy="10" r="3.6" fill="#ffcc00" />
            <circle cx="12" cy="10" r="2" fill="#ff0000" />
          </>
        )}
        {region === 'US' && (
          <>
            {Array.from({ length: 7 }, (_, i) => (
              <rect key={i} y={(i * 20) / 7} width="30" height={20 / 7 + 0.05} fill={i % 2 ? '#fff' : '#b22234'} />
            ))}
            <rect width="13" height={(20 / 7) * 4} fill="#3c3b6e" />
          </>
        )}
        {region === 'EUROPE' && (
          <>
            <rect width="30" height="20" fill="#003399" />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return <circle key={i} cx={15 + Math.cos(a) * 6} cy={10 + Math.sin(a) * 6} r="0.95" fill="#ffcc00" />;
            })}
          </>
        )}
      </g>
    </svg>
  );
}
