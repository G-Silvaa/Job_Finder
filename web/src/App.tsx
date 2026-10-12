import { ArrowDown, BellRing, ChevronDown, LoaderCircle, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FilterSidebar } from './components/FilterSidebar';
import { Header, type Theme } from './components/Header';
import { Hero } from './components/Hero';
import { JobDrawer } from './components/JobDrawer';
import { JobRow } from './components/JobRow';
import { Marquee } from './components/Marquee';
import { RegionIcon } from './components/RegionIcon';
import { SourcesDialog } from './components/SourcesDialog';
import { api } from './lib/api';
import { plural, relativeTime } from './lib/format';
import { PERIODS, REGION_LABEL, SENIORITY_LABEL, STACK_LABEL, WORKMODE_LABEL } from './lib/labels';
import type { Facets, JobSummary, Mark, Sort, SourcesResponse, Stats } from './lib/types';
import { activeFilterCount, apiParams, useFilters, useLastVisit, type Filters, type Tab } from './lib/useFilters';

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('theme') as Theme) || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches));
    apply();
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* navegação privada */
    }
    if (theme !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  return [theme, setTheme];
}

interface Toast {
  text: string;
  action?: { label: string; run: () => void };
}

function matchesTab(tab: Tab, mark: Mark | null): boolean {
  if (tab === 'favorites') return !!mark?.favorite;
  if (tab === 'applied') return !!mark?.applied;
  if (tab === 'hidden') return !!mark?.hidden;
  return !mark?.hidden;
}

const PAGE_SIZE = 30;
const CONNECTING = '__connecting__';
const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('pt-BR');

