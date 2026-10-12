/**
 * Coleta pelo terminal, sem subir o servidor.
 *   npm run collect                 -> todas as fontes ativas
 *   npm run collect -- gupy remotive -> só essas
 *   npm run collect -- --skip=himalayas -> todas menos essas
 */
import { Collector, reclassifyIfNeeded } from './collector.js';
import { config } from './config.js';
import { openDb } from './db.js';
import { SOURCES } from './sources/index.js';
import { JobStore } from './store.js';

const args = process.argv.slice(2);
const skip = new Set(
  args
    .filter((a) => a.startsWith('--skip='))
    .flatMap((a) => a.slice(7).split(','))
    .filter(Boolean),
);
let only = args.filter((a) => !a.startsWith('-'));
if (skip.size) only = (only.length ? only : SOURCES.map((s) => s.id)).filter((id) => !skip.has(id));
const unknown = [...only, ...skip].filter((id) => !SOURCES.some((s) => s.id === id));
if (unknown.length) {
  console.error(`Fonte(s) desconhecida(s): ${unknown.join(', ')}\nDisponíveis: ${SOURCES.map((s) => s.id).join(', ')}`);
  process.exit(1);
}

const db = openDb(config.dbPath);
const log = (m: string) => console.log(`${new Date().toLocaleTimeString('pt-BR')} ${m}`);
reclassifyIfNeeded(db, log);
const store = new JobStore();
const collector = new Collector(db, store, log);
await collector.run({ sources: only.length ? only : undefined, force: true });

const s = store.stats();
console.log(`\nTotal ativo: ${s.total} | IA p/ programar: ${s.ai.vibe} | IA/LLM: ${s.ai.llm}`);
console.log('Por região:', s.regions);
console.log('Por fonte:', s.sources);
db.close();
