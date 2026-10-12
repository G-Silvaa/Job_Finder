import { useCallback, useEffect, useState } from 'react';
import type { AiFilter, Region, Seniority, Sort, Stack, View, WorkMode } from './types';

export type Tab = 'all' | 'ai' | 'favorites' | 'applied' | 'hidden';

export interface Filters {
  tab: Tab;
  q: string;
  regions: Region[];
  stack: Stack[];
  seniority: Seniority[];
  workMode: WorkMode[];
  /** Sub-filtro da aba de IA. */
  aiMode: AiFilter;
  techs: string[];
  sources: string[];
  days: number | null;
  salary: boolean;
  /** Só as vagas que apareceram desde a última visita. */
  onlyNew: boolean;
  sort: Sort | '';
}

export const DEFAULT_FILTERS: Filters = {
  tab: 'all',
  q: '',
  regions: [],
  stack: [],
  seniority: [],
  workMode: [],
  aiMode: 'any',
  techs: [],
  sources: [],
  days: null,
  salary: false,
  onlyNew: false,
  sort: '',
};

const TABS: Tab[] = ['all', 'ai', 'favorites', 'applied', 'hidden'];
const LIST_KEYS = ['regions', 'stack', 'seniority', 'workMode', 'techs', 'sources'] as const;

function parse(search: string): Filters {
  const p = new URLSearchParams(search);
  const list = (k: string) => (p.get(k) ?? '').split(',').filter(Boolean);
  const tab = p.get('aba') as Tab;
  const ai = p.get('ia') as AiFilter;
  const days = Number(p.get('dias'));
  const sort = p.get('ordem') as Sort;
  return {
    tab: TABS.includes(tab) ? tab : 'all',
    q: p.get('q') ?? '',
    regions: list('regiao') as Region[],
    stack: list('area') as Stack[],
    seniority: list('nivel') as Seniority[],
    workMode: list('modelo') as WorkMode[],
    aiMode: ['any', 'vibe', 'llm'].includes(ai) ? ai : 'any',
    techs: list('tech'),
    sources: list('fonte'),
    days: Number.isFinite(days) && days > 0 ? days : null,
    salary: p.get('salario') === '1',
    onlyNew: p.get('novas') === '1',
    sort: ['recent', 'ai', 'relevance'].includes(sort) ? sort : '',
  };
}

const URL_KEY: Record<(typeof LIST_KEYS)[number], string> = {
  regions: 'regiao',
  stack: 'area',
  seniority: 'nivel',
  workMode: 'modelo',
  techs: 'tech',
  sources: 'fonte',
};

function toUrl(f: Filters): string {
  const p = new URLSearchParams();
  if (f.tab !== 'all') p.set('aba', f.tab);
  if (f.q) p.set('q', f.q);
  for (const k of LIST_KEYS) if (f[k].length) p.set(URL_KEY[k], f[k].join(','));
  if (f.tab === 'ai' && f.aiMode !== 'any') p.set('ia', f.aiMode);
  if (f.days) p.set('dias', String(f.days));
  if (f.salary) p.set('salario', '1');
  if (f.onlyNew) p.set('novas', '1');
  if (f.sort) p.set('ordem', f.sort);
  const s = p.toString();
  return s ? `?${s}` : location.pathname;
}

/**
 * Parâmetros da API a partir dos filtros da tela. A paginação é por posição (`offset` = quantas vagas
 * a tela já tem), o que continua certo mesmo depois de ocultar/desfavoritar vagas da lista.
 * `lastVisit` alimenta o filtro "só as novas".
 */
export function apiParams(f: Filters, offset: number, limit = 30, lastVisit?: string | null): URLSearchParams {
  const p = new URLSearchParams();
  const view: View = f.tab === 'favorites' || f.tab === 'applied' || f.tab === 'hidden' ? f.tab : 'all';
  p.set('view', view);
  if (f.q.trim()) p.set('q', f.q.trim());
  for (const k of LIST_KEYS) if (f[k].length) p.set(k, f[k].join(','));
  if (f.tab === 'ai') p.set('ai', f.aiMode);
  if (f.days) p.set('days', String(f.days));
  if (f.salary) p.set('salary', '1');
  if (f.onlyNew && lastVisit) p.set('newSince', lastVisit);
  const sort = f.sort || (f.tab === 'ai' ? 'ai' : f.q.trim() ? 'relevance' : 'recent');
  p.set('sort', sort);
  p.set('offset', String(offset));
  p.set('pageSize', String(limit));
  return p;
}

export function activeFilterCount(f: Filters): number {
  return LIST_KEYS.reduce((n, k) => n + f[k].length, 0) + (f.days ? 1 : 0) + (f.salary ? 1 : 0) + (f.onlyNew ? 1 : 0);
}

const LAST_VISIT_KEY = 'ultimaVisita';

/**
 * Quando foi a visita anterior (para mostrar "X vagas novas desde a última visita").
 * A visita atual é gravada quando a aba é escondida ou fechada.
 */
export function useLastVisit(): string | null {
  const [previous] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_VISIT_KEY);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
      } catch {
        /* navegação privada */
      }
    };
    if (!previous) save();
    const onHide = () => document.visibilityState === 'hidden' && save();
    addEventListener('visibilitychange', onHide);
    addEventListener('pagehide', save);
    return () => {
      removeEventListener('visibilitychange', onHide);
      removeEventListener('pagehide', save);
    };
  }, [previous]);
  return previous;
}

/** Filtros sincronizados com a URL (dá para salvar nos favoritos do navegador ou compartilhar). */
export function useFilters() {
  const [filters, setState] = useState<Filters>(() => parse(location.search));

  useEffect(() => {
    const onPop = () => setState(parse(location.search));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const update = useCallback((patch: Partial<Filters>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      history.replaceState(null, '', toUrl(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setState((prev) => {
      const next = { ...DEFAULT_FILTERS, tab: prev.tab, aiMode: prev.aiMode };
      history.replaceState(null, '', toUrl(next));
      return next;
    });
  }, []);

  return { filters, update, reset };
}
