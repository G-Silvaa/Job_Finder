/** Quadros de vagas remotas globais / EUA com API pública ou RSS. */
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { fetchJson, fetchText, mapLimit, sleep } from '../lib/http.js';
import { findJsonLd } from '../lib/jsonld.js';
import { cleanWhitespace, decodeEntities, toIsoDate } from '../lib/text.js';
import type { CollectContext, RawJob, Seniority, SourceDef, WorkMode } from '../types.js';
import { countryCode, joinLocation, periodFrom, salaryFrom } from './util.js';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true });
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ((v as any)?.['#text'] ?? ''));
const days = (ctx: CollectContext) => Math.max(1, Math.ceil((Date.now() - ctx.since.getTime()) / 86_400_000));

async function rssItems(url: string, ctx: CollectContext): Promise<any[]> {
  const body = await fetchText(url, { signal: ctx.signal, ua: 'bot' });
  return asArray<any>(xml.parse(body)?.rss?.channel?.item);
}

/** "Cargo at Empresa" -> { title, company } */
function splitAt(raw: string): { title: string; company: string } {
  const i = raw.lastIndexOf(' at ');
  return i > 0 ? { title: raw.slice(0, i).trim(), company: raw.slice(i + 4).trim() } : { title: raw.trim(), company: '' };
}

// ---------------------------------------------------------------- We Work Remotely (RSS)

const WWR_FEEDS = [
  'remote-full-stack-programming-jobs',
  'remote-back-end-programming-jobs',
  'remote-front-end-programming-jobs',
  'remote-devops-sysadmin-jobs',
];

export const weworkremotely: SourceDef = {
  id: 'weworkremotely',
  name: 'We Work Remotely',
  homepage: 'https://weworkremotely.com/remote-jobs',
  focus: ['WORLDWIDE', 'US', 'EUROPE'],
  description: 'Um dos maiores quadros de vagas 100% remotas (feeds RSS de full-stack, back-end, front-end e DevOps).',
  minIntervalMinutes: 60,
  async collect(ctx) {
    const jobs: RawJob[] = [];
    for (const feed of WWR_FEEDS) {
      for (const it of await rssItems(`https://weworkremotely.com/categories/${feed}.rss`, ctx)) {
        const rawTitle = text(it.title);
        const idx = rawTitle.indexOf(':'); // "Empresa: Cargo"
        const link = text(it.link) || text(it.guid);
        // "country" lista as restrições com bandeirinhas: "🇧🇷 Brazil, 🇺🇸 United States of America"
        const countries = text(it.country).replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '').replace(/\s+/g, ' ').trim();
        jobs.push({
          source: 'weworkremotely',
          sourceId: link.replace(/^https?:\/\/weworkremotely\.com\/remote-jobs\//, ''),
          url: link,
          title: idx > 0 ? rawTitle.slice(idx + 1).trim() : rawTitle,
          company: idx > 0 ? rawTitle.slice(0, idx).trim() : '',
          companyLogo: it['media:content']?.['@_url'],
          location: countries || text(it.region) || 'Anywhere in the World',
          workMode: 'remote',
          publishedAt: toIsoDate(text(it.pubDate)),
          description: text(it.description),
          descriptionFormat: 'html',
          tags: [text(it.category), ...text(it.skills).split(',')].map((s) => s.trim()).filter(Boolean),
          employmentType: text(it.type) || undefined,
          trustedDev: true,
        });
      }
      await sleep(400, ctx.signal);
    }
    // o feed só traz as vagas mais recentes: as que saem dele não estão necessariamente encerradas
    return { jobs, complete: false };
  },
};

// ---------------------------------------------------------------- Remotive (RSS; a API está bloqueada no robots.txt)

