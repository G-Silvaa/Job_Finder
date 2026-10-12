import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { ClassifiedJob } from './classify/index.js';
import type { RawJob } from './types.js';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  raw TEXT NOT NULL,
  job TEXT NOT NULL,
  classifier_version INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS jobs_source_active ON jobs(source, active);
CREATE INDEX IF NOT EXISTS jobs_last_seen ON jobs(last_seen_at);

CREATE TABLE IF NOT EXISTS marks (
  job_id TEXT PRIMARY KEY,
  favorite INTEGER NOT NULL DEFAULT 0,
  applied INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_runs (
  source TEXT PRIMARY KEY,
  last_run_at TEXT,
  last_success_at TEXT,
  last_count INTEGER,
  last_fetched INTEGER,
  last_error TEXT,
  last_warnings TEXT,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

export interface JobRow {
  id: string;
  source: string;
  raw: string;
  job: string;
  classifier_version: number;
  first_seen_at: string;
  last_seen_at: string;
  active: number;
}

export interface Mark {
  favorite: boolean;
  applied: boolean;
  hidden: boolean;
  updatedAt: string;
}

export interface SourceRun {
  source: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastCount: number | null;
  lastFetched: number | null;
  lastError: string | null;
  lastWarnings: string[];
  durationMs: number | null;
}

export function openDb(file: string): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);
  return db;
}

/** Vagas ativas + vagas encerradas que o usuário favoritou ou marcou como candidatura. */
export function loadJobRows(db: DB): Pick<JobRow, 'id' | 'job' | 'first_seen_at' | 'last_seen_at' | 'active'>[] {
  return db
    .prepare(
      `SELECT id, job, first_seen_at, last_seen_at, active FROM jobs
       WHERE active = 1 OR id IN (SELECT job_id FROM marks WHERE favorite = 1 OR applied = 1)`,
    )
    .all() as any[];
}

export function getRaw(db: DB, id: string): RawJob | undefined {
  const row = db.prepare('SELECT raw FROM jobs WHERE id = ?').get(id) as { raw: string } | undefined;
  return row ? (JSON.parse(row.raw) as RawJob) : undefined;
}

/** Vagas ativas da fonte (as encerradas não podem voltar por engano, ex.: no atalho do ETag do Ashby). */
export function loadSourceRaws(db: DB, source: string): Map<string, RawJob> {
  const rows = db.prepare('SELECT raw FROM jobs WHERE source = ? AND active = 1').all(source) as { raw: string }[];
  const map = new Map<string, RawJob>();
  for (const r of rows) {
    const raw = JSON.parse(r.raw) as RawJob;
    map.set(raw.sourceId, raw);
  }
  return map;
}

export interface UpsertItem {
  raw: RawJob;
  job: ClassifiedJob;
}

/** Grava as vagas de uma coleta. Retorna quantas eram novas. */
export function upsertJobs(db: DB, items: UpsertItem[], classifierVersion: number, now: string): number {
  const exists = db.prepare('SELECT 1 FROM jobs WHERE id = ?');
  const insert = db.prepare(
    `INSERT INTO jobs (id, source, raw, job, classifier_version, first_seen_at, last_seen_at, active)
     VALUES (@id, @source, @raw, @job, @v, @now, @now, 1)`,
  );
  const update = db.prepare(
    `UPDATE jobs SET raw = @raw, job = @job, classifier_version = @v, last_seen_at = @now, active = 1 WHERE id = @id`,
  );
  let created = 0;
  db.transaction(() => {
    for (const { raw, job } of items) {
      const params = { id: job.id, source: job.source, raw: JSON.stringify(raw), job: JSON.stringify(job), v: classifierVersion, now };
      if (exists.get(job.id)) update.run(params);
      else {
        insert.run(params);
        created++;
      }
    }
  })();
  return created;
}

