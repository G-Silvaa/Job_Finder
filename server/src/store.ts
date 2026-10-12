import type { Mark } from './db.js';
import { norm } from './lib/text.js';
import type { Job, Region, Seniority, Stack, WorkMode } from './types.js';

export type AiFilter = 'any' | 'vibe' | 'llm';
export type View = 'all' | 'favorites' | 'applied' | 'hidden';

export interface JobQuery {
  q?: string;
  regions?: Region[];
  stack?: Stack[];
  seniority?: Seniority[];
  workMode?: WorkMode[];
  ai?: AiFilter[];
  techs?: string[];
  sources?: string[];
  /** Só vagas publicadas nos últimos N dias. */
  days?: number;
  /** Paginação por posição (tem prioridade sobre `page`): quantas vagas o cliente já tem. */
  offset?: number;
  /** Só vagas que o radar viu pela primeira vez depois desta data (ISO): "novas desde a última visita". */
  newSince?: string;
  salary?: boolean;
  view?: View;
  sort?: 'recent' | 'ai' | 'relevance';
  page?: number;
  pageSize?: number;
}

export interface AlsoOn {
  source: string;
  url: string;
  location: string;
}

export type JobSummary = Omit<Job, 'searchText' | 'dedupKey'> & {
  isNew: boolean;
  alsoOn: AlsoOn[];
  mark: Mark | null;
};

type Dim = 'regions' | 'stack' | 'seniority' | 'workMode' | 'ai' | 'techs' | 'sources';
const DIMS: Dim[] = ['regions', 'stack', 'seniority', 'workMode', 'ai', 'techs', 'sources'];

export type Facets = Record<Dim, Record<string, number>>;

const DAY = 86_400_000;

export function jobDate(j: Job): number {
  return Date.parse(j.publishedAt ?? j.firstSeenAt);
}

export class JobStore {
  private jobs: Job[] = [];
  private byId = new Map<string, Job>();
  /** id da vaga principal -> cópias da mesma vaga em outras fontes */
  private dupes = new Map<string, Job[]>();
  /** ids escondidos por serem cópia de outra vaga */
  private duplicateIds = new Set<string>();
  marks = new Map<string, Mark>();

  get size() {
    return this.jobs.length - this.duplicateIds.size;
  }

  get(id: string): Job | undefined {
    return this.byId.get(id);
  }

  setJobs(jobs: Job[], marks: Map<string, Mark>) {
    this.jobs = jobs;
    this.byId = new Map(jobs.map((j) => [j.id, j]));
    this.marks = marks;
    this.computeDupes();
  }

