/** Fontes de Portugal. */
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { isDevJob } from '../classify/relevance.js';
import { fetchJson, fetchText, mapLimit, sleep } from '../lib/http.js';
import { findJsonLd, jsonLdLocation } from '../lib/jsonld.js';
import { cleanWhitespace, decodeEntities, norm, toIsoDate } from '../lib/text.js';
import type { CollectContext, RawJob, Seniority, SourceDef, WorkMode } from '../types.js';
import { joinLocation, periodFrom, salaryFrom } from './util.js';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true });
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ((v as any)?.['#text'] ?? ''));

/** Reaproveita a descrição já baixada; baixa a página de detalhe só das vagas novas (com limite por coleta). */
async function fillDetails(
  ctx: CollectContext,
  jobs: RawJob[],
  fetchDetail: (job: RawJob) => Promise<Partial<RawJob> | undefined>,
  opts: { max: number; concurrency?: number; delayMs?: number },
): Promise<number> {
  let budget = opts.max;
  let pending = 0;
  await mapLimit(jobs, opts.concurrency ?? 1, async (job) => {
    const prev = ctx.previous.get(job.sourceId);
    if (prev?.description) {
      for (const [k, v] of Object.entries(prev)) {
        const cur = (job as any)[k];
        if (cur === undefined || cur === '' || (Array.isArray(cur) && !cur.length)) (job as any)[k] = v;
      }
      return;
    }
    if (budget-- <= 0) {
      pending++;
      return;
    }
    try {
      const extra = await fetchDetail(job);
      if (extra) for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '' && v !== null) (job as any)[k] = v;
    } catch (e) {
      if (ctx.signal.aborted) throw e;
    }
    await sleep(opts.delayMs ?? 1100, ctx.signal);
  });
  return pending;
}

// ---------------------------------------------------------------- ITJobs.pt

const ITJOBS_QUERIES = [
  'developer',
  'programador',
  'software engineer',
  'frontend',
  'backend',
  'full stack',
  'react',
  'java',
  'python',
  '.net',
  'node',
  'mobile',
  'devops',
  'data engineer',
  'AI',
];

const ITJOBS_MODE: Record<string, WorkMode> = { '0': 'onsite', '1': 'remote', '2': 'hybrid', remoto: 'remote', 'híbrido': 'hybrid', hibrido: 'hybrid', presencial: 'onsite' };

async function itjobsApi(ctx: CollectContext, key: string): Promise<RawJob[]> {
  const jobs: RawJob[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await fetchJson(`https://api.itjobs.pt/job/list.json?api_key=${encodeURIComponent(key)}&limit=100&page=${page}`, {
      signal: ctx.signal,
      ua: 'bot',
    });
    if (data.error) throw new Error(`ITJobs: ${data.error.message ?? 'erro na API'}`);
    const results: any[] = data.results ?? [];
    for (const j of results) {
      jobs.push({
        source: 'itjobs',
        sourceId: String(j.id),
        url: `https://www.itjobs.pt/oferta/${j.id}/${j.slug ?? ''}`,
        title: j.title,
        company: j.company?.name,
        companyLogo: j.company?.logo,
        location: joinLocation(...(j.locations ?? []).map((l: any) => l.name), 'Portugal'),
        regionHint: ['PT'],
        workMode: ITJOBS_MODE[String(j.workModel ?? j.work_model ?? '').toLowerCase()],
        publishedAt: toIsoDate(String(j.publishedAt ?? '').replace(' ', 'T')),
        description: j.body,
        descriptionFormat: 'html',
        salary: j.salaryMin || j.salaryMax ? salaryFrom(j.salaryMin, j.salaryMax, 'EUR', 'year') : undefined,
        employmentType: [...(j.types ?? []), ...(j.contracts ?? [])].map((t: any) => t.name ?? t).join(', ') || undefined,
      });
    }
    if (results.length < 100 || page * 100 >= (data.total ?? 0)) break;
    await sleep(500, ctx.signal);
  }
  return jobs;
}

