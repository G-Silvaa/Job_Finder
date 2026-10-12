/**
 * APIs públicas de sistemas de recrutamento (ATS) usadas pelos sites de carreira das empresas.
 * São oficiais e abertas (feitas para embutir a lista de vagas no site da empresa).
 */
import { XMLParser } from 'fast-xml-parser';
import { classify } from '../classify/index.js';
import { isDevJob } from '../classify/relevance.js';
import { fetchJson, fetchJsonIfChanged, fetchText, mapLimit } from '../lib/http.js';
import { norm, toIsoDate } from '../lib/text.js';
import type { CollectContext, CollectResult, RawJob, Region, SourceDef, WorkMode } from '../types.js';
import { COMPANIES, type Ats, type Company } from './companies.js';
import { countryCode, joinLocation, periodFrom, salaryFrom } from './util.js';

/** Estado de uma coleta: quantas páginas de detalhe ainda podemos baixar e quantas ficaram para depois. */
interface Run {
  ctx: CollectContext;
  detailBudget: number;
  pending: number;
  /** ETags para gravar só se a coleta terminar bem. */
  etags: [string, string][];
}

type Fetcher = (c: Company, run: Run) => Promise<RawJob[]>;

const base = (c: Company, ats: Ats, id: string | number): Pick<RawJob, 'source' | 'sourceId' | 'company' | 'regionHint'> => ({
  source: ats,
  sourceId: `${c.slug}-${id}`,
  company: c.name,
  regionHint: c.regionHint,
});

/** Vaga de dev e em BR/PT/EUA/remoto? (a classificação completa roda depois, com a descrição) */
const relevant = (job: RawJob) => classify(job).ok;

/** Usa a descrição já salva; senão baixa o detalhe (respeitando o limite da coleta). */
async function withDetail(run: Run, jobs: RawJob[], fetchDetail: (job: RawJob) => Promise<Partial<RawJob> | undefined>, concurrency = 4) {
  await mapLimit(jobs, concurrency, async (job) => {
    const prev = run.ctx.previous.get(job.sourceId);
    if (prev?.description) {
      for (const [k, v] of Object.entries(prev)) {
        const cur = (job as any)[k];
        if (cur === undefined || cur === '' || (Array.isArray(cur) && !cur.length)) (job as any)[k] = v;
      }
      return;
    }
    if (run.detailBudget <= 0) {
      run.pending++;
      return;
    }
    run.detailBudget--;
    try {
      const extra = await fetchDetail(job);
      if (extra) for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '' && v !== null) (job as any)[k] = v;
    } catch (e) {
      if (run.ctx.signal.aborted) throw e;
    }
  });
}

// ---------------------------------------------------------------- Greenhouse

const GENERIC_LOCATION = /^(hybrid|distributed|in[\s-]office|remote|multiple locations?|various|flexible)$/i;

