import type { ReactNode } from 'react';
import type { Stats } from '../lib/types';

const fmt = (n: number) => n.toLocaleString('pt-BR');

/** Faixa corrida no topo (como no Awwwards): números ao vivo + empresas que mais estão contratando. */
export function Marquee({ stats }: { stats: Stats | null }) {
  if (!stats) return <div className="h-9 bg-ink" />;
  const items: { key: string; node: ReactNode }[] = [
    {
      key: 'live',
      node: (
        <span className="inline-flex items-center gap-2 text-lime">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-lime" /> Ao vivo
        </span>
      ),
    },
    { key: 'total', node: <span>{fmt(stats.total)} vagas abertas</span> },
    { key: 'new', node: <span>+{fmt(stats.new24h)} publicadas nas últimas 24h</span> },
    { key: 'vibe', node: <span>{fmt(stats.ai.vibe)} pedem IA para programar</span> },
    { key: 'hiring', node: <span className="text-paper/45">Contratando agora →</span> },
    ...stats.topCompanies.map((c) => ({
      key: `c-${c.name}`,
      node: (
        <span>
          {c.name} <span className="text-lime/80">({c.count})</span>
        </span>
      ),
    })),
  ];
  return (
    <div className="relative h-9 overflow-hidden bg-ink font-mono text-[11px] tracking-[0.12em] text-paper/75 uppercase select-none">
      <div className="flex h-full w-max animate-marquee items-center hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1 || undefined}>
            {items.map((it) => (
              <span key={it.key} className="flex items-center gap-5 pr-5 whitespace-nowrap">
                <span className="text-paper/25">✦</span>
                {it.node}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
