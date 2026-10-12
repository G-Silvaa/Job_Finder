import { ArrowUpRight, Brain, Sparkles } from 'lucide-react';
import { AI_HINT, PRESETS } from '../lib/labels';
import type { AiFilter, Region, Stats } from '../lib/types';
import { RegionIcon } from './RegionIcon';

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('pt-BR');

interface Props {
  variant: 'all' | 'ai';
  stats: Stats | null;
  /** Contagem por região mostrada nos quadrados (na aba de IA, só das vagas de IA). */
  regionCounts?: Record<string, number>;
  regions: Region[];
  aiMode: AiFilter;
  aiCounts?: Record<string, number>;
  onRegions: (regions: Region[]) => void;
  onAiMode: (mode: AiFilter) => void;
  onOpenAi: () => void;
}

const sameRegions = (a: Region[], b: Region[]) => a.length === b.length && a.every((r) => b.includes(r));

/** Painel escuro do topo: números grandes, atalhos de região e o convite para as vagas de IA. */
export function Hero({ variant, stats, regionCounts, regions, aiMode, aiCounts, onRegions, onAiMode, onOpenAi }: Props) {
  const counts = regionCounts ?? stats?.regions;
  const tiles: { region: Region; label: string; sub: string }[] = [
    { region: 'BR', label: 'Brasil', sub: 'todas as modalidades' },
    { region: 'PT', label: 'Portugal', sub: 'só remotas' },
    { region: 'US', label: 'EUA', sub: 'só remotas' },
    { region: 'WORLDWIDE', label: 'Global', sub: 'remotas de qualquer lugar' },
  ];

  return (
    <section className="relative isolate overflow-hidden rounded-[28px] bg-ink text-paper">
      <div className="grid-lines absolute inset-0 -z-10" />
      <div className="absolute -top-48 -right-32 -z-10 h-[520px] w-[520px] rounded-full bg-lime/15 blur-[120px]" />
      <div className="absolute -bottom-56 left-1/4 -z-10 h-[460px] w-[460px] rounded-full bg-fuchsia-500/20 blur-[130px]" />

      <div className="grid gap-8 p-5 sm:gap-10 sm:p-10 lg:grid-cols-[1.25fr_1fr] lg:gap-14 lg:p-12">
        <div className="flex flex-col">
          <p className="font-mono text-[11px] tracking-[0.2em] text-paper/45 uppercase">
            {variant === 'ai' ? '( Radar / IA & vibe coding )' : '( Radar de vagas dev — BR · PT · EUA )'}
          </p>

          {variant === 'all' ? (
            <h1 className="mt-5 font-display text-[42px] leading-[0.92] font-extrabold tracking-[-0.04em] sm:text-[64px] xl:text-[86px]">
              {fmt(stats?.total)} vagas
              <br />
              de dev, <span className="font-serif font-normal tracking-[-0.02em] text-lime italic">ao vivo.</span>
            </h1>
          ) : (
            <h1 className="mt-5 font-display text-[38px] leading-[0.94] font-extrabold tracking-[-0.04em] sm:text-[58px] xl:text-[76px]">
              {fmt(stats?.ai.vibe)} vagas querem quem{' '}
              <span className="font-serif font-normal tracking-[-0.02em] italic">
                <span className="text-ai">programa com IA.</span>
              </span>
            </h1>
          )}

          <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-paper/60 sm:mt-6 sm:text-[15px]">
            {variant === 'all' ? (
              <>
                Fullstack, front-end e back-end no Brasil — e só vagas <strong className="font-semibold text-paper">remotas</strong> em
                Portugal, nos EUA e no resto do mundo. O radar confere 30 fontes e ~100 empresas de hora em hora.
              </>
            ) : (
              <>
                O radar lê cada descrição procurando Cursor, Copilot, Claude Code, Windsurf, vibe coding e agentes de código — e mais{' '}
                {fmt(stats?.ai.llm)} vagas para construir produtos com LLMs, RAG e agentes.
              </>
            )}
          </p>

          {variant === 'all' ? (
            <div className="mt-6 flex flex-wrap gap-2 sm:mt-8">
              {PRESETS.map((p) => {
                const active = sameRegions(regions, p.regions);
                return (
                  <button
                    key={p.label}
                    title={p.hint}
                    onClick={() => onRegions(active ? [] : p.regions)}
                    className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition sm:px-4 sm:py-2 sm:text-sm ${
                      active ? 'border-lime bg-lime text-ink' : 'border-paper/15 text-paper/85 hover:border-paper/40 hover:text-paper'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-8 inline-flex flex-wrap gap-1 self-start rounded-full border border-paper/10 bg-paper/5 p-1">
              {(['any', 'vibe', 'llm'] as AiFilter[]).map((m) => {
                const active = aiMode === m;
                const Icon = m === 'llm' ? Brain : Sparkles;
                return (
                  <button
                    key={m}
                    title={AI_HINT[m]}
                    onClick={() => onAiMode(m)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                      active ? 'bg-paper text-ink' : 'text-paper/70 hover:text-paper'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m === 'any' ? 'Tudo de IA' : m === 'vibe' ? 'IA para programar' : 'Engenharia de IA'}
                    {aiCounts && <span className={`font-mono text-[11px] ${active ? 'text-ink/50' : 'text-paper/40'}`}>{fmt(aiCounts[m])}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 self-end">
          {tiles.map((t) => {
            const active = regions.length === 1 && regions[0] === t.region;
            return (
              <button
                key={t.region}
                onClick={() => onRegions(active ? [] : [t.region])}
                className={`group relative flex flex-col items-start rounded-2xl border p-3.5 text-left transition sm:p-5 ${
                  active ? 'border-lime bg-lime/10' : 'border-paper/10 bg-paper/[0.04] hover:border-paper/25 hover:bg-paper/[0.07]'
                }`}
              >
                <span className="flex w-full items-center justify-between font-mono text-[10.5px] tracking-[0.14em] text-paper/50 uppercase">
                  <span className="inline-flex items-center gap-2">
                    <RegionIcon region={t.region} /> {t.label}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                </span>
                <span className="mt-2.5 font-display text-[28px] leading-none font-bold tracking-[-0.04em] sm:mt-3 sm:text-[40px]">
                  {fmt(counts?.[t.region])}
                </span>
                <span className="mt-1.5 hidden text-xs text-paper/45 sm:block">{t.sub}</span>
              </button>
            );
          })}
          {variant === 'all' && (
            <button
              onClick={onOpenAi}
              className="group relative col-span-2 overflow-hidden rounded-2xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 p-[1px] text-left"
            >
              <span className="flex items-center gap-4 rounded-[15px] bg-ink/85 px-5 py-4 transition group-hover:bg-ink/70">
                <Sparkles className="h-5 w-5 shrink-0 text-fuchsia-300" />
                <span className="flex-1">
                  <span className="block font-display text-[22px] leading-tight font-bold tracking-[-0.03em]">
                    {fmt(stats?.ai.vibe)} pedem IA para programar
                  </span>
                  <span className="text-xs text-paper/55">Cursor, Copilot, Claude Code, vibe coding…</span>
                </span>
                <ArrowUpRight className="h-5 w-5 shrink-0 transition group-hover:rotate-45" />
              </span>
            </button>
          )}
        </div>
      </div>

      <span className="pointer-events-none absolute top-6 right-6 hidden rotate-[8deg] rounded-full bg-lime px-3 py-1 font-mono text-[11px] font-bold tracking-[0.14em] text-ink uppercase shadow-lg shadow-lime/20 lg:block">
        Contratando ✦
      </span>
    </section>
  );
}
