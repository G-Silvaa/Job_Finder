/** Fontes que precisam de chave de API gratuita (ficam desativadas até você configurar o server/.env). */
import { fetchJson, sleep } from '../lib/http.js';
import { cleanWhitespace, toIsoDate } from '../lib/text.js';
import type { RawJob, Region, SourceDef } from '../types.js';
import { salaryFrom } from './util.js';

const stripTags = (s: string) => cleanWhitespace(String(s ?? '').replace(/<[^>]+>/g, ''));

const ADZUNA_SEARCHES: { cc: string; what: string; region: Region; currency: string }[] = [
  { cc: 'br', what: 'desenvolvedor', region: 'BR', currency: 'BRL' },
  { cc: 'br', what: 'developer', region: 'BR', currency: 'BRL' },
  { cc: 'us', what: 'software developer', region: 'US', currency: 'USD' },
  { cc: 'us', what: 'software engineer', region: 'US', currency: 'USD' },
];

export const adzuna: SourceDef = {
  id: 'adzuna',
  name: 'Adzuna',
  homepage: 'https://www.adzuna.com.br/',
  focus: ['BR', 'US'],
  description:
    'Agregador que reúne vagas de muitos sites (inclusive de grandes portais) no Brasil e nos EUA. A API só entrega um resumo da descrição. Chave grátis em developer.adzuna.com.',
  requiresEnv: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
  // limite da API: 250 consultas por dia
  minIntervalMinutes: 6 * 60,
  async collect(ctx) {
    const id = process.env.ADZUNA_APP_ID!;
    const key = process.env.ADZUNA_APP_KEY!;
    const days = Math.max(1, Math.ceil((Date.now() - ctx.since.getTime()) / 86_400_000));
    const byId = new Map<string, RawJob>();
    for (const s of ADZUNA_SEARCHES) {
      for (let page = 1; page <= 3; page++) {
        const url =
          `https://api.adzuna.com/v1/api/jobs/${s.cc}/search/${page}?app_id=${encodeURIComponent(id)}&app_key=${encodeURIComponent(key)}` +
          `&results_per_page=50&what=${encodeURIComponent(s.what)}&category=it-jobs&sort_by=date&max_days_old=${days}&content-type=application/json`;
        const data = await fetchJson(url, { signal: ctx.signal, ua: 'bot' });
        const results: any[] = data.results ?? [];
        for (const j of results) {
          const jid = `${s.cc}-${j.id}`;
          if (byId.has(jid)) continue;
          byId.set(jid, {
            source: 'adzuna',
            sourceId: jid,
            url: j.redirect_url,
            title: stripTags(j.title),
            company: j.company?.display_name,
            location: [j.location?.display_name, ...(j.location?.area ?? []).slice(0, 1)].filter(Boolean).join(', '),
            regionHint: [s.region],
            publishedAt: toIsoDate(j.created),
            description: stripTags(j.description),
            descriptionFormat: 'text',
            salary: !j.salary_is_predicted || j.salary_is_predicted === '0' ? salaryFrom(j.salary_min, j.salary_max, s.currency, 'year') : undefined,
            employmentType: [j.contract_type, j.contract_time].filter(Boolean).join(', ').replace(/_/g, ' ') || undefined,
          });
        }
        if (results.length < 50) break;
        await sleep(2600, ctx.signal); // máximo de 25 por minuto
      }
    }
    return { jobs: [...byId.values()], complete: false };
  },
};

const JOOBLE_SEARCHES: { host: string; keywords: string; location: string; region: Region }[] = [
  { host: 'br.jooble.org', keywords: 'desenvolvedor', location: 'Brasil', region: 'BR' },
  { host: 'pt.jooble.org', keywords: 'programador developer', location: 'Portugal', region: 'PT' },
  { host: 'jooble.org', keywords: 'software developer', location: 'United States', region: 'US' },
];

export const jooble: SourceDef = {
  id: 'jooble',
  name: 'Jooble',
  homepage: 'https://br.jooble.org/',
  focus: ['BR', 'PT', 'US'],
  description:
    'Agregador internacional (Brasil, Portugal e EUA). A API entrega só um trecho da descrição. Chave grátis em jooble.org/api/about.',
  requiresEnv: ['JOOBLE_API_KEY'],
  minIntervalMinutes: 6 * 60,
  async collect(ctx) {
    const key = process.env.JOOBLE_API_KEY!;
    const byId = new Map<string, RawJob>();
    const warnings: string[] = [];
    for (const s of JOOBLE_SEARCHES) {
      try {
        for (let page = 1; page <= 3; page++) {
          const data = await fetchJson(`https://${s.host}/api/${encodeURIComponent(key)}`, {
            method: 'POST',
            body: JSON.stringify({ keywords: s.keywords, location: s.location, page: String(page) }),
            headers: { 'content-type': 'application/json' },
            signal: ctx.signal,
            ua: 'bot',
          });
          const jobs: any[] = data.jobs ?? [];
          for (const j of jobs) {
            const jid = `${s.region}-${j.id}`;
            if (byId.has(jid)) continue;
            byId.set(jid, {
              source: 'jooble',
              sourceId: jid,
              url: j.link,
              title: stripTags(j.title),
              company: j.company,
              location: j.location,
              regionHint: [s.region],
              publishedAt: toIsoDate(j.updated),
              description: stripTags(j.snippet),
              descriptionFormat: 'text',
              salary: j.salary ? { text: j.salary } : undefined,
              employmentType: j.type || undefined,
              tags: [j.source].filter(Boolean),
            });
          }
          if (jobs.length < 20) break;
          await sleep(1000, ctx.signal);
        }
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        warnings.push(`${s.location}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    if (warnings.length === JOOBLE_SEARCHES.length) throw new Error(warnings.join(' | '));
    return { jobs: [...byId.values()], complete: false, warnings };
  },
};