async function itjobsRss(ctx: CollectContext): Promise<{ jobs: RawJob[]; pending: number }> {
  const byId = new Map<string, RawJob>();
  for (const q of ITJOBS_QUERIES) {
    const body = await fetchText(`https://www.itjobs.pt/feed/emprego?q=${encodeURIComponent(q)}`, { signal: ctx.signal, ua: 'bot' });
    for (const it of asArray<any>(xml.parse(body)?.rss?.channel?.item)) {
      const link = text(it.link);
      const id = link.match(/\/oferta\/(\d+)/)?.[1];
      if (!id || byId.has(id)) continue;
      const fields = Object.fromEntries(
        decodeEntities(text(it.description))
          .split(/<br\s*\/?>/i)
          .map((l) => l.split(/:\s*/))
          .filter((p) => p.length >= 2)
          .map(([k, ...v]) => [norm(k).trim(), v.join(': ').trim()]),
      );
      const nd = (v?: string) => (v && v !== 'n/d' ? v : undefined);
      byId.set(id, {
        source: 'itjobs',
        sourceId: id,
        url: link,
        title: text(it.title),
        company: nd(fields.empresa),
        location: joinLocation(nd(fields.localidade), 'Portugal'),
        regionHint: ['PT'],
        publishedAt: toIsoDate(text(it.pubDate)),
        employmentType: [nd(fields.tipo), nd(fields.contrato)].filter(Boolean).join(', ') || undefined,
      });
    }
    await sleep(1100, ctx.signal); // robots.txt pede 1 requisição por segundo
  }
  const jobs = [...byId.values()].filter((j) => isDevJob(norm(j.title), false));
  const pending = await fillDetails(
    ctx,
    jobs,
    async (job) => {
      const html = await fetchText(job.url, { signal: ctx.signal, ua: 'bot', retries: 1 });
      const ld = findJsonLd(html);
      const $ = cheerio.load(html);
      const mode = $('.info')
        .filter((_, el) => /modelo de trabalho/i.test($(el).find('.title').text()))
        .find('.field')
        .first()
        .text()
        .trim()
        .toLowerCase();
      const v = ld?.baseSalary?.value;
      return {
        description: ld?.description,
        descriptionFormat: 'html',
        companyLogo: typeof ld?.hiringOrganization?.logo === 'string' ? ld.hiringOrganization.logo : undefined,
        workMode: ITJOBS_MODE[mode] ?? (ld?.jobLocationType === 'TELECOMMUTE' ? 'remote' : undefined),
        salary: v?.minValue || v?.maxValue ? salaryFrom(v.minValue, v.maxValue, ld.baseSalary.currency || 'EUR', periodFrom(v.unitText) ?? 'year') : undefined,
      };
    },
    { max: 70, concurrency: 1, delayMs: 1100 },
  );
  return { jobs, pending };
}

export const itjobs: SourceDef = {
  id: 'itjobs',
  name: 'ITJobs.pt',
  homepage: 'https://www.itjobs.pt/',
  focus: ['PT'],
  description:
    'Maior quadro de vagas de TI de Portugal. Sem chave usa os feeds RSS + página da vaga; com ITJOBS_API_KEY (grátis em itjobs.pt/api) usa a API oficial e pega tudo.',
  minIntervalMinutes: 90,
  async collect(ctx) {
    const key = process.env.ITJOBS_API_KEY;
    if (key) return { jobs: await itjobsApi(ctx, key), complete: true };
    const { jobs, pending } = await itjobsRss(ctx);
    return { jobs, complete: false, warnings: pending ? [`${pending} descrições ficam para a próxima coleta`] : [] };
  },
};

// ---------------------------------------------------------------- Landing.jobs

const LJ_LEVEL: Record<string, Seniority> = { junior: 'junior', intermediate: 'mid', senior: 'senior', lead: 'lead', principal: 'lead' };

