import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carrega server/.env (ou .env na raiz do projeto) se existir. Node 20.12+ tem process.loadEnvFile.
for (const file of [path.join(serverRoot, '.env'), path.join(serverRoot, '..', '.env')]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* arquivo opcional */
  }
}

const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : def;
};
const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : /^(1|true|yes|sim|on)$/i.test(v));
const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: num(process.env.PORT, 3001),
  host: process.env.HOST || '127.0.0.1',
  dbPath: path.resolve(serverRoot, process.env.DB_PATH || 'data/vagas.db'),
  webDist: path.resolve(serverRoot, '..', 'web', 'dist'),
  /**
   * De quantas em quantas horas o radar verifica as fontes. Cada fonte só é consultada de novo
   * depois do intervalo mínimo dela (de 30 min a 20 h), então rodar a cada hora é seguro.
   */
  collectIntervalHours: num(process.env.COLLECT_INTERVAL_HOURS, 1),
  collectOnStart: bool(process.env.COLLECT_ON_START, true),
  /** Vagas publicadas há mais tempo que isso são ignoradas (se definido, vale para todas as fontes). */
  maxJobAgeDays: num(process.env.MAX_JOB_AGE_DAYS, 60),
  maxJobAgeFromEnv: !!process.env.MAX_JOB_AGE_DAYS,
  /** Quantas fontes coletar ao mesmo tempo. */
  sourceConcurrency: num(process.env.SOURCE_CONCURRENCY, 4),
  /** Fora do Brasil (Portugal, EUA, global…), só entram vagas 100% remotas. */
  remoteOnlyOutsideBr: bool(process.env.REMOTE_ONLY_OUTSIDE_BR, true),
  disabledSources: new Set(list(process.env.DISABLED_SOURCES)),
  enabledSources: new Set(list(process.env.ENABLED_SOURCES)),
};
