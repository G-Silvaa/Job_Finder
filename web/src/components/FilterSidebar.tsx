import { BellRing, Check, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  PERIODS,
  PRESETS,
  REGION_FILTER_LABEL,
  REGION_HINT,
  REGION_ORDER,
  SENIORITY_LABEL,
  SENIORITY_ORDER,
  STACK_DOT,
  STACK_LABEL,
  STACK_ORDER,
  WORKMODE_LABEL,
  WORKMODE_ORDER,
} from '../lib/labels';
import type { Facets, Region } from '../lib/types';
import type { Filters } from '../lib/useFilters';
import { RegionIcon } from './RegionIcon';

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('pt-BR');

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Seção da lateral: rótulo em mono, contador do que está marcado e opção de recolher. */
function Section({ title, count = 0, defaultOpen = true, children }: { title: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-line py-4 first:border-t-0 first:pt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-1 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase transition hover:text-fg"
      >
        <span className="flex items-center gap-2">
          {title}
          {count > 0 && <span className="rounded-full bg-lime px-1.5 font-bold leading-[16px] text-ink">{count}</span>}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="mt-2.5">{children}</div>}
    </section>
  );
}

function Option({ checked, onClick, label, count, icon, title }: { checked: boolean; onClick: () => void; label: string; count?: number; icon?: ReactNode; title?: string }) {
  const empty = !checked && !count;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      title={title}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13.5px] transition hover:bg-surface-2 ${empty ? 'opacity-40' : ''}`}
    >
      <span
        className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition ${
          checked ? 'border-transparent bg-invert text-lime dark:text-ink' : 'border-line-strong'
        }`}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {icon}
      <span className={`min-w-0 flex-1 truncate ${checked ? 'font-semibold' : ''}`}>{label}</span>
      {count !== undefined && <span className="font-mono text-[11px] text-muted tabular-nums">{fmt(count)}</span>}
    </button>
  );
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? 'border-transparent bg-invert text-invert-fg' : 'border-line hover:border-line-strong'
      }`}
    >
      {children}
    </button>
  );
}

function Switch({ checked, onClick, label, icon }: { checked: boolean; onClick: () => void; label: string; icon?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onClick} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13.5px] hover:bg-surface-2">
      <span className={`relative h-[18px] w-8 shrink-0 rounded-full transition ${checked ? 'bg-lime' : 'bg-line-strong'}`}>
        <span className={`absolute top-[3px] h-3 w-3 rounded-full transition-all ${checked ? 'left-[17px] bg-ink' : 'left-[3px] bg-surface'}`} />
      </span>
      {icon}
      <span className={checked ? 'font-semibold' : ''}>{label}</span>
    </button>
  );
}

interface Props {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  facets: Facets | null;
  sourceIds: string[];
  sourceName: (id: string) => string;
  showOnlyNew: boolean;
  activeCount: number;
  onClear: () => void;
}

/** Filtros na lateral (no celular, o mesmo conteúdo abre numa gaveta). */
export function FilterSidebar({ filters, update, facets, sourceIds, sourceName, showOnlyNew, activeCount, onClear }: Props) {
  const f = facets;
  const [techQuery, setTechQuery] = useState('');
  const sameRegions = (a: Region[], b: Region[]) => a.length === b.length && a.every((r) => b.includes(r));

  const techList = useMemo(() => {
    const entries = Object.entries(f?.techs ?? {});
    const q = techQuery.trim().toLowerCase();
    return entries
      .filter(([k]) => !q || k.toLowerCase().includes(q))
      .sort((a, b) => Number(filters.techs.includes(b[0])) - Number(filters.techs.includes(a[0])) || b[1] - a[1]);
  }, [f?.techs, filters.techs, techQuery]);

  return (
    <div>
      <div className="flex items-baseline justify-between px-1 pb-3">
        <h2 className="font-display text-[22px] font-extrabold tracking-[-0.04em]">
          Filtros<span className="font-serif font-normal italic">.</span>
        </h2>
        {activeCount > 0 && (
          <button onClick={onClear} className="text-[13px] font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
            Limpar ({activeCount})
          </button>
        )}
      </div>

      <Section title="Onde" count={filters.regions.length}>
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {PRESETS.map((p) => (
            <Chip key={p.label} title={p.hint} active={sameRegions(filters.regions, p.regions)} onClick={() => update({ regions: sameRegions(filters.regions, p.regions) ? [] : p.regions })}>
              {p.label}
            </Chip>
          ))}
        </div>
        {REGION_ORDER.map((r) => (
          <Option
            key={r}
            title={REGION_HINT[r]}
            checked={filters.regions.includes(r)}
            onClick={() => update({ regions: toggle(filters.regions, r) })}
            label={REGION_FILTER_LABEL[r]}
            count={f?.regions[r]}
            icon={<RegionIcon region={r} />}
          />
        ))}
      </Section>

      <Section title="Área" count={filters.stack.length}>
        {STACK_ORDER.map((s) => (
          <Option
            key={s}
            checked={filters.stack.includes(s)}
            onClick={() => update({ stack: toggle(filters.stack, s) })}
            label={STACK_LABEL[s]}
            count={f?.stack[s]}
            icon={<span className={`h-2 w-2 shrink-0 rounded-full ${STACK_DOT[s]}`} />}
          />
        ))}
      </Section>

      <Section title="Nível" count={filters.seniority.length}>
        {SENIORITY_ORDER.map((s) => (
          <Option
            key={s}
            checked={filters.seniority.includes(s)}
            onClick={() => update({ seniority: toggle(filters.seniority, s) })}
            label={SENIORITY_LABEL[s]}
            count={f?.seniority[s]}
          />
        ))}
      </Section>

      <Section title="Modelo de trabalho" count={filters.workMode.length}>
        {WORKMODE_ORDER.map((w) => (
          <Option
            key={w}
            checked={filters.workMode.includes(w)}
            onClick={() => update({ workMode: toggle(filters.workMode, w) })}
            label={WORKMODE_LABEL[w]}
            count={f?.workMode[w]}
          />
        ))}
        <p className="px-2 pt-1.5 text-[11.5px] text-muted">Fora do Brasil todas as vagas são remotas.</p>
      </Section>

      <Section title="Publicada há" count={(filters.days ? 1 : 0) + (filters.salary ? 1 : 0) + (filters.onlyNew ? 1 : 0)}>
        <div className="flex flex-wrap gap-1.5 px-1">
          {[{ days: 0, label: 'Qualquer data' }, ...PERIODS].map((p) => (
            <Chip key={p.days} active={(filters.days ?? 0) === p.days} onClick={() => update({ days: p.days || null })}>
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="mt-3">
          <Switch checked={filters.salary} onClick={() => update({ salary: !filters.salary })} label="Só com salário informado" />
          {showOnlyNew && (
            <Switch
              checked={filters.onlyNew}
              onClick={() => update({ onlyNew: !filters.onlyNew })}
              label="Só novas desde a última visita"
              icon={<BellRing className="h-3.5 w-3.5 text-muted" />}
            />
          )}
        </div>
      </Section>

      <Section title="Tecnologias" count={filters.techs.length}>
        <div className="relative px-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={techQuery}
            onChange={(e) => setTechQuery(e.target.value)}
            placeholder="Filtrar tecnologias…"
            className="h-9 w-full rounded-full border border-line bg-surface-2 pr-3 pl-9 text-[13px] outline-none focus:border-line-strong"
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5 px-1">
          {techList.map(([t, n]) => {
            const active = filters.techs.includes(t);
            return (
              <button
                key={t}
                onClick={() => update({ techs: toggle(filters.techs, t) })}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  active ? 'border-transparent bg-invert font-semibold text-invert-fg' : 'border-line hover:border-line-strong'
                }`}
              >
                {t} <span className={`font-mono text-[10.5px] ${active ? 'opacity-60' : 'text-muted'}`}>{n}</span>
              </button>
            );
          })}
          {!techList.length && <p className="p-1 text-xs text-muted">Nenhuma tecnologia encontrada.</p>}
        </div>
        {filters.techs.length > 1 && <p className="px-2 pt-2 text-[11.5px] text-muted">Mostrando vagas com qualquer uma das selecionadas.</p>}
      </Section>

      <Section title="Fontes" count={filters.sources.length} defaultOpen={filters.sources.length > 0}>
        {sourceIds.map((s) => (
          <Option
            key={s}
            checked={filters.sources.includes(s)}
            onClick={() => update({ sources: toggle(filters.sources, s) })}
            label={sourceName(s)}
            count={f?.sources[s]}
          />
        ))}
      </Section>
    </div>
  );
}