  /**
   * Mesma empresa + mesmo cargo = um card só, mesmo vindo de várias fontes ou de várias cidades.
   * Fica a versão com a descrição mais completa; as outras aparecem em "também em".
   */
  private computeDupes() {
    const groups = new Map<string, Job[]>();
    for (const j of this.jobs) {
      if (!j.dedupKey || !j.active) continue;
      const g = groups.get(j.dedupKey);
      if (g) g.push(j);
      else groups.set(j.dedupKey, [j]);
    }
    this.dupes.clear();
    this.duplicateIds.clear();
    // a cópia que a pessoa marcou (favorita, candidatura, oculta) continua sendo a principal,
    // senão a marcação "sumiria" quando chegasse uma cópia com descrição maior
    const markWeight = (j: Job) => {
      const m = this.marks.get(j.id);
      return m ? (m.favorite || m.applied ? 2 : 1) : 0;
    };
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      g.sort((a, b) => markWeight(b) - markWeight(a) || b.searchText.length - a.searchText.length || jobDate(b) - jobDate(a));
      const [primary, ...rest] = g;
      this.dupes.set(primary.id, rest);
      for (const o of rest) this.duplicateIds.add(o.id);
      // o card principal vale para todas as regiões das cópias (ex.: mesma vaga em SP e em Lisboa)
      primary.regions = [...new Set([...primary.regions, ...rest.flatMap((r) => r.regions)])];
      if (primary.workMode !== 'remote' && rest.some((r) => r.workMode === 'remote')) primary.workMode = 'remote';
    }
  }

  alsoOn(j: Job): AlsoOn[] {
    return (this.dupes.get(j.id) ?? []).map((d) => ({ source: d.source, url: d.url, location: d.location }));
  }

  summary(j: Job, now = Date.now()): JobSummary {
    const { searchText: _s, dedupKey: _d, ...rest } = j;
    return {
      ...rest,
      // sem data de publicação não dá para afirmar que é nova (na primeira coleta tudo seria "nova")
      isNew: !!j.publishedAt && now - Date.parse(j.publishedAt) < 2 * DAY,
      alsoOn: this.alsoOn(j),
      mark: this.marks.get(j.id) ?? null,
    };
  }

  query(q: JobQuery) {
    const now = Date.now();
    const view = q.view ?? 'all';
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 30));

    // busca: termos obrigatórios, "-termo" exclui, "frase entre aspas"
    const include: string[] = [];
    const exclude: string[] = [];
    const rawQ = norm(q.q ?? '').trim();
    for (const m of rawQ.matchAll(/(-?)"([^"]+)"|(-?)(\S+)/g)) {
      const neg = (m[1] ?? m[3]) === '-';
      const term = (m[2] ?? m[4] ?? '').trim();
      if (!term || term === '-') continue;
      (neg ? exclude : include).push(term);
    }

    const minDate = q.days ? now - q.days * DAY : 0;
    const newSince = q.newSince ? Date.parse(q.newSince) : 0;
    const sets = {
      regions: q.regions?.length ? new Set<string>(q.regions) : null,
      stack: q.stack?.length ? new Set<string>(q.stack) : null,
      seniority: q.seniority?.length ? new Set<string>(q.seniority) : null,
      workMode: q.workMode?.length ? new Set<string>(q.workMode) : null,
      ai: q.ai?.length ? new Set<string>(q.ai) : null,
      techs: q.techs?.length ? new Set<string>(q.techs) : null,
      sources: q.sources?.length ? new Set<string>(q.sources) : null,
    };

    const valuesOf = (j: Job, dim: Dim): string[] => {
      switch (dim) {
        case 'regions':
          return j.regions;
        case 'stack':
          return [j.stack];
        case 'seniority':
          return [j.seniority];
        case 'workMode':
          return [j.workMode];
        case 'ai':
          return j.ai.categories.length ? ['any', ...j.ai.categories] : [];
        case 'techs':
          return j.techs;
        case 'sources':
          return [j.source, ...(this.dupes.get(j.id)?.map((d) => d.source) ?? [])];
      }
    };

    const facets = Object.fromEntries(DIMS.map((d) => [d, {} as Record<string, number>])) as Facets;
    const results: Job[] = [];

    for (const j of this.jobs) {
      if (this.duplicateIds.has(j.id)) continue;
      const mark = this.marks.get(j.id);
      if (view === 'favorites' && !mark?.favorite) continue;
      if (view === 'applied' && !mark?.applied) continue;
      if (view === 'hidden' && !mark?.hidden) continue;
      if (view === 'all' && (mark?.hidden || !j.active)) continue;
      if (minDate && jobDate(j) < minDate) continue;
      if (newSince && Date.parse(j.firstSeenAt) < newSince) continue;
      if (q.salary && !j.salary) continue;
      if (include.length && !include.every((t) => j.searchText.includes(t))) continue;
      if (exclude.length && exclude.some((t) => j.searchText.includes(t))) continue;

      let failed: Dim | null = null;
      let failCount = 0;
      for (const d of DIMS) {
        const set = sets[d];
        if (!set) continue;
        if (!valuesOf(j, d).some((v) => set.has(v))) {
          failed = d;
          if (++failCount > 1) break;
        }
      }
      if (failCount > 1) continue;
      // contagem "disjuntiva": cada filtro mostra quantas vagas teria se só ele mudasse
      for (const d of failCount === 1 ? [failed!] : DIMS) {
        for (const v of new Set(valuesOf(j, d))) facets[d][v] = (facets[d][v] ?? 0) + 1;
      }
      if (failCount === 0) results.push(j);
    }

    const sort = q.sort ?? (include.length ? 'relevance' : 'recent');
    if (sort === 'ai') {
      results.sort((a, b) => b.ai.score - a.ai.score || jobDate(b) - jobDate(a));
    } else if (sort === 'relevance' && include.length) {
      const score = (j: Job) => {
        const title = norm(j.title);
        let s = 0;
        for (const t of include) if (title.includes(t)) s += 10;
        // recência pesa um pouco: perde 1 ponto a cada 10 dias
        return s - (now - jobDate(j)) / (10 * DAY);
      };
      const cache = new Map(results.map((j) => [j.id, score(j)]));
      results.sort((a, b) => cache.get(b.id)! - cache.get(a.id)!);
    } else {
      results.sort((a, b) => jobDate(b) - jobDate(a));
    }

    // só as 40 tecnologias mais comuns no filtro (mais as que estiverem selecionadas)
    const allTechs = facets.techs;
    facets.techs = Object.fromEntries(
      Object.entries(allTechs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40),
    );
    for (const t of q.techs ?? []) facets.techs[t] = allTechs[t] ?? 0;

    const start = q.offset !== undefined ? Math.max(0, q.offset) : (page - 1) * pageSize;
    return {
      total: results.length,
      page,
      pageSize,
      items: results.slice(start, start + pageSize).map((j) => this.summary(j, now)),
      facets,
    };
  }

  /** Números gerais. `since` (ISO) conta também quantas vagas apareceram depois dessa data. */
  stats(since?: string) {
    const now = Date.now();
    const sinceMs = since ? Date.parse(since) : NaN;
    let total = 0;
    let new24h = 0;
    let newSince = 0;
    let anyAi = 0;
    let vibe = 0;
    let llm = 0;
    const regions: Record<string, number> = {};
    const sources: Record<string, number> = {};
    const companies = new Map<string, { name: string; logo?: string; count: number }>();
    for (const j of this.jobs) {
      if (!j.active || this.duplicateIds.has(j.id)) continue;
      total++;
      if (now - jobDate(j) < DAY) new24h++;
      if (Date.parse(j.firstSeenAt) >= sinceMs && !this.marks.get(j.id)?.hidden) newSince++;
      if (j.ai.categories.length) anyAi++;
      if (j.ai.categories.includes('vibe')) vibe++;
      if (j.ai.categories.includes('llm')) llm++;
      for (const r of j.regions) regions[r] = (regions[r] ?? 0) + 1;
      sources[j.source] = (sources[j.source] ?? 0) + 1;
      if (j.company && !/confidencia|confidential/i.test(j.company)) {
        const c = companies.get(j.company) ?? { name: j.company, count: 0 };
        c.count++;
        c.logo ??= j.companyLogo;
        companies.set(j.company, c);
      }
    }
    // só conta marcações de vagas que a tela consegue mostrar
    let favorites = 0;
    let applied = 0;
    let hidden = 0;
    for (const [id, m] of this.marks) {
      const j = this.byId.get(id);
      if (!j || this.duplicateIds.has(id)) continue;
      if (m.favorite) favorites++;
      if (m.applied) applied++;
      if (m.hidden && j.active) hidden++;
    }
    // empresas com mais vagas abertas (a faixa "contratando agora" do topo da tela)
    const topCompanies = [...companies.values()].sort((a, b) => b.count - a.count).slice(0, 24);
    return { total, new24h, newSince, ai: { any: anyAi, vibe, llm }, regions, sources, topCompanies, marks: { favorites, applied, hidden } };
  }
}