export default function App() {
  const { filters, update, reset } = useFilters();
  const lastVisit = useLastVisit();
  const [theme, setTheme] = useTheme();
  const [items, setItems] = useState<JobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const listTop = useRef<HTMLDivElement>(null);
  /** Cada nova busca ganha um número; respostas de buscas antigas são ignoradas. */
  const generation = useRef(0);
  const retries = useRef(0);

  const filtersKey = JSON.stringify(filters);

  // estatísticas e status das fontes
  const refreshMeta = useCallback(() => {
    api.stats(lastVisit).then(setStats).catch(() => {});
    api.sources().then(setSources).catch(() => {});
  }, [lastVisit]);
  useEffect(refreshMeta, [refreshMeta]);

  // primeira página sempre que os filtros mudam
  useEffect(() => {
    const gen = ++generation.current;
    const ctrl = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError(null);
    api
      .jobs(apiParams(filters, 0, PAGE_SIZE, lastVisit), ctrl.signal)
      .then((r) => {
        if (gen !== generation.current) return;
        setItems(r.items);
        setTotal(r.total);
        setFacets(r.facets);
        setHasMore(r.items.length === PAGE_SIZE && r.items.length < r.total);
        setLoaded(true);
        if (retries.current > 0) refreshMeta();
        retries.current = 0;
      })
      .catch((e) => {
        if (ctrl.signal.aborted || gen !== generation.current) return;
        // o servidor pode estar subindo (ele reclassifica as vagas ao iniciar): tenta de novo por um tempo
        if (retries.current < 30) {
          retries.current++;
          setError(CONNECTING);
          retry = setTimeout(() => setReloadKey((k) => k + 1), 2000);
        } else setError(e.message);
      })
      .finally(() => gen === generation.current && !ctrl.signal.aborted && setLoading(false));
    return () => {
      ctrl.abort();
      clearTimeout(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, reloadKey]);

  // ao trocar filtro, volta para o topo da lista
  useEffect(() => {
    const top = listTop.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) listTop.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [filtersKey]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const gen = generation.current;
    const offset = items.length;
    setLoadingMore(true);
    api
      .jobs(apiParams(filters, offset, PAGE_SIZE, lastVisit))
      .then((r) => {
        if (gen !== generation.current) return; // os filtros mudaram enquanto esta página vinha
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...r.items.filter((i) => !seen.has(i.id))];
        });
        setTotal(r.total);
        setHasMore(r.items.length === PAGE_SIZE && offset + r.items.length < r.total);
      })
      .catch((e) => setToast({ text: `Erro ao carregar mais vagas: ${e.message}` }))
      .finally(() => setLoadingMore(false));
  }, [loading, loadingMore, hasMore, items.length, filters, lastVisit]);

  // rolagem infinita
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  // durante uma coleta acompanha de perto; fora dela confere de minuto em minuto se começou uma automática
  const collecting = !!(stats?.collecting || sources?.collecting);
  useEffect(() => {
    const t = setInterval(refreshMeta, collecting ? 3000 : 60_000);
    return () => clearInterval(t);
  }, [collecting, refreshMeta]);

  // terminou de coletar -> recarrega a lista (se a pessoa já rolou bastante, só avisa)
  const wasCollecting = useRef(false);
  useEffect(() => {
    if (wasCollecting.current && !collecting) {
      if (items.length <= PAGE_SIZE) setReloadKey((k) => k + 1);
      else setToast({ text: 'Chegaram vagas novas.', action: { label: 'Atualizar lista', run: () => setReloadKey((k) => k + 1) } });
    }
    wasCollecting.current = collecting;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collecting]);

  // primeira coleta (lista vazia): vai mostrando as vagas conforme chegam
  useEffect(() => {
    if (!collecting || items.length > 0) return;
    const t = setInterval(() => setReloadKey((k) => k + 1), 5000);
    return () => clearInterval(t);
  }, [collecting, items.length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const sourceNames = useMemo(() => new Map(sources?.sources.map((s) => [s.id, s.name]) ?? []), [sources]);
  const sourceName = useCallback((id: string) => sourceNames.get(id) ?? id, [sourceNames]);
  const companySources = useMemo(() => new Set(sources?.sources.filter((s) => s.kind === 'company').map((s) => s.id) ?? []), [sources]);
  const isCompanySite = useCallback((id: string) => companySources.has(id), [companySources]);
  const sourceIds = useMemo(() => sources?.sources.filter((s) => s.enabled).map((s) => s.id) ?? [], [sources]);

  const progress = useMemo(() => {
    const p = sources?.progress;
    if (!collecting || !p) return null;
    const all = Object.values(p.sources);
    return { done: all.filter((s) => s.status !== 'pending' && s.status !== 'running').length, total: all.length };
  }, [collecting, sources]);

  const collect = useCallback(
    (ids?: string[]) => {
      api
        .collect(ids)
        .then(() => {
          setToast({
            text: ids?.length === 1 ? `Coletando ${sourceName(ids[0])}…` : 'Buscando vagas novas nas fontes que não foram consultadas recentemente…',
          });
          refreshMeta();
        })
        .catch((e) => setToast({ text: `Erro: ${e.message}` }));
    },
    [refreshMeta, sourceName],
  );

  const applyMark = useCallback(
    async (job: JobSummary, patch: Partial<Pick<Mark, 'favorite' | 'applied' | 'hidden'>>, silent = false) => {
      const optimistic: Mark = { favorite: false, applied: false, hidden: false, updatedAt: '', ...job.mark, ...patch };
      const keep = matchesTab(filters.tab, optimistic);
      setItems((prev) => (keep ? prev.map((i) => (i.id === job.id ? { ...i, mark: optimistic } : i)) : prev.filter((i) => i.id !== job.id)));
      if (!keep) {
        setTotal((t) => Math.max(0, t - 1));
        if (selected === job.id) {
          const idx = items.findIndex((i) => i.id === job.id);
          setSelected(items[idx + 1]?.id ?? items[idx - 1]?.id ?? null);
        }
      }
      try {
        await api.mark(job.id, patch);
        api.stats(lastVisit).then(setStats).catch(() => {});
        if (!silent && patch.hidden) {
          setToast({
            text: 'Vaga ocultada.',
            action: { label: 'Desfazer', run: () => (applyMark({ ...job, mark: optimistic }, { hidden: false }, true), setReloadKey((k) => k + 1)) },
          });
        }
      } catch (e) {
        setToast({ text: `Não foi possível salvar: ${(e as Error).message}` });
        setReloadKey((k) => k + 1);
      }
    },
    [filters.tab, items, selected, lastVisit],
  );

  const toggleFavorite = useCallback((job: JobSummary) => applyMark(job, { favorite: !job.mark?.favorite }), [applyMark]);

  const selIndex = selected ? items.findIndex((i) => i.id === selected) : -1;
  const goPrev = selIndex > 0 ? () => setSelected(items[selIndex - 1].id) : undefined;
  const goNext =
    selIndex >= 0 && selIndex < items.length - 1
      ? () => {
          setSelected(items[selIndex + 1].id);
          if (selIndex + 5 >= items.length) loadMore();
        }
      : undefined;

  // mantém a vaga selecionada visível ao navegar com o teclado
  useEffect(() => {
    if (selected) document.getElementById(`job-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const nActive = activeFilterCount(filters);
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'all', label: 'Todas', count: stats?.total },
    { id: 'ai', label: 'IA & vibe coding', count: stats?.ai.any },
    { id: 'favorites', label: 'Favoritas', count: stats?.marks.favorites },
    { id: 'applied', label: 'Candidaturas', count: stats?.marks.applied },
    { id: 'hidden', label: 'Ocultas', count: stats?.marks.hidden },
  ];
  const sortValue: Sort = filters.sort || (filters.tab === 'ai' ? 'ai' : filters.q.trim() ? 'relevance' : 'recent');
  const showHero = filters.tab === 'all' || filters.tab === 'ai';

  return (
    <div className="min-h-screen">
      <Marquee stats={stats} />
      <Header
        q={filters.q}
        onSearch={(q) => update({ q })}
        stats={stats}
        collecting={collecting}
        progress={progress}
        onCollect={() => collect()}
        onOpenSources={() => setShowSources(true)}
        theme={theme}
        onTheme={setTheme}
      />

      <div className="mx-auto max-w-[1680px] px-4 sm:px-6">
        {showHero && (
          <div className="pt-5">
            <Hero
              variant={filters.tab === 'ai' ? 'ai' : 'all'}
              stats={stats}
              regionCounts={filters.tab === 'ai' ? facets?.regions : undefined}
              regions={filters.regions}
              aiMode={filters.aiMode}
              aiCounts={facets?.ai}
              onRegions={(regions) => update({ regions })}
              onAiMode={(aiMode) => update({ aiMode })}
              onOpenAi={() => update({ tab: 'ai', sort: '' })}
            />
          </div>
        )}

        {lastVisit && (filters.onlyNew || (stats?.newSince ?? 0) > 0) && (
          <NewSinceBar count={stats?.newSince ?? 0} since={lastVisit} active={filters.onlyNew} onToggle={() => update({ onlyNew: !filters.onlyNew, sort: '' })} />
        )}

        <div ref={listTop} className="scroll-mt-20 pt-9">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <nav className="no-scrollbar -mx-1 flex max-w-full items-end gap-6 overflow-x-auto px-1 sm:gap-8" aria-label="Seções">
              {tabs.map((t) => {
                const active = filters.tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => update({ tab: t.id, sort: '' })}
                    className={`relative shrink-0 pb-2.5 font-display text-[20px] font-bold tracking-[-0.03em] transition sm:text-[24px] ${
                      active ? 'text-fg' : 'text-faint hover:text-muted'
                    }`}
                  >
                    {t.label}
                    {t.count !== undefined && <sup className="ml-1 font-mono text-[11px] font-medium tracking-normal">({fmt(t.count)})</sup>}
                    {active && (
                      <span
                        className={`absolute inset-x-0 bottom-0 h-[3px] rounded-full ${
                          t.id === 'ai' ? 'bg-gradient-to-r from-fuchsia-500 to-violet-500' : 'bg-lime'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="flex items-center gap-3 pb-2.5">
              <button
                onClick={() => setShowFilters(true)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[13px] font-medium lg:hidden"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
                {nActive > 0 && <span className="rounded-full bg-lime px-1.5 font-mono text-[10.5px] leading-[18px] font-bold text-ink">{nActive}</span>}
              </button>
              <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
                {loaded ? plural(total, 'vaga', 'vagas') : '—'}
                {filters.q.trim() ? ` · “${filters.q.trim()}”` : ''}
              </span>
              <label className="relative">
                <span className="sr-only">Ordenar</span>
                <select
                  value={sortValue}
                  onChange={(e) => update({ sort: e.target.value as Sort })}
                  className="h-9 appearance-none rounded-full border border-line bg-surface pr-9 pl-4 text-[13px] font-medium outline-none transition hover:border-line-strong focus:border-line-strong"
                >
                  <option value="recent">Mais recentes</option>
                  {filters.q.trim() && <option value="relevance">Mais relevantes</option>}
                  <option value="ai">Mais pedem IA</option>
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1680px] px-4 pb-24 sm:px-6">
        <div className="mt-4 flex items-start gap-6">
          <aside
            aria-label="Filtros"
            className="thin-scroll sticky top-[5.5rem] hidden max-h-[calc(100vh-6.5rem)] w-[288px] shrink-0 overflow-y-auto rounded-[24px] border border-line bg-surface p-4 shadow-soft lg:block"
          >
            <FilterSidebar
              filters={filters}
              update={update}
              facets={facets}
              sourceIds={sourceIds}
              sourceName={sourceName}
              showOnlyNew={!!lastVisit}
              activeCount={nActive}
              onClear={reset}
            />
          </aside>

          <main className="min-w-0 flex-1">
            <ActiveChips filters={filters} update={update} sourceName={sourceName} />
            {error === CONNECTING && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
                <LoaderCircle className="h-4 w-4 animate-spin text-fg" />
                Conectando ao servidor… (na primeira vez ele pode levar alguns segundos para subir)
              </div>
            )}
            {error && error !== CONNECTING && (
              <div className="mb-4 rounded-2xl border border-rose-300/60 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
                Não foi possível falar com o servidor ({error}). Ele está rodando? Use <code>npm run dev</code> na pasta do projeto.
              </div>
            )}

            {(items.length > 0 || (loading && !error)) && (
              <div
                className={`overflow-hidden rounded-[24px] border border-line bg-surface shadow-soft transition-opacity ${
                  loading && items.length ? 'opacity-60' : ''
                }`}
              >
                {loading && !items.length ? (
                  <Skeletons />
                ) : (
                  <div className="divide-y divide-line">
                    {items.map((job, i) => (
                      <div key={job.id} id={`job-${job.id}`} className="scroll-mt-40">
                        <JobRow
                          job={job}
                          index={i}
                          selected={job.id === selected}
                          sourceName={sourceName}
                          onOpen={setSelected}
                          onToggleFavorite={toggleFavorite}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <EmptyState
                tab={filters.tab}
                collecting={collecting}
                hasJobs={(stats?.total ?? 0) > 0}
                hasFilters={nActive > 0 || !!filters.q}
                onClear={() => {
                  reset();
                  update({ q: '' });
                }}
                onCollect={() => collect()}
              />
            )}

            <div ref={sentinel} className="h-10" />
            {loadingMore && (
              <div className="flex justify-center py-4 text-muted">
                <LoaderCircle className="h-5 w-5 animate-spin" />
              </div>
            )}
            {hasMore && !loadingMore && items.length > 0 && (
              <div className="flex justify-center">
                <button
                  onClick={loadMore}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium hover:border-line-strong"
                >
                  Carregar mais <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            )}
            {!hasMore && items.length > 0 && (
              <p className="py-8 text-center font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
                ( fim da lista · {plural(total, 'vaga', 'vagas')} )
              </p>
            )}
          </main>

          {selected && (
            <>
              <div className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] 2xl:hidden" onClick={() => setSelected(null)} />
              <div className="fixed inset-y-0 right-0 z-50 w-full shadow-soft sm:w-[580px] 2xl:sticky 2xl:top-[5.5rem] 2xl:z-0 2xl:h-[calc(100vh-6.5rem)] 2xl:w-[560px] 2xl:shrink-0 2xl:overflow-hidden 2xl:rounded-[24px] 2xl:border 2xl:border-line">
                <JobDrawer
                  id={selected}
                  preview={items.find((i) => i.id === selected)}
                  sourceName={sourceName}
                  isCompanySite={isCompanySite}
                  onClose={() => setSelected(null)}
                  onMark={applyMark}
                  onPrev={goPrev}
                  onNext={goNext}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={() => setShowFilters(false)} />
          <div className="thin-scroll absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-surface shadow-soft" style={{ animation: 'slide-in .3s cubic-bezier(.2,.7,.2,1)' }}>
            <div className="flex justify-end px-3 pt-3">
              <button onClick={() => setShowFilters(false)} className="rounded-full p-2 hover:bg-surface-2" aria-label="Fechar filtros">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="thin-scroll flex-1 overflow-y-auto px-4 pb-4">
              <FilterSidebar
                filters={filters}
                update={update}
                facets={facets}
                sourceIds={sourceIds}
                sourceName={sourceName}
                showOnlyNew={!!lastVisit}
                activeCount={nActive}
                onClear={reset}
              />
            </div>
            <div className="border-t border-line p-3">
              <button onClick={() => setShowFilters(false)} className="h-12 w-full rounded-full bg-invert font-semibold text-invert-fg">
                Ver {loaded ? plural(total, 'vaga', 'vagas') : 'vagas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSources && <SourcesDialog data={sources} onClose={() => setShowSources(false)} onCollect={collect} />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-4 rounded-full bg-ink py-2.5 pr-2.5 pl-5 text-sm text-paper shadow-soft">
          {toast.text}
          {toast.action ? (
            <button
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
              className="rounded-full bg-lime px-3.5 py-1.5 text-[13px] font-semibold text-ink"
            >
              {toast.action.label}
            </button>
          ) : (
            <button onClick={() => setToast(null)} className="rounded-full p-1.5 text-paper/60 hover:text-paper" aria-label="Fechar aviso">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NewSinceBar({ count, since, active, onToggle }: { count: number; since: string; active: boolean; onToggle: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-soft sm:px-5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime text-ink">
        <BellRing className="h-4 w-4" />
      </span>
      <span className="flex-1">
        {active ? (
          <>Mostrando só as vagas que chegaram desde sua última visita ({relativeTime(since)}).</>
        ) : (
          <>
            <strong className="font-display text-[16px] font-bold tracking-tight">{plural(count, 'vaga nova', 'vagas novas')}</strong> desde sua
            última visita ({relativeTime(since)}).
          </>
        )}
      </span>
      <button onClick={onToggle} className="rounded-full bg-invert px-4 py-1.5 text-[13px] font-semibold text-invert-fg transition hover:bg-lime hover:text-ink">
        {active ? 'Ver todas' : 'Ver só as novas'}
      </button>
    </div>
  );
}

function ActiveChips({ filters, update, sourceName }: { filters: Filters; update: (p: Partial<Filters>) => void; sourceName: (id: string) => string }) {
  const chips: { key: string; label: ReactNode; remove: () => void }[] = [];
  for (const r of filters.regions)
    chips.push({
      key: `r${r}`,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <RegionIcon region={r} /> {r === 'WORLDWIDE' ? 'Remoto global' : REGION_LABEL[r]}
        </span>
      ),
      remove: () => update({ regions: filters.regions.filter((x) => x !== r) }),
    });
  for (const s of filters.stack) chips.push({ key: `s${s}`, label: STACK_LABEL[s], remove: () => update({ stack: filters.stack.filter((x) => x !== s) }) });
  for (const s of filters.seniority)
    chips.push({ key: `n${s}`, label: SENIORITY_LABEL[s], remove: () => update({ seniority: filters.seniority.filter((x) => x !== s) }) });
  for (const w of filters.workMode)
    chips.push({ key: `w${w}`, label: WORKMODE_LABEL[w], remove: () => update({ workMode: filters.workMode.filter((x) => x !== w) }) });
  for (const t of filters.techs) chips.push({ key: `t${t}`, label: t, remove: () => update({ techs: filters.techs.filter((x) => x !== t) }) });
  for (const s of filters.sources)
    chips.push({ key: `f${s}`, label: sourceName(s), remove: () => update({ sources: filters.sources.filter((x) => x !== s) }) });
  if (filters.days)
    chips.push({
      key: 'days',
      label: `Últimos ${PERIODS.find((p) => p.days === filters.days)?.label ?? `${filters.days} dias`}`,
      remove: () => update({ days: null }),
    });
  if (filters.salary) chips.push({ key: 'sal', label: 'Com salário', remove: () => update({ salary: false }) });
  if (filters.onlyNew) chips.push({ key: 'new', label: 'Só as novas', remove: () => update({ onlyNew: false }) });
  if (!chips.length) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.remove}
          className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-2 pl-3 text-xs font-medium transition hover:border-line-strong"
        >
          {c.label} <X className="h-3 w-3 text-muted group-hover:text-fg" />
        </button>
      ))}
    </div>
  );
}

function Skeletons() {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-4 px-6 py-6">
          <div className="skeleton h-11 w-11 rounded-[12px]" />
          <div className="flex-1 space-y-3">
            <div className="skeleton h-3 w-40 rounded-full" />
            <div className="skeleton h-5 w-2/3 rounded-full" />
            <div className="skeleton h-3 w-1/2 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  tab,
  collecting,
  hasJobs,
  hasFilters,
  onClear,
  onCollect,
}: {
  tab: Tab;
  collecting: boolean;
  hasJobs: boolean;
  hasFilters: boolean;
  onClear: () => void;
  onCollect: () => void;
}) {
  let title: ReactNode = (
    <>
      Nada por <span className="font-serif font-normal italic">aqui.</span>
    </>
  );
  let text = 'Nenhuma vaga com esses filtros. Tente tirar alguns ou mudar a busca.';
  let action: ReactNode = hasFilters ? (
    <button onClick={onClear} className="rounded-full bg-invert px-5 py-2.5 text-sm font-semibold text-invert-fg hover:bg-lime hover:text-ink">
      Limpar filtros
    </button>
  ) : null;
  if (!hasJobs && collecting) {
    title = (
      <>
        Buscando vagas <span className="font-serif font-normal italic">pela primeira vez…</span>
      </>
    );
    text = 'O radar está consultando todas as fontes. Leva de 2 a 5 minutos; as vagas aparecem aqui assim que chegam.';
    action = <LoaderCircle className="h-6 w-6 animate-spin" />;
  } else if (!hasJobs) {
    title = 'Nenhuma vaga no banco ainda';
    text = 'Clique para buscar as vagas agora.';
    action = (
      <button onClick={onCollect} className="rounded-full bg-invert px-5 py-2.5 text-sm font-semibold text-invert-fg hover:bg-lime hover:text-ink">
        Buscar vagas
      </button>
    );
  } else if (tab === 'favorites' && !hasFilters) {
    title = 'Nenhuma favorita ainda';
    text = 'Clique na estrela de uma vaga para guardá-la aqui.';
  } else if (tab === 'applied' && !hasFilters) {
    title = 'Nenhuma candidatura marcada';
    text = 'Abra uma vaga e use “Me candidatei” para acompanhar onde você já se candidatou.';
  } else if (tab === 'hidden' && !hasFilters) {
    title = 'Nenhuma vaga oculta';
    text = 'Vagas que você ocultar somem da lista principal e ficam aqui.';
  }
  return (
    <div className="flex flex-col items-center rounded-[24px] border border-dashed border-line-strong px-6 py-20 text-center">
      <h3 className="font-display text-[34px] leading-tight font-extrabold tracking-[-0.04em]">{title}</h3>
      <p className="mt-3 max-w-md text-sm text-muted">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