export const landingjobs: SourceDef = {
  id: 'landingjobs',
  name: 'Landing.jobs',
  homepage: 'https://landing.jobs/jobs',
  focus: ['PT', 'EUROPE'],
  description: 'Quadro português focado em tecnologia, com faixa salarial e nível de experiência.',
  minIntervalMinutes: 3 * 60,
  maxAgeDays: 365,
  async collect(ctx) {
    // a página /jobs traz a lista em JSON embutido (a API /api/ está bloqueada no robots.txt deles)
    const html = await fetchText('https://landing.jobs/jobs', { signal: ctx.signal, ua: 'bot' });
    const $ = cheerio.load(html);
    const data = JSON.parse($('script#initial-search-results').text() || '{}');
    const jobs: RawJob[] = (data.offers ?? []).map((o: any): RawJob => {
      const countries = [o.country_code, ...(o.office_locations ?? []).map((l: any) => l.country_code)].filter(Boolean);
      return {
        source: 'landingjobs',
        sourceId: String(o.id),
        url: o.url,
        title: o.title,
        company: o.display_company_name || o.company_name,
        companyLogo: o.display_company_logo_url || o.company_logo_url,
        location: o.global_remote ? 'Remote (worldwide)' : o.location,
        countries,
        regionHint: ['PT'],
        workMode: o.full_remote || o.global_remote ? 'remote' : o.partial_remote ? 'hybrid' : o.onsite_job ? 'onsite' : undefined,
        publishedAt: toIsoDate(o.published_at),
        seniority: LJ_LEVEL[norm(o.experience_level)],
        employmentType: o.contract_type,
        tags: (o.skills ?? []).map((s: any) => s.name).filter(Boolean),
      };
    });
    const pending = await fillDetails(
      ctx,
      jobs,
      async (job) => {
        const page = cheerio.load(await fetchText(job.url, { signal: ctx.signal, ua: 'bot', retries: 1 }));
        const sections = page('.lj-job-summary__section')
          .toArray()
          .map((el) => {
            const s = page(el);
            const title = s.find('h2').first().text().trim();
            const content = s.find('.lj-job-summary__content').first().html() ?? '';
            return content ? `<h4>${title}</h4>${content}` : '';
          })
          .join('');
        return { description: sections, descriptionFormat: 'html' };
      },
      { max: 60, concurrency: 2, delayMs: 700 },
    );
    return { jobs, complete: false, warnings: pending ? [`${pending} descrições ficam para a próxima coleta`] : [] };
  },
};

// ---------------------------------------------------------------- Teamlyzer

const TEAMLYZER_ROLES = ['backend', 'frontend', 'fullstack', 'mobile', 'devops-ou-sre', 'tester-ou-qa'];
const TL_LEVEL: Record<string, Seniority> = { junior: 'junior', middle: 'mid', senior: 'senior', lead: 'lead', intern: 'intern', estagio: 'intern' };

