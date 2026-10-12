import { setMaxListeners } from 'node:events';
import { classify, CLASSIFIER_VERSION, type ClassifiedJob } from './classify/index.js';
import { config } from './config.js';
import {
  cleanup,
  deactivateMissing,
  getMarks,
  getMeta,
  getRuns,
  iterateRaw,
  loadJobRows,
  loadSourceRaws,
  saveRun,
  setMeta,
  upsertJobs,
  type DB,
  type UpsertItem,
} from './db.js';
import { SOURCES } from './sources/index.js';
import type { JobStore } from './store.js';
import type { Job, RawJob, SourceDef } from './types.js';

const DAY = 86_400_000;
const SOURCE_TIMEOUT_MS = 8 * 60_000;

export type SourceStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface SourceProgress {
  status: SourceStatus;
  fetched?: number;
  kept?: number;
  created?: number;
  error?: string;
  note?: string;
}

export interface CollectProgress {
  startedAt: string;
  finishedAt?: string;
  sources: Record<string, SourceProgress>;
}

export function isSourceEnabled(s: SourceDef): boolean {
  if (config.enabledSources.size && !config.enabledSources.has(s.id)) return false;
  if (config.disabledSources.has(s.id)) return false;
  return (s.requiresEnv ?? []).every((k) => !!process.env[k]);
}

/** Lê o banco para a memória (o que a API consulta). */
export function reloadStore(db: DB, store: JobStore): void {
  const jobs: Job[] = [];
  for (const row of loadJobRows(db)) {
    const j = JSON.parse(row.job) as ClassifiedJob;
    jobs.push({ ...j, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, active: !!row.active });
  }
  store.setJobs(jobs, getMarks(db));
}