const greenhouse: Fetcher = async (c, run) => {
  const { ctx } = run;
  const api = `https://boards-api.greenhouse.io/v1/boards/${c.slug}`;
  // lista "leve" (sem descrição): a completa chega a 10 MB em empresas grandes
  const list = await fetchJson(`${api}/jobs`, { signal: ctx.signal, ua: 'bot' });
  const all: RawJob[] = (list.jobs ?? []).map(
    (j: any): RawJob => ({
      ...base(c, 'greenhouse', j.id),
      url: j.absolute_url,
      title: j.title,
      company: j.company_name || c.name,
      location: j.location?.name,
      publishedAt: toIsoDate(j.first_published ?? j.updated_at),
    }),
  );
  // alguns quadros só dizem "Hybrid"/"Distributed": as cidades estão na árvore de escritórios
  const devs = all.filter((j) => isDevJob(norm(j.title), false));
  if (devs.some((j) => GENERIC_LOCATION.test((j.location ?? '').trim()))) {
    try {
      const tree = await fetchJson(`${api}/offices`, { signal: ctx.signal, ua: 'bot' });
      const officesByJob = new Map<string, Set<string>>();
      const walk = (office: any) => {
        const name = typeof office.location === 'string' ? office.location : office.location?.name || office.name;
        for (const d of office.departments ?? []) {
          for (const j of d.jobs ?? []) {
            const k = `${c.slug}-${j.id}`;
            if (!officesByJob.has(k)) officesByJob.set(k, new Set());
            if (name) officesByJob.get(k)!.add(name);
          }
        }
        for (const child of office.offices ?? []) walk(child);
      };
      for (const o of tree.offices ?? []) walk(o);
      for (const j of devs) {
        const extra = officesByJob.get(j.sourceId);
        if (extra?.size && GENERIC_LOCATION.test((j.location ?? '').trim())) j.location = `${j.location} · ${[...extra].join(' · ')}`;
      }
    } catch (e) {
      if (ctx.signal.aborted) throw e;
    }
  }
  const keep = devs.filter(relevant);
  await withDetail(run, keep, async (job) => {
    const id = job.sourceId.slice(c.slug.length + 1);
    const d = await fetchJson(`${api}/jobs/${id}?pay_transparency=true`, { signal: ctx.signal, ua: 'bot', retries: 1 });
    const pay = (d.pay_input_ranges ?? [])[0];
    return {
      description: d.content,
      descriptionFormat: 'html',
      tags: (d.departments ?? []).map((x: any) => x.name).filter(Boolean),
      salary: pay ? salaryFrom(Number(pay.min_cents) / 100, Number(pay.max_cents) / 100, pay.currency_type, 'year') : undefined,
    };
  });
  return keep;
};

// ---------------------------------------------------------------- Lever

const LEVER_MODE: Record<string, WorkMode> = { remote: 'remote', hybrid: 'hybrid', 'on-site': 'onsite', onsite: 'onsite' };

const lever: Fetcher = async (c, { ctx }) => {
  const host = c.eu ? 'api.eu.lever.co' : 'api.lever.co';
  const data = await fetchJson<any[]>(`https://${host}/v0/postings/${c.slug}?mode=json`, { signal: ctx.signal, ua: 'bot' });
  return (Array.isArray(data) ? data : [])
    .map((j: any): RawJob => {
      const lists = (j.lists ?? []).map((l: any) => `<h4>${l.text ?? ''}</h4><ul>${l.content ?? ''}</ul>`).join('');
      const range = j.salaryRange;
      return {
        ...base(c, 'lever', j.id),
        url: j.hostedUrl,
        title: j.text,
        location: joinLocation(j.categories?.location, ...(j.categories?.allLocations ?? [])),
        countries: j.country ? [j.country] : undefined,
        workMode: LEVER_MODE[String(j.workplaceType ?? '').toLowerCase()],
        publishedAt: toIsoDate(j.createdAt),
        description: `${j.description ?? ''}${lists}${j.additional ?? ''}`,
        descriptionFormat: 'html',
        salary: range?.min || range?.max ? salaryFrom(range.min, range.max, range.currency, periodFrom(range.interval)) : undefined,
        employmentType: j.categories?.commitment,
        tags: [j.categories?.department, j.categories?.team].filter(Boolean),
      };
    })
    .filter(relevant);
};

// ---------------------------------------------------------------- Ashby

const ASHBY_MODE: Record<string, WorkMode> = { Remote: 'remote', Hybrid: 'hybrid', OnSite: 'onsite' };