export const remotive: SourceDef = {
  id: 'remotive',
  name: 'Remotive',
  homepage: 'https://remotive.com/remote-jobs/software-development',
  focus: ['WORLDWIDE', 'US', 'EUROPE', 'LATAM'],
  description: 'Vagas remotas de software. O feed público mostra só as mais recentes (com 24h de atraso).',
  // o Remotive pede no máximo poucas consultas por dia
  minIntervalMinutes: 6 * 60,
  async collect(ctx) {
    const jobs = (await rssItems('https://remotive.com/remote-jobs/software-development/feed', ctx)).map(
      (it: any): RawJob => {
        const link = text(it.link);
        return {
          source: 'remotive',
          sourceId: text(it.jobId) || link.match(/-(\d+)\/?$/)?.[1] || link,
          url: link,
          title: text(it.title),
          company: text(it.company),
          location: text(it.location),
          workMode: 'remote',
          publishedAt: toIsoDate(text(it.pubDate)),
          description: text(it.description),
          descriptionFormat: 'html',
          employmentType: text(it.type) || undefined,
          tags: [text(it.category)].filter(Boolean),
          trustedDev: true,
        };
      },
    );
    return { jobs, complete: false };
  },
};

// ---------------------------------------------------------------- Jobicy

const JOBICY_LEVEL: Record<string, Seniority> = { senior: 'senior', midweight: 'mid', junior: 'junior', director: 'lead', lead: 'lead' };

export const jobicy: SourceDef = {
  id: 'jobicy',
  name: 'Jobicy',
  homepage: 'https://jobicy.com/jobs/dev',
  focus: ['WORLDWIDE', 'US', 'EUROPE', 'LATAM'],
  description: 'Vagas remotas de engenharia de software dos últimos 7 dias, muitas com faixa salarial.',
  minIntervalMinutes: 60,
  async collect(ctx) {
    const data = await fetchJson('https://jobicy.com/api/v2/remote-jobs?count=200&industry=engineering', { signal: ctx.signal, ua: 'bot' });
    const jobs = (data.jobs ?? []).map(
      (j: any): RawJob => ({
        source: 'jobicy',
        sourceId: String(j.id),
        url: j.url,
        title: decodeEntities(j.jobTitle ?? ''),
        company: decodeEntities(j.companyName ?? ''),
        companyLogo: j.companyLogo,
        location: String(j.jobGeo ?? '').replace(/,\s+/g, ', '),
        workMode: 'remote',
        publishedAt: toIsoDate(j.pubDate),
        description: j.jobDescription,
        descriptionFormat: 'html',
        salary: salaryFrom(j.salaryMin ?? j.annualSalaryMin, j.salaryMax ?? j.annualSalaryMax, j.salaryCurrency, periodFrom(j.salaryPeriod ?? 'yearly')),
        seniority: JOBICY_LEVEL[String(j.jobLevel ?? '').toLowerCase()],
        tags: [...(j.jobIndustry ?? []), ...(j.jobLevel && j.jobLevel !== 'Any' ? [j.jobLevel] : [])],
        employmentType: (j.jobType ?? []).join(', ') || undefined,
        trustedDev: true,
      }),
    );
    return { jobs, complete: false };
  },
};

// ---------------------------------------------------------------- Working Nomads