/** "Há 5 meses", "Há 2 semanas", "Há 3 dias", "Hoje" -> data aproximada */
function fromRelativeAge(s: string): string | undefined {
  const t = norm(s);
  if (/hoje|agora|horas?|minutos?/.test(t)) return new Date().toISOString();
  if (/ontem/.test(t)) return new Date(Date.now() - 86_400_000).toISOString();
  const m = t.match(/(\d+)\s*(dia|semana|mes|meses|ano)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  const days = m[2].startsWith('dia') ? n : m[2].startsWith('semana') ? n * 7 : m[2].startsWith('ano') ? n * 365 : n * 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export const teamlyzer: SourceDef = {
  id: 'teamlyzer',
  name: 'Teamlyzer',
  homepage: 'https://pt.teamlyzer.com/companies/jobs',
  focus: ['PT'],
  description: 'Vagas de tecnologia em Portugal com salário, nível e modelo de trabalho (o texto é um resumo do anúncio feito pelo Teamlyzer).',
  // páginas pesadas: coleta poucas vezes por dia
  minIntervalMinutes: 6 * 60,
  maxAgeDays: 180,
  async collect(ctx) {
    const byId = new Map<string, RawJob>();
    for (const role of TEAMLYZER_ROLES) {
      for (let page = 1; page <= 3; page++) {
        const html = await fetchText(`https://pt.teamlyzer.com/companies/jobs?profession_role=${role}&order=most_recent&page=${page}`, {
          signal: ctx.signal,
          timeoutMs: 45_000,
        });
        const $ = cheerio.load(html);
        const cards = $('div.jobboard-ad').toArray();
        let tooOld = false;
        for (const el of cards) {
          const c = $(el);
          const t = (sel: string) => cleanWhitespace(c.find(sel).first().text());
          const href = c.find('a.jobcard__title-link').attr('href') ?? '';
          const id = href.match(/-(\d+)\/?$/)?.[1];
          if (!id || byId.has(id)) continue;
          const publishedAt = fromRelativeAge(t('.jobcard__on-site'));
          if (publishedAt && Date.parse(publishedAt) < ctx.since.getTime()) {
            tooOld = true;
            continue;
          }
          const title = t('a.jobcard__title-link');
          const salary = t('.jobcard__salary');
          const logo = c.find('img.jobcard__logo-mobile').attr('src');
          byId.set(id, {
            source: 'teamlyzer',
            sourceId: id,
            url: new URL(href, 'https://pt.teamlyzer.com').toString(),
            title: title.charAt(0).toUpperCase() + title.slice(1),
            company: t('a.jobcard__company'),
            companyLogo: logo ? new URL(logo, 'https://pt.teamlyzer.com').toString() : undefined,
            location: t('.jobcard__location').replace(/\(Regime:\s*/i, '(').replace(/Escrit[óo]rio/i, 'Presencial'),
            regionHint: ['PT'],
            publishedAt,
            seniority: TL_LEVEL[norm(t('.jobcard__seniority'))],
            salary: salary ? { text: salary.replace(/\s*Bruto anual/i, ' bruto/ano') } : undefined,
            tags: [
              ...c.find('span.role-tag').map((_, e) => $(e).text().trim()).get(),
              ...c.find('.jobcard__tag').map((_, e) => $(e).text().trim()).get(),
            ].filter(Boolean),
            trustedDev: true,
          });
        }
        if (cards.length < 40 || tooOld) break;
        await sleep(1500, ctx.signal);
      }
    }
    const jobs = [...byId.values()];
    const pending = await fillDetails(
      ctx,
      jobs,
      async (job) => {
        const html = await fetchText(job.url, { signal: ctx.signal, retries: 1, timeoutMs: 45_000 });
        const ld = findJsonLd(html);
        const $ = cheerio.load(html);
        const summary = $('section.jobdescription').first().html();
        const v = ld?.baseSalary?.value;
        return {
          description: summary || ld?.description,
          descriptionFormat: 'html',
          publishedAt: toIsoDate(ld?.datePosted) ?? job.publishedAt,
          employmentType: Array.isArray(ld?.employmentType) ? ld.employmentType.join(', ') : ld?.employmentType,
          salary: v?.minValue || v?.maxValue ? salaryFrom(v.minValue, v.maxValue, ld.baseSalary.currency || 'EUR', periodFrom(v.unitText) ?? 'year') : job.salary,
          location: jsonLdLocation(ld) ? `${jsonLdLocation(ld)}${/remot/i.test(job.location ?? '') ? ' (Remoto)' : ''}` : job.location,
        };
      },
      { max: 60, concurrency: 1, delayMs: 1500 },
    );
    return { jobs, complete: false, warnings: pending ? [`${pending} descrições ficam para a próxima coleta`] : [] };
  },
};

// ---------------------------------------------------------------- Workable (busca global de vagas)

const WORKABLE_QUERIES = ['developer', 'software engineer', 'frontend', 'backend', 'full stack'];
const WORKABLE_LOCATIONS = ['Portugal', 'Brazil'];
const WK_MODE: Record<string, WorkMode> = { remote: 'remote', hybrid: 'hybrid', on_site: 'onsite' };

export const workablejobs: SourceDef = {
  id: 'workablejobs',
  name: 'Workable Jobs',
  homepage: 'https://jobs.workable.com/',
  focus: ['PT', 'BR'],
  description: 'Busca de vagas do Workable (milhares de startups e scale-ups) filtrada para Portugal e Brasil.',
  minIntervalMinutes: 3 * 60,
  async collect(ctx) {
    const byId = new Map<string, RawJob>();
    const days = Math.min(30, Math.ceil((Date.now() - ctx.since.getTime()) / 86_400_000));
    for (const location of WORKABLE_LOCATIONS) {
      for (const query of WORKABLE_QUERIES) {
        let token = '';
        for (let page = 0; page < 6; page++) {
          const url = `https://jobs.workable.com/api/v1/jobs?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&day_range=${days}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
          const data = await fetchJson(url, { signal: ctx.signal });
          for (const j of data.jobs ?? []) {
            if (byId.has(j.id)) continue;
            const loc = j.location ?? {};
            byId.set(j.id, {
              source: 'workablejobs',
              sourceId: j.id,
              url: j.url,
              title: j.title,
              company: j.company?.title,
              companyLogo: j.company?.image,
              location: joinLocation(loc.city, loc.subregion, loc.countryName),
              regionHint: location === 'Portugal' ? ['PT'] : ['BR'],
              workMode: WK_MODE[j.workplace],
              publishedAt: toIsoDate(j.created),
              description: `${j.description ?? ''}${j.requirementsSection ? `<h4>Requisitos</h4>${j.requirementsSection}` : ''}${j.benefitsSection ? `<h4>Benefícios</h4>${j.benefitsSection}` : ''}`,
              descriptionFormat: 'html',
              employmentType: j.employmentType || undefined,
              tags: [j.department].filter(Boolean),
            });
          }
          token = data.nextPageToken;
          if (!token || !(data.jobs ?? []).length) break;
          await sleep(500, ctx.signal);
        }
      }
    }
    return { jobs: [...byId.values()], complete: false };
  },
};

// ---------------------------------------------------------------- Net-Empregos

/** Categorias de TI do Net-Empregos: 5 = Informática (Programação), 38 = Análise de Sistemas. */
const NET_EMPREGOS_CATEGORIES = [5, 38];

export const netempregos: SourceDef = {
  id: 'netempregos',
  name: 'Net-Empregos',
  homepage: 'https://www.net-empregos.com/',
  focus: ['PT'],
  description: 'Portal de emprego generalista de Portugal; lemos só as categorias Informática (Programação) e Análise de Sistemas.',
  minIntervalMinutes: 3 * 60,
  async collect(ctx) {
    const byId = new Map<string, RawJob>();
    for (const cat of NET_EMPREGOS_CATEGORIES) {
      for (let page = 1; page <= 4; page++) {
        const html = await fetchText(
          `https://www.net-empregos.com/pesquisa-empregos.asp?page=${page}&categoria=${cat}&zona=0&tipo=0&chaves=`,
          { signal: ctx.signal, encoding: 'latin1' },
        );
        const $ = cheerio.load(html);
        const items = $('div.job-item').toArray();
        let oldest = Infinity;
        for (const el of items) {
          const c = $(el);
          const a = c.find('h2 a.oferta-link').first();
          const href = a.attr('href') ?? '';
          const id = href.match(/\/(\d{6,})\//)?.[1];
          if (!id || byId.has(id)) continue;
          const li = (icon: string) => cleanWhitespace(c.find(`li i.${icon}`).first().parent().text());
          const [d, m, y] = li('flaticon-calendar').split('-');
          const published = y ? toIsoDate(`${y}-${m}-${d}T12:00:00Z`) : undefined;
          if (published) oldest = Math.min(oldest, Date.parse(published));
          const title = cleanWhitespace(a.text());
          if (!title || !isDevJob(norm(title), false)) continue;
          byId.set(id, {
            source: 'netempregos',
            sourceId: id,
            url: new URL(href, 'https://www.net-empregos.com').toString(),
            title,
            company: li('flaticon-work'),
            companyLogo: c.find('img.net-img-logo').attr('src'),
            location: joinLocation(li('flaticon-pin'), 'Portugal'),
            regionHint: ['PT'],
            publishedAt: published,
            tags: [li('fa-tags')].filter(Boolean),
          });
        }
        if (items.length < 18 || oldest < ctx.since.getTime()) break;
        await sleep(1000, ctx.signal);
      }
    }
    const jobs = [...byId.values()];
    const pending = await fillDetails(
      ctx,
      jobs,
      async (job) => {
        const ld = findJsonLd(await fetchText(job.url, { signal: ctx.signal, encoding: 'latin1', retries: 1 }));
        if (!ld) return undefined;
        return {
          description: String(ld.description ?? ''),
          descriptionFormat: 'html',
          employmentType: ld.employmentType,
          location: jsonLdLocation(ld) || job.location,
        };
      },
      { max: 40, concurrency: 1, delayMs: 1000 },
    );
    return { jobs, complete: false, warnings: pending ? [`${pending} descrições ficam para a próxima coleta`] : [] };
  },
};