/** Reaplica a classificação em tudo que está salvo quando as regras mudam (sem buscar de novo nas fontes). */
export function reclassifyIfNeeded(db: DB, log: (m: string) => void): void {
  if (getMeta(db, 'classifier_version') === String(CLASSIFIER_VERSION)) return;
  const t0 = Date.now();
  const update = db.prepare('UPDATE jobs SET job = ?, classifier_version = ? WHERE id = ?');
  const deactivate = db.prepare('UPDATE jobs SET active = 0, classifier_version = ? WHERE id = ?');
  const rows = [...iterateRaw(db)];
  if (rows.length) log(`Regras de classificação mudaram: reclassificando ${rows.length} vagas salvas (leva alguns segundos)…`);
  db.transaction(() => {
    for (const { id, raw } of rows) {
      const r = classify(JSON.parse(raw) as RawJob);
      if (r.ok) update.run(JSON.stringify(r.job), CLASSIFIER_VERSION, id);
      else deactivate.run(CLASSIFIER_VERSION, id);
    }
  })();
  setMeta(db, 'classifier_version', String(CLASSIFIER_VERSION));
  if (rows.length) log(`Reclassificadas ${rows.length} vagas em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

export class Collector {
  private current: Promise<void> | null = null;
  progress: CollectProgress | null = null;

  constructor(
    private db: DB,
    private store: JobStore,
    private log: (msg: string) => void = console.log,
  ) {}

  get running(): boolean {
    return this.current !== null;
  }

  enabledSources(): SourceDef[] {
    return SOURCES.filter(isSourceEnabled);
  }

  /** Inicia uma coleta (ou devolve a que já está rodando). */
  run(opts: { sources?: string[]; force?: boolean } = {}): Promise<void> {
    if (this.current) return this.current;
    this.current = this.doRun(opts).finally(() => {
      this.current = null;
    });
    return this.current;
  }

  private async doRun({ sources, force }: { sources?: string[]; force?: boolean }) {
    const list = this.enabledSources().filter((s) => !sources?.length || sources.includes(s.id));
    const runs = getRuns(this.db);
    this.progress = {
      startedAt: new Date().toISOString(),
      sources: Object.fromEntries(list.map((s) => [s.id, { status: 'pending' as SourceStatus }])),
    };
    const t0 = Date.now();
    this.log(`Coleta iniciada: ${list.map((s) => s.id).join(', ')}`);

    let lastReload = 0;
    const reload = (forceReload = false) => {
      if (!forceReload && Date.now() - lastReload < 3000) return;
      lastReload = Date.now();
      reloadStore(this.db, this.store);
    };

    const queue = [...list];
    const worker = async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const prog = this.progress!.sources[s.id];
        const last = runs.get(s.id);
        const lastSuccess = last?.lastSuccessAt ? Date.parse(last.lastSuccessAt) : 0;
        if (!force && Date.now() - lastSuccess < s.minIntervalMinutes * 60_000) {
          prog.status = 'skipped';
          prog.note = `coletada há menos de ${s.minIntervalMinutes} min`;
          continue;
        }
        prog.status = 'running';
        await this.collectSource(s, prog);
        reload();
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, config.sourceConcurrency) }, worker));

    const now = Date.now();
    const { expired, purged } = cleanup(this.db, new Date(now - 7 * DAY).toISOString(), new Date(now - 30 * DAY).toISOString());
    setMeta(this.db, 'last_collect_at', new Date().toISOString());
    reload(true);
    this.progress.finishedAt = new Date().toISOString();
    this.log(
      `Coleta concluída em ${((Date.now() - t0) / 1000).toFixed(1)}s — ${this.store.size} vagas ativas` +
        (expired || purged ? ` (${expired} expiradas, ${purged} removidas)` : ''),
    );
  }

  private async collectSource(s: SourceDef, prog: SourceProgress) {
    const started = Date.now();
    const startedIso = new Date(started).toISOString();
    const maxAge = config.maxJobAgeFromEnv ? config.maxJobAgeDays : (s.maxAgeDays ?? config.maxJobAgeDays);
    const since = new Date(started - maxAge * DAY);
    const ctrl = new AbortController();
    // cada requisição em paralelo escuta o mesmo sinal de cancelamento
    setMaxListeners(200, ctrl.signal);
    const timer = setTimeout(() => ctrl.abort(new Error('tempo limite da fonte excedido')), SOURCE_TIMEOUT_MS);
    try {
      const result = await s.collect({
        since,
        previous: loadSourceRaws(this.db, s.id),
        cache: {
          get: (k) => getMeta(this.db, `cache:${s.id}:${k}`),
          set: (k, v) => setMeta(this.db, `cache:${s.id}:${k}`, v),
        },
        signal: ctrl.signal,
        log: (m) => this.log(`[${s.id}] ${m}`),
      });
      const warnings = [...(result.warnings ?? [])];
      const items = new Map<string, UpsertItem>();
      const reasons: Record<string, number> = {};
      for (const raw of result.jobs) {
        raw.source = s.id;
        if (raw.publishedAt && Date.parse(raw.publishedAt) < since.getTime()) {
          reasons.old = (reasons.old ?? 0) + 1;
          continue;
        }
        let r: ReturnType<typeof classify>;
        try {
          r = classify(raw);
        } catch {
          r = { ok: false, reason: 'invalid' }; // um anúncio malformado não derruba a fonte inteira
        }
        if (r.ok) items.set(r.job.id, { raw, job: r.job });
        else reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      }
      // vagas ativas antes desta coleta: base para perceber uma fonte que "quebrou" e veio quase vazia
      const activeBefore = (this.db.prepare('SELECT count(*) AS n FROM jobs WHERE source = ? AND active = 1').get(s.id) as { n: number }).n;
      // first_seen com a hora real da gravação (e não a do início da coleta), para o "novas desde a última visita"
      const created = upsertJobs(this.db, [...items.values()], CLASSIFIER_VERSION, new Date().toISOString());

      // Só encerra vagas sumidas se a fonte trouxe a lista completa e nada parece quebrado
      let closed = 0;
      if (result.complete) {
        if (items.size === 0 && activeBefore > 0) warnings.push('Nenhuma vaga retornada; vagas anteriores mantidas.');
        else if (activeBefore > 20 && items.size < activeBefore * 0.3)
          warnings.push(`Retornou bem menos vagas que antes (${items.size} vs ${activeBefore}); vagas anteriores mantidas.`);
        else closed = deactivateMissing(this.db, s.id, new Set(items.keys()));
      }

      Object.assign(prog, { status: 'done', fetched: result.jobs.length, kept: items.size, created });
      const skipped = Object.entries(reasons)
        .map(
          ([k, v]) =>
            `${v} ${{ old: 'antigas', 'not-dev': 'fora de dev', region: 'fora de BR/PT/EUA', 'not-remote': 'não remotas fora do Brasil', invalid: 'inválidas' }[k] ?? k}`,
        )
        .join(', ');
      this.log(
        `[${s.id}] ${result.jobs.length} recebidas, ${items.size} mantidas (${created} novas${closed ? `, ${closed} encerradas` : ''})` +
          (skipped ? ` — ignoradas: ${skipped}` : '') +
          ` em ${((Date.now() - started) / 1000).toFixed(1)}s`,
      );
      for (const w of warnings) this.log(`[${s.id}] aviso: ${w}`);
      saveRun(this.db, {
        source: s.id,
        lastRunAt: startedIso,
        lastSuccessAt: startedIso,
        lastCount: items.size,
        lastFetched: result.jobs.length,
        lastError: null,
        lastWarnings: warnings.slice(0, 10),
        durationMs: Date.now() - started,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Object.assign(prog, { status: 'error', error: msg });
      this.log(`[${s.id}] ERRO: ${msg}`);
      const prev = getRuns(this.db).get(s.id);
      saveRun(this.db, {
        source: s.id,
        lastRunAt: startedIso,
        lastSuccessAt: prev?.lastSuccessAt ?? null,
        lastCount: prev?.lastCount ?? null,
        lastFetched: prev?.lastFetched ?? null,
        lastError: msg.slice(0, 500),
        lastWarnings: [],
        durationMs: Date.now() - started,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