const ashby: Fetcher = async (c, run) => {
  const { ctx } = run;
  // o Ashby não tem lista "leve" (a da OpenAI tem ~14 MB): usamos ETag para não baixar de novo o que não mudou
  const previous = [...ctx.previous.values()].filter((j) => j.sourceId.startsWith(`${c.slug}-`));
  const etagKey = `etag:${c.slug}`;
  const res = await fetchJsonIfChanged(
    `https://api.ashbyhq.com/posting-api/job-board/${c.slug}?includeCompensation=true`,
    previous.length ? ctx.cache.get(etagKey) : undefined,
    { signal: ctx.signal, ua: 'bot', timeoutMs: 60_000 },
  );
  if (res.notModified) return previous;
  if (res.etag) run.etags.push([etagKey, res.etag]);
  return (res.data.jobs ?? [])
    .filter((j: any) => j.isListed !== false)
    .map((j: any): RawJob => {
      const comp = (j.compensation?.summaryComponents ?? []).find((s: any) => s.compensationType === 'Salary' && (s.minValue || s.maxValue));
      const secondary = j.secondaryLocations ?? [];
      return {
        ...base(c, 'ashby', j.id),
        url: j.jobUrl,
        title: j.title,
        location: joinLocation(j.location, ...secondary.map((s: any) => s.location)),
        countries: [j.address?.postalAddress?.addressCountry, ...secondary.map((s: any) => s.address?.postalAddress?.addressCountry)]
          .map(countryCode)
          .filter((x): x is string => !!x),
        // isRemote também vem true em vagas híbridas: o workplaceType é o que vale
        workMode: ASHBY_MODE[j.workplaceType],
        publishedAt: toIsoDate(j.publishedAt),
        description: j.descriptionHtml,
        descriptionFormat: 'html',
        salary: comp
          ? salaryFrom(comp.minValue, comp.maxValue, comp.currencyCode, periodFrom(comp.interval))
          : j.compensation?.compensationTierSummary
            ? { text: j.compensation.compensationTierSummary }
            : undefined,
        employmentType: j.employmentType,
        tags: [j.department, j.team].filter(Boolean),
      };
    })
    .filter(relevant);
};

// ---------------------------------------------------------------- SmartRecruiters

const smartrecruiters: Fetcher = async (c, run) => {
  const { ctx } = run;
  const all: any[] = [];
  const extra = c.query ? `&${c.query}` : '';
  for (let offset = 0; offset < 2000; offset += 100) {
    const page = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100&offset=${offset}${extra}`, {
      signal: ctx.signal,
      ua: 'bot',
    });
    all.push(...(page.content ?? []));
    if (offset + 100 >= (page.totalFound ?? 0)) break;
  }
  // o mesmo anúncio pode aparecer uma vez por cidade (mesmo refNumber)
  const seen = new Set<string>();
  const jobs = all
    .filter((p) => {
      const k = p.refNumber || p.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((p): RawJob => {
      const loc = p.location ?? {};
      return {
        ...base(c, 'smartrecruiters', p.id),
        url: `https://jobs.smartrecruiters.com/${c.slug}/${p.id}`,
        title: p.name,
        company: c.name,
        location: loc.fullLocation || joinLocation(loc.city, loc.region, loc.country?.toUpperCase()),
        countries: loc.country ? [String(loc.country).toUpperCase()] : undefined,
        workMode: loc.remote ? 'remote' : loc.hybrid ? 'hybrid' : undefined,
        publishedAt: toIsoDate(p.releasedDate),
        employmentType: p.typeOfEmployment?.label,
        tags: [p.department?.label, p.function?.label, p.experienceLevel?.label].filter(Boolean),
      };
    })
    .filter(relevant);
  await withDetail(
    run,
    jobs,
    async (job) => {
      const id = job.sourceId.slice(c.slug.length + 1);
      const d = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings/${id}`, { signal: ctx.signal, ua: 'bot', retries: 1 });
      const s = d.jobAd?.sections ?? {};
      return {
        description: ['jobDescription', 'qualifications', 'additionalInformation', 'companyDescription']
          .map((k) => (s[k]?.text ? `<h4>${s[k].title ?? ''}</h4>${s[k].text}` : ''))
          .join(''),
        descriptionFormat: 'html',
        url: d.postingUrl || job.url,
      };
    },
    3,
  );
  return jobs;
};

// ---------------------------------------------------------------- Workable (widget com detalhes)

const workable: Fetcher = async (c, { ctx }) => {
  const data = await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${c.slug}?details=true`, { signal: ctx.signal, ua: 'bot' });
  // o widget repete a vaga uma vez por cidade: juntamos pelo shortcode
  const byCode = new Map<string, RawJob>();
  for (const j of data.jobs ?? []) {
    const locs: any[] = j.locations?.length ? j.locations : [{ city: j.city, region: j.state, country: j.country }];
    const location = joinLocation(...locs.map((l) => joinLocation(l.city, l.region, l.country)));
    const prev = byCode.get(j.shortcode);
    if (prev) {
      prev.location = joinLocation(prev.location, location);
      prev.countries = [...new Set([...(prev.countries ?? []), ...locs.map((l) => l.countryCode).filter(Boolean)])];
      continue;
    }
    byCode.set(j.shortcode, {
      ...base(c, 'workable', j.shortcode),
      url: `https://apply.workable.com/${c.slug}/j/${j.shortcode}/`,
      title: j.title,
      location,
      countries: locs.map((l) => l.countryCode ?? countryCode(l.country)).filter(Boolean),
      workMode: j.telecommuting ? 'remote' : undefined,
      publishedAt: toIsoDate(j.published_on ?? j.created_at),
      description: j.description,
      descriptionFormat: 'html',
      employmentType: j.employment_type || undefined,
      tags: [j.department, j.function].filter(Boolean),
    });
  }
  return [...byCode.values()].filter(relevant);
};