export const workingnomads: SourceDef = {
  id: 'workingnomads',
  name: 'Working Nomads',
  homepage: 'https://www.workingnomads.com/jobs?category=development',
  focus: ['WORLDWIDE', 'EUROPE', 'US'],
  description: 'Vagas remotas curadas para nômades digitais (categoria Development).',
  minIntervalMinutes: 3 * 60,
  async collect(ctx) {
    const data = await fetchJson<any[]>('https://www.workingnomads.com/api/exposed_jobs/', { signal: ctx.signal, ua: 'bot', timeoutMs: 60_000 });
    const jobs = (Array.isArray(data) ? data : [])
      .filter((j) => /development|programming|devops|engineering/i.test(j.category_name ?? ''))
      .map(
        (j: any): RawJob => ({
          source: 'workingnomads',
          sourceId: String(j.url).match(/\/(\d+)\/?$/)?.[1] ?? j.url,
          url: j.url,
          title: j.title,
          company: j.company_name,
          location: j.location,
          workMode: 'remote',
          publishedAt: toIsoDate(j.pub_date),
          description: j.description,
          descriptionFormat: 'html',
          tags: String(j.tags ?? '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          trustedDev: true,
        }),
      );
    return { jobs, complete: false };
  },
};

// ---------------------------------------------------------------- Himalayas

const HIMALAYAS_SEARCHES: { q: string; country?: string; worldwide?: boolean; pages: number }[] = [
  { q: 'developer', country: 'BR', pages: 6 },
  { q: 'engineer', country: 'BR', pages: 4 },
  { q: 'developer', country: 'PT', pages: 4 },
  { q: 'engineer', country: 'PT', pages: 3 },
  { q: 'developer', country: 'US', pages: 4 },
  { q: 'software engineer', country: 'US', pages: 6 },
  { q: 'developer', worldwide: true, pages: 4 },
  { q: 'engineer', worldwide: true, pages: 4 },
];
const HIMALAYAS_LEVEL: Record<string, Seniority> = { 'entry-level': 'junior', 'mid-level': 'mid', senior: 'senior', manager: 'lead', director: 'lead' };

export const himalayas: SourceDef = {
  id: 'himalayas',
  name: 'Himalayas',
  homepage: 'https://himalayas.app/jobs',
  focus: ['BR', 'PT', 'US', 'WORLDWIDE'],
  description: 'Grande quadro de vagas remotas com filtro por país (buscamos Brasil, Portugal, EUA e vagas globais). Atualiza 1x por dia.',
  // os dados deles são atualizados a cada 24h e pedem para não consultar mais que isso
  minIntervalMinutes: 20 * 60,
  maxAgeDays: 180,
  async collect(ctx) {
    const byId = new Map<string, RawJob>();
    const warnings: string[] = [];
    for (const s of HIMALAYAS_SEARCHES) {
      try {
        for (let page = 1; page <= s.pages; page++) {
          const where = s.worldwide ? 'worldwide=true' : `country=${s.country}&exclude_worldwide=true`;
          const data = await fetchJson(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(s.q)}&${where}&sort=recent&page=${page}`, {
            signal: ctx.signal,
            ua: 'bot',
          });
          const items: any[] = data.jobs ?? [];
          for (const j of items) {
            const id = String(j.guid ?? j.applicationLink ?? '').replace(/^https?:\/\/himalayas\.app\//, '');
            if (!id || byId.has(id)) continue;
            const restrictions: string[] = j.locationRestrictions ?? [];
            byId.set(id, {
              source: 'himalayas',
              sourceId: id,
              url: j.applicationLink || j.guid,
              title: j.title,
              company: j.companyName,
              companyLogo: j.companyLogo,
              location: restrictions.length ? restrictions.join(', ') : 'Worldwide',
              workMode: 'remote',
              publishedAt: toIsoDate(j.pubDate),
              description: j.description,
              descriptionFormat: 'html',
              salary: salaryFrom(j.minSalary, j.maxSalary, j.currency, periodFrom(j.salaryPeriod) ?? 'year'),
              seniority: HIMALAYAS_LEVEL[String(j.seniority?.[0] ?? '').toLowerCase()],
              employmentType: j.employmentType,
              tags: [...(j.parentCategories ?? []), ...(j.categories ?? []).map((c: string) => c.replace(/-/g, ' '))].slice(0, 12),
            });
          }
          const last = items[items.length - 1];
          if (items.length < 20 || (last?.pubDate && Number(last.pubDate) * 1000 < ctx.since.getTime())) break;
          await sleep(1200, ctx.signal);
        }
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        warnings.push(`${s.q}/${s.country ?? 'mundo'}: ${(e as Error).message.slice(0, 100)}`);
      }
      await sleep(1200, ctx.signal);
    }
    return { jobs: [...byId.values()], complete: false, warnings };
  },
};

// ---------------------------------------------------------------- 4dayweek.io

const FDW_LEVEL: Record<string, Seniority> = { entry: 'junior', junior: 'junior', mid: 'mid', senior: 'senior', lead: 'lead', principal: 'lead' };
const FDW_MODE: Record<string, WorkMode> = { remote: 'remote', hybrid: 'hybrid', onsite: 'onsite' };

export const fourdayweek: SourceDef = {
  id: 'fourdayweek',
  name: '4 Day Week',
  homepage: 'https://4dayweek.io/remote-jobs/engineering',
  focus: ['WORLDWIDE', 'US', 'EUROPE', 'BR'],
  description: 'Vagas de engenharia em empresas com semana de 4 dias ou bons benefícios; milhares de vagas remotas com salário.',
  minIntervalMinutes: 3 * 60,
  async collect(ctx) {
    const byId = new Map<string, RawJob>();
    const searches = [
      { params: 'work_arrangement=remote', pages: 12 },
      { params: 'country=Brazil', pages: 3 },
      { params: 'country=Portugal', pages: 2 },
    ];
    for (const s of searches) {
      for (let page = 1; page <= s.pages; page++) {
        const data = await fetchJson(
          `https://4dayweek.io/api/v2/jobs?category=engineering&${s.params}&posted_after=${days(ctx)}&sort=date&limit=100&page=${page}`,
          { signal: ctx.signal, ua: 'bot' },
        );
        for (const j of data.data ?? []) {
          if (byId.has(j.id)) continue;
          const locs: any[] = j.locations ?? [];
          const salaryDiv = (v: unknown) => (Number(v) ? Number(v) / 100 : undefined); // vem em centavos
          byId.set(j.id, {
            source: 'fourdayweek',
            sourceId: j.id,
            url: j.url,
            title: j.title,
            company: j.company?.name,
            companyLogo: j.company?.logo_url,
            location: locs.map((l) => joinLocation(l.city, l.state, l.country)).join(' · ') || (j.company?.hires_worldwide ? 'Worldwide' : ''),
            countries: locs.map((l) => countryCode(l.country)).filter((c): c is string => !!c),
            workMode: FDW_MODE[j.work_arrangement],
            publishedAt: toIsoDate(j.posted_at),
            description: j.description,
            descriptionFormat: 'markdown',
            salary: salaryFrom(salaryDiv(j.salary_min), salaryDiv(j.salary_max), j.salary_currency, periodFrom(j.salary_period)),
            seniority: FDW_LEVEL[j.level],
            employmentType: j.contract_type,
            tags: [j.role, ...(j.stack ?? []).map((s: any) => s.name), ...(j.skills ?? []).map((s: any) => s.name)].filter(Boolean).slice(0, 15),
            trustedDev: true,
          });
        }
        if (!data.has_more) break;
        await sleep(1100, ctx.signal);
      }
    }
    return { jobs: [...byId.values()], complete: false };
  },
};

// ---------------------------------------------------------------- RemoteOK

const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** A API do RemoteOK manda UTF-8 lido como Latin-1 ("MÃ©xico"); desfaz quando dá. */
function fixMojibake(s: string): string {
  if (!s || !/[ÃÂâ][\u0080-ÿŒ-™]/.test(s)) return s;
  const bytes: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c <= 0xff) bytes.push(c);
    else if (CP1252[c] !== undefined) bytes.push(CP1252[c]);
    else return s;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

export const remoteok: SourceDef = {
  id: 'remoteok',
  name: 'Remote OK',
  homepage: 'https://remoteok.com/remote-dev-jobs',
  focus: ['WORLDWIDE', 'US'],
  description: 'Quadro de vagas remotas popular entre devs (as ~100 vagas mais recentes).',
  minIntervalMinutes: 2 * 60,
  async collect(ctx) {
    const data = await fetchJson<any[]>('https://remoteok.com/api', { signal: ctx.signal, ua: 'bot' });
    const jobs = (Array.isArray(data) ? data : [])
      .filter((j) => j?.id && j?.position)
      .map(
        (j: any): RawJob => ({
          source: 'remoteok',
          sourceId: String(j.id),
          url: j.url,
          title: fixMojibake(j.position),
          company: fixMojibake(j.company),
          companyLogo: j.company_logo || j.logo || undefined,
          location: fixMojibake(j.location ?? ''),
          workMode: 'remote',
          publishedAt: toIsoDate(j.epoch ?? j.date),
          description: fixMojibake(j.description ?? ''),
          descriptionFormat: 'html',
          salary: Number(j.salary_min) || Number(j.salary_max) ? salaryFrom(j.salary_min, j.salary_max, 'USD', 'year') : undefined,
          tags: (Array.isArray(j.tags) ? j.tags : []).slice(0, 12),
        }),
      );
    return { jobs, complete: false };
  },
};

// ---------------------------------------------------------------- AI Dev Jobs (aidevboard.com)

const AIDEV_TAGS = ['code-generation', 'fullstack', 'backend', 'frontend', 'devops'];
const AIDEV_LEVEL: Record<string, Seniority> = { intern: 'intern', junior: 'junior', mid: 'mid', senior: 'senior', lead: 'lead', principal: 'lead', staff: 'lead' };
const AIDEV_MODE: Record<string, WorkMode> = { remote: 'remote', hybrid: 'hybrid', onsite: 'onsite', 'on-site': 'onsite' };

export const aidevboard: SourceDef = {
  id: 'aidevboard',
  name: 'AI Dev Jobs',
  homepage: 'https://aidevboard.com/',
  focus: ['US', 'WORLDWIDE', 'EUROPE'],
  description: 'Quadro especializado em vagas de empresas de IA (inclui a tag code-generation: ferramentas de geração de código).',
  minIntervalMinutes: 3 * 60,
  maxAgeDays: 90,
  async collect(ctx) {
    const byId = new Map<string, RawJob>();
    for (const tag of AIDEV_TAGS) {
      for (let page = 1; page <= 4; page++) {
        const data = await fetchJson(
          `https://aidevboard.com/api/v1/jobs?tags=${tag}&posted_within_days=${Math.min(days(ctx), 60)}&limit=50&page=${page}`,
          { signal: ctx.signal, ua: 'bot' },
        );
        for (const j of data.jobs ?? []) {
          if (byId.has(j.id) || (j.status && j.status !== 'active')) continue;
          byId.set(j.id, {
            source: 'aidevboard',
            sourceId: j.id,
            url: j.url || j.apply_url,
            title: j.title,
            company: j.company_name,
            companyLogo: j.company_logo_url,
            location: j.remote_scope === 'global' ? `Remote (Worldwide)${j.location ? ` · ${j.location}` : ''}` : j.location,
            workMode: AIDEV_MODE[j.workplace],
            publishedAt: toIsoDate(j.published_at ?? j.created_at),
            description: j.description,
            descriptionFormat: 'markdown',
            salary: salaryFrom(j.salary_min, j.salary_max, 'USD', 'year'),
            seniority: AIDEV_LEVEL[j.experience_level],
            employmentType: j.job_type,
            tags: j.tags ?? [],
          });
        }
        if (!data.has_next) break;
        await sleep(800, ctx.signal);
      }
    }
    return { jobs: [...byId.values()], complete: false };
  },
};

// ---------------------------------------------------------------- Remote Vibe Coding Jobs (RSS)

export const remotevibecoding: SourceDef = {
  id: 'remotevibecoding',
  name: 'Remote Vibe Coding Jobs',
  homepage: 'https://remotevibecodingjobs.com/',
  focus: ['WORLDWIDE', 'US'],
  description: 'Quadro de vagas remotas em empresas que adotam desenvolvimento assistido por IA (as 100 mais recentes).',
  minIntervalMinutes: 3 * 60,
  async collect(ctx) {
    const jobs: RawJob[] = [];
    for (const it of await rssItems('https://remotevibecodingjobs.com/feed.xml', ctx)) {
      const link = text(it.link);
      const raw = decodeEntities(text(it.description));
      // cabeçalho "Company: / Location: / Type: / Level: / Tech Stack: / Culture:" antes do texto
      const [head, ...rest] = raw.split(/\n\s*\n/);
      const fields = Object.fromEntries(
        head
          .split('\n')
          .map((l) => l.match(/^([A-Za-z ]+):\s*(.*)$/))
          .filter((m): m is RegExpMatchArray => !!m)
          .map((m) => [m[1].trim().toLowerCase(), m[2].trim()]),
      );
      const body = rest.join('\n\n');
      const openTo = body.match(/open to candidates in ([^.\n]{2,60})/i)?.[1];
      const { title, company } = splitAt(decodeEntities(text(it.title)));
      jobs.push({
        source: 'remotevibecoding',
        sourceId: link.split('/').filter(Boolean).pop() ?? link,
        url: link,
        title: title.replace(/^\[remote\]\s*/i, ''),
        company: fields.company || company,
        location: openTo ? `Remote (${openTo})` : fields.location,
        workMode: 'remote',
        publishedAt: toIsoDate(text(it.pubDate)),
        // a linha "Culture: vibe-coding" está em todas as vagas, então não entra no texto analisado
        description: Object.keys(fields).length ? body : raw,
        descriptionFormat: 'text',
        seniority: AIDEV_LEVEL[String(fields.level ?? '').toLowerCase()],
        employmentType: fields.type,
        tags: String(fields['tech stack'] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }
    return { jobs, complete: false };
  },
};

// ---------------------------------------------------------------- Y Combinator (startups)

export const ycombinator: SourceDef = {
  id: 'ycombinator',
  name: 'Y Combinator · Startups',
  homepage: 'https://www.ycombinator.com/jobs/role/software-engineer/remote',
  focus: ['US', 'WORLDWIDE'],
  description: 'Vagas remotas de engenharia em startups da YC (muitas de IA).',
  minIntervalMinutes: 6 * 60,
  maxAgeDays: 365,
  async collect(ctx) {
    const html = await fetchText('https://www.ycombinator.com/jobs/role/software-engineer/remote', { signal: ctx.signal, ua: 'bot' });
    const $ = cheerio.load(html);
    const data = JSON.parse($('div[data-page]').first().attr('data-page') ?? '{}');
    const postings: any[] = data.props?.jobPostings ?? [];
    const jobs: RawJob[] = postings.map((p) => {
      // "Remote (US; CA)" / "BR / CO / Remote (BR; CO)" -> códigos de país
      const codes = [...String(p.location ?? '').matchAll(/\b([A-Z]{2})\b/g)].map((m) => m[1]);
      return {
        source: 'ycombinator',
        sourceId: String(p.id),
        url: new URL(p.url, 'https://www.ycombinator.com').toString(),
        title: p.title,
        company: p.companyName,
        companyLogo: p.companyLogoUrl,
        location: p.location,
        countries: codes.filter((c) => ['US', 'BR', 'PT'].includes(c)),
        workMode: /remote/i.test(p.location ?? '') ? 'remote' : undefined,
        salary: p.salaryRange ? { text: p.salaryRange } : undefined,
        employmentType: p.type,
        tags: [p.roleSpecificType, p.companyBatchName ? `YC ${p.companyBatchName}` : '', p.minExperience, ...(p.skills ?? [])].filter(Boolean),
      };
    });
    let pending = 0;
    let budget = 40;
    await mapLimit(jobs, 2, async (job) => {
      const prev = ctx.previous.get(job.sourceId);
      if (prev?.description) {
        job.description = prev.description;
        job.descriptionFormat = prev.descriptionFormat;
        job.publishedAt = prev.publishedAt;
        return;
      }
      if (budget-- <= 0) return void pending++;
      try {
        const page = await fetchText(job.url, { signal: ctx.signal, ua: 'bot', retries: 1 });
        const d = cheerio.load(page);
        const props = JSON.parse(d('div[data-page]').first().attr('data-page') ?? '{}').props ?? {};
        const ld = findJsonLd(page);
        job.description = props.job?.description ?? ld?.description ?? '';
        job.descriptionFormat = props.job?.description ? 'markdown' : 'html';
        job.publishedAt = toIsoDate(ld?.datePosted);
      } catch (e) {
        if (ctx.signal.aborted) throw e;
      }
      await sleep(600, ctx.signal);
    });
    return { jobs, complete: false, warnings: pending ? [`${pending} descrições ficam para a próxima coleta`] : [] };
  },
};
