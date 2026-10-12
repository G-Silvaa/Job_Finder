import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { AI_TERMS } from './classify/ai.js';
import { isSourceEnabled, type Collector } from './collector.js';
import { config } from './config.js';
import { getMeta, getRaw, getRuns, saveMark, type DB } from './db.js';
import { highlightHtml } from './lib/highlight.js';
import { toSafeHtml } from './lib/text.js';
import { SOURCES } from './sources/index.js';
import type { AiFilter, JobQuery, JobStore, View } from './store.js';
import type { Region, Seniority, Stack, WorkMode } from './types.js';

const REGIONS: Region[] = ['BR', 'PT', 'US', 'LATAM', 'EUROPE', 'WORLDWIDE'];
const STACKS: Stack[] = ['fullstack', 'frontend', 'backend', 'mobile', 'devops', 'data', 'qa', 'other'];
const SENIORITIES: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'unknown'];
const WORK_MODES: WorkMode[] = ['remote', 'hybrid', 'onsite', 'unknown'];
const AI: AiFilter[] = ['any', 'vibe', 'llm'];
const VIEWS: View[] = ['all', 'favorites', 'applied', 'hidden'];

function csv(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(csv);
  if (typeof v !== 'string') return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function pick<T extends string>(v: unknown, allowed: readonly T[]): T[] {
  return csv(v).filter((x): x is T => (allowed as readonly string[]).includes(x));
}

function isoDate(v: unknown): string | undefined {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined;
}

function int(v: unknown): number | undefined {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? Math.floor(n) : undefined;
}

export function parseJobQuery(q: Record<string, unknown>): JobQuery {
  const sort = ['recent', 'ai', 'relevance'].includes(String(q.sort)) ? (q.sort as JobQuery['sort']) : undefined;
  const view = VIEWS.includes(q.view as View) ? (q.view as View) : 'all';
  return {
    q: typeof q.q === 'string' ? q.q.slice(0, 200) : undefined,
    regions: pick(q.regions, REGIONS),
    stack: pick(q.stack, STACKS),
    seniority: pick(q.seniority, SENIORITIES),
    workMode: pick(q.workMode, WORK_MODES),
    ai: pick(q.ai, AI),
    techs: csv(q.techs).slice(0, 30),
    sources: csv(q.sources).slice(0, 50),
    days: int(q.days),
    newSince: isoDate(q.newSince),
    salary: q.salary === '1' || q.salary === 'true',
    view,
    sort,
    page: int(q.page),
    offset: int(q.offset),
    pageSize: int(q.pageSize),
  };
}

export async function registerApi(app: FastifyInstance, deps: { db: DB; store: JobStore; collector: Collector }) {
  const { db, store, collector } = deps;

  const sourceMeta = () =>
    SOURCES.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind ?? 'board',
      homepage: s.homepage,
      focus: s.focus,
      description: s.description,
      enabled: isSourceEnabled(s),
      requiresEnv: s.requiresEnv ?? [],
    }));

  app.get('/api/jobs', async (req) => {
    const result = store.query(parseJobQuery(req.query as Record<string, unknown>));
    return { ...result, collecting: collector.running, lastCollectAt: getMeta(db, 'last_collect_at') ?? null };
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = store.get(req.params.id);
    const raw = getRaw(db, req.params.id);
    if (!job || !raw) return reply.code(404).send({ error: 'Vaga não encontrada' });
    const patterns = AI_TERMS.filter((t) => job.ai.matches.includes(t.label)).map((t) => t.re);
    const html = toSafeHtml(raw.description, raw.descriptionFormat ?? 'html');
    return { ...store.summary(job), descriptionHtml: highlightHtml(html, patterns) };
  });

  app.post<{ Params: { id: string }; Body: { favorite?: boolean; applied?: boolean; hidden?: boolean } }>(
    '/api/jobs/:id/mark',
    async (req, reply) => {
      const id = req.params.id;
      if (!store.get(id)) return reply.code(404).send({ error: 'Vaga não encontrada' });
      const prev = store.marks.get(id) ?? { favorite: false, applied: false, hidden: false, updatedAt: '' };
      const body = req.body ?? {};
      const mark = {
        favorite: typeof body.favorite === 'boolean' ? body.favorite : prev.favorite,
        applied: typeof body.applied === 'boolean' ? body.applied : prev.applied,
        hidden: typeof body.hidden === 'boolean' ? body.hidden : prev.hidden,
        updatedAt: new Date().toISOString(),
      };
      saveMark(db, id, mark);
      if (mark.favorite || mark.applied || mark.hidden) store.marks.set(id, mark);
      else store.marks.delete(id);
      return { mark };
    },
  );

  app.get('/api/stats', async (req) => ({
    ...store.stats(isoDate((req.query as Record<string, unknown>).since)),
    collecting: collector.running,
    lastCollectAt: getMeta(db, 'last_collect_at') ?? null,
    sourcesEnabled: SOURCES.filter(isSourceEnabled).length,
  }));

  app.get('/api/sources', async () => {
    const runs = getRuns(db);
    const counts = store.stats().sources;
    return {
      collecting: collector.running,
      progress: collector.progress,
      sources: sourceMeta().map((s) => ({ ...s, run: runs.get(s.id) ?? null, active: counts[s.id] ?? 0 })),
    };
  });

  app.post<{ Body: { sources?: string[]; force?: boolean } }>('/api/collect', async (req, reply) => {
    const body = req.body ?? {};
    const already = collector.running;
    // não espera terminar: o front acompanha por /api/sources
    collector
      // "Atualizar tudo" respeita o intervalo mínimo de cada fonte; forçar só vale para fontes escolhidas
      .run({ sources: Array.isArray(body.sources) ? body.sources : undefined, force: body.force === true && Array.isArray(body.sources) })
      .catch((e) => console.error('Falha na coleta:', e));
    return reply.code(202).send({ started: !already, running: true });
  });

  // Front-end compilado (npm run build). Em desenvolvimento quem serve é o Vite.
  if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Não encontrado' });
    });
  }
}