// ---------------------------------------------------------------- Recruitee

const recruitee: Fetcher = async (c, { ctx }) => {
  const data = await fetchJson(`https://${c.slug}.recruitee.com/api/offers/`, { signal: ctx.signal, ua: 'bot' });
  return (data.offers ?? [])
    .map(
      (o: any): RawJob => ({
        ...base(c, 'recruitee', o.id),
        url: o.careers_url,
        title: o.title,
        company: o.company_name || c.name,
        location: o.location || joinLocation(o.city, o.country),
        countries: o.country_code ? [o.country_code] : undefined,
        workMode: o.remote ? 'remote' : o.hybrid ? 'hybrid' : o.on_site ? 'onsite' : undefined,
        publishedAt: toIsoDate(String(o.published_at ?? o.created_at ?? '').replace(' UTC', 'Z').replace(' ', 'T')),
        description: `${o.description ?? ''}${o.requirements ? `<h4>Requisitos</h4>${o.requirements}` : ''}`,
        descriptionFormat: 'html',
        salary: o.salary?.min || o.salary?.max ? salaryFrom(o.salary.min, o.salary.max, o.salary.currency, periodFrom(o.salary.period)) : undefined,
        employmentType: o.employment_type_code,
        tags: [o.department].filter(Boolean),
      }),
    )
    .filter(relevant);
};

// ---------------------------------------------------------------- Teamtailor (RSS público)

const ttXml = new XMLParser({ ignoreAttributes: true, trimValues: true });
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

const teamtailor: Fetcher = async (c, { ctx }) => {
  const doc = ttXml.parse(await fetchText(`https://${c.slug}/jobs.rss`, { signal: ctx.signal, ua: 'bot' }));
  return arr<any>(doc?.rss?.channel?.item)
    .map((it): RawJob => {
      const locs = arr<any>(it['tt:locations']?.['tt:location']);
      const remote = String(it.remoteStatus ?? '').toLowerCase();
      return {
        ...base(c, 'teamtailor', it.guid || it.link),
        url: it.link,
        title: String(it.title ?? ''),
        location: joinLocation(...locs.map((l) => joinLocation(l['tt:city'] || l['tt:name'], l['tt:country']))),
        countries: locs.map((l) => countryCode(l['tt:country'])).filter((x): x is string => !!x),
        workMode: remote === 'fully' || remote === 'remote' ? 'remote' : remote === 'hybrid' ? 'hybrid' : undefined,
        publishedAt: toIsoDate(it.pubDate),
        description: String(it.description ?? ''),
        descriptionFormat: 'html',
        tags: [it['tt:department']].filter(Boolean),
      };
    })
    .filter(relevant);
};

// ---------------------------------------------------------------- Gem

const GEM_MODE: Record<string, WorkMode> = { remote: 'remote', hybrid: 'hybrid', onsite: 'onsite', in_office: 'onsite' };

