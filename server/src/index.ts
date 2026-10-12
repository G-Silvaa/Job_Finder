import Fastify from 'fastify';
import { registerApi } from './api.js';
import { Collector, reclassifyIfNeeded, reloadStore } from './collector.js';
import { config } from './config.js';
import { getMeta, openDb } from './db.js';
import { JobStore } from './store.js';

const app = Fastify({ logger: false });

const log = (msg: string) => console.log(`${new Date().toLocaleTimeString('pt-BR')} ${msg}`);
app.addHook('onError', async (req, _reply, err) => {
  console.error(`${new Date().toLocaleTimeString('pt-BR')} ERRO em ${req.method} ${req.url}:`, err);
});

const db = openDb(config.dbPath);
reclassifyIfNeeded(db, log);
const store = new JobStore();
reloadStore(db, store);
const collector = new Collector(db, store, log);

await registerApi(app, { db, store, collector });

// Coleta periódica
// setInterval aceita no máximo ~24,8 dias; acima disso o Node dispararia sem parar
const intervalMs = Math.min(config.collectIntervalHours * 3_600_000, 2_147_483_647);
const scheduleCollect = () => collector.run().catch((e) => console.error('Falha na coleta:', e));
if (intervalMs > 0) setInterval(scheduleCollect, intervalMs).unref();
if (config.collectOnStart) {
  const last = Date.parse(getMeta(db, 'last_collect_at') ?? '') || 0;
  // ao iniciar, só coleta se a última coleta for mais velha que o intervalo (ou se o banco estiver vazio)
  if (store.size === 0 || Date.now() - last > Math.min(intervalMs || Infinity, 3 * 3_600_000)) setTimeout(scheduleCollect, 1500);
}

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
log(`Radar de Vagas rodando em http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port} — ${store.size} vagas no banco`);