/** Marca como encerradas as vagas da fonte que não vieram na última coleta completa. */
export function deactivateMissing(db: DB, source: string, seenIds: Set<string>): number {
  const active = db.prepare('SELECT id FROM jobs WHERE source = ? AND active = 1').all(source) as { id: string }[];
  const gone = active.filter((r) => !seenIds.has(r.id));
  const stmt = db.prepare('UPDATE jobs SET active = 0 WHERE id = ?');
  db.transaction(() => gone.forEach((r) => stmt.run(r.id)))();
  return gone.length;
}

/** Encerra vagas não vistas há muito tempo e apaga as antigas (exceto favoritas/candidaturas). */
export function cleanup(db: DB, staleBefore: string, purgeBefore: string): { expired: number; purged: number } {
  const expired = db.prepare('UPDATE jobs SET active = 0 WHERE active = 1 AND last_seen_at < ?').run(staleBefore).changes;
  const purged = db
    .prepare(
      `DELETE FROM jobs WHERE active = 0 AND last_seen_at < ?
       AND id NOT IN (SELECT job_id FROM marks WHERE favorite = 1 OR applied = 1)`,
    )
    .run(purgeBefore).changes;
  // marcações de vagas que já foram apagadas não servem para nada
  db.prepare('DELETE FROM marks WHERE job_id NOT IN (SELECT id FROM jobs)').run();
  return { expired, purged };
}

export function* iterateRaw(db: DB): Generator<{ id: string; raw: string }> {
  yield* db.prepare('SELECT id, raw FROM jobs').iterate() as IterableIterator<{ id: string; raw: string }>;
}

export function getMeta(db: DB, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(db: DB, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function getMarks(db: DB): Map<string, Mark> {
  const rows = db.prepare('SELECT * FROM marks').all() as any[];
  return new Map(
    rows.map((r) => [r.job_id, { favorite: !!r.favorite, applied: !!r.applied, hidden: !!r.hidden, updatedAt: r.updated_at }]),
  );
}

export function saveMark(db: DB, jobId: string, mark: Mark): void {
  if (!mark.favorite && !mark.applied && !mark.hidden) {
    db.prepare('DELETE FROM marks WHERE job_id = ?').run(jobId);
    return;
  }
  db.prepare(
    `INSERT INTO marks (job_id, favorite, applied, hidden, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET favorite = excluded.favorite, applied = excluded.applied,
       hidden = excluded.hidden, updated_at = excluded.updated_at`,
  ).run(jobId, +mark.favorite, +mark.applied, +mark.hidden, mark.updatedAt);
}

export function getRuns(db: DB): Map<string, SourceRun> {
  const rows = db.prepare('SELECT * FROM source_runs').all() as any[];
  return new Map(
    rows.map((r) => [
      r.source,
      {
        source: r.source,
        lastRunAt: r.last_run_at,
        lastSuccessAt: r.last_success_at,
        lastCount: r.last_count,
        lastFetched: r.last_fetched,
        lastError: r.last_error,
        lastWarnings: r.last_warnings ? JSON.parse(r.last_warnings) : [],
        durationMs: r.duration_ms,
      },
    ]),
  );
}

export function saveRun(db: DB, run: SourceRun): void {
  db.prepare(
    `INSERT INTO source_runs (source, last_run_at, last_success_at, last_count, last_fetched, last_error, last_warnings, duration_ms)
     VALUES (@source, @lastRunAt, @lastSuccessAt, @lastCount, @lastFetched, @lastError, @lastWarnings, @durationMs)
     ON CONFLICT(source) DO UPDATE SET last_run_at = excluded.last_run_at, last_success_at = excluded.last_success_at,
       last_count = excluded.last_count, last_fetched = excluded.last_fetched, last_error = excluded.last_error,
       last_warnings = excluded.last_warnings, duration_ms = excluded.duration_ms`,
  ).run({ ...run, lastWarnings: JSON.stringify(run.lastWarnings ?? []) });
}