const gem: Fetcher = async (c, { ctx }) => {
  const data = await fetchJson<any>(`https://api.gem.com/job_board/v0/${c.slug}/job_posts/`, { signal: ctx.signal, ua: 'bot' });
  const posts: any[] = Array.isArray(data) ? data : (data.job_posts ?? data.jobs ?? []);
  return posts
    .map(
      (j): RawJob => ({
        ...base(c, 'gem', j.id),
        url: j.absolute_url,
        title: j.title,
        location: joinLocation(j.location?.name, ...(j.offices ?? []).map((o: any) => o.location?.name)),
        workMode: GEM_MODE[j.location_type],
        publishedAt: toIsoDate(j.first_published_at ?? j.updated_at),
        description: j.content,
        descriptionFormat: 'html',
        employmentType: j.employment_type?.replace(/_/g, ' '),
        tags: (j.departments ?? []).map((d: any) => d.name).filter(Boolean),
      }),
    )
    .filter(relevant);
};

// ---------------------------------------------------------------- fontes

const FETCHERS: Record<Ats, Fetcher> = { greenhouse, lever, ashby, smartrecruiters, workable, recruitee, teamtailor, gem };

const ATS_INFO: Record<Ats, { name: string; homepage: string; interval: number; details: number }> = {
  greenhouse: { name: 'Greenhouse', homepage: 'https://www.greenhouse.com/', interval: 180, details: 2500 },
  ashby: { name: 'Ashby', homepage: 'https://www.ashbyhq.com/', interval: 360, details: 0 },
  lever: { name: 'Lever', homepage: 'https://www.lever.co/', interval: 180, details: 0 },
  smartrecruiters: { name: 'SmartRecruiters', homepage: 'https://www.smartrecruiters.com/', interval: 360, details: 150 },
  workable: { name: 'Workable', homepage: 'https://www.workable.com/', interval: 360, details: 0 },
  recruitee: { name: 'Recruitee', homepage: 'https://recruitee.com/', interval: 360, details: 0 },
  teamtailor: { name: 'Teamtailor', homepage: 'https://www.teamtailor.com/', interval: 360, details: 0 },
  gem: { name: 'Gem', homepage: 'https://www.gem.com/', interval: 360, details: 0 },
};

function atsSource(ats: Ats): SourceDef | null {
  const companies = COMPANIES.filter((c) => c.ats === ats);
  if (!companies.length) return null;
  const focus = [...new Set(companies.flatMap((c) => c.regionHint ?? (['US', 'WORLDWIDE'] as Region[])))];
  const names = companies.map((c) => c.name);
  const info = ATS_INFO[ats];
  return {
    id: ats,
    name: `Site da empresa (${info.name})`,
    kind: 'company',
    homepage: info.homepage,
    focus,
    description: `Vagas direto do site de carreira de ${companies.length} ${companies.length === 1 ? 'empresa' : 'empresas'}: ${names.slice(0, 8).join(', ')}${names.length > 8 ? '…' : ''}. A lista fica em server/src/sources/companies.ts.`,
    minIntervalMinutes: info.interval,
    // o site de carreira só lista vagas abertas: uma vaga de meses atrás ainda está valendo
    maxAgeDays: 365,
    async collect(ctx): Promise<CollectResult> {
      const run: Run = { ctx, detailBudget: info.details, pending: 0, etags: [] };
      const warnings: string[] = [];
      const results = await mapLimit(companies, 4, async (c) => {
        try {
          return await FETCHERS[ats](c, run);
        } catch (e) {
          if (ctx.signal.aborted) throw e;
          warnings.push(`${c.name}: ${(e as Error).message.slice(0, 140)}`);
          return [];
        }
      });
      for (const [k, v] of run.etags) ctx.cache.set(k, v);
      if (run.pending) warnings.push(`${run.pending} descrições ficam para a próxima coleta`);
      // se alguma empresa falhou não dá para saber quais vagas fecharam
      return { jobs: results.flat(), complete: warnings.every((w) => w.includes('próxima coleta')), warnings };
    },
  };
}

export const ATS_SOURCES: SourceDef[] = (Object.keys(FETCHERS) as Ats[]).map(atsSource).filter((s): s is SourceDef => !!s);
