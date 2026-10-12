/** Fontes brasileiras. */
import * as cheerio from 'cheerio';
import { isDevJob } from '../classify/relevance.js';
import { fetchJson, fetchText, mapLimit, sleep } from '../lib/http.js';
import { findJsonLd, jsonLdLocation } from '../lib/jsonld.js';
import { cleanWhitespace, decodeEntities, norm, toIsoDate } from '../lib/text.js';
import type { CollectContext, RawJob, Seniority, SourceDef, WorkMode } from '../types.js';
import { joinLocation, periodFrom, salaryFrom } from './util.js';

/**
 * Busca a descrição (página de detalhe) só das vagas novas: as que já estão no banco reaproveitam
 * a descrição salva. `max` limita quantas páginas baixar por coleta, para não sobrecarregar o site.
 */
async function withDetails(
  ctx: CollectContext,
  jobs: RawJob[],
  fetchDetail: (job: RawJob) => Promise<Partial<RawJob> | undefined>,
  opts: { max: number; concurrency?: number; delayMs?: number },
): Promise<{ jobs: RawJob[]; pending: number }> {
  let budget = opts.max;
  let pending = 0;
  await mapLimit(jobs, opts.concurrency ?? 2, async (job) => {
    const prev = ctx.previous.get(job.sourceId);
    if (prev?.description) {
      // completa com o que já foi lido da página de detalhe antes
      for (const [k, v] of Object.entries(prev)) {
        const cur = (job as any)[k];
        if (cur === undefined || cur === '' || (Array.isArray(cur) && !cur.length)) (job as any)[k] = v;
      }
      return;
    }
    if (budget <= 0) {
      pending++;
      return;
    }
    budget--;
    try {
      const extra = await fetchDetail(job);
      if (extra) for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '' && v !== null) (job as any)[k] = v;
    } catch (e) {
      if (ctx.signal.aborted) throw e;
    }
    await sleep(opts.delayMs ?? 300, ctx.signal);
  });
  return { jobs, pending };
}

// ---------------------------------------------------------------- Gupy

const GUPY_QUERIES = [
  'desenvolvedor',
  'developer',
  'programador',
  'software',
  'engineer',
  'engenheiro de software',
  'fullstack',
  'full stack',
  'frontend',
  'front-end',
  'backend',
  'back-end',
  'analista desenvolvedor',
  'mobile',
  'devops',
  'dev',
  'java',
  'react',
  'python',
  '.net',
  'node',
  'IA',
  'inteligência artificial',
  'engenheiro de dados',
  'qa',
  'sre',
];

const GUPY_TYPES: Record<string, string> = {
  vacancy_type_effective: 'CLT',
  vacancy_legal_entity: 'PJ',
  vacancy_type_internship: 'Estágio',
  vacancy_type_trainee: 'Trainee',
  vacancy_type_temporary: 'Temporário',
  vacancy_type_freelancer: 'Freelancer',
  vacancy_type_autonomous: 'Autônomo',
  vacancy_type_associate: 'Associado',
  vacancy_type_outsource: 'Terceirizado',
  vacancy_type_intermittent: 'Intermitente',
};
const GUPY_SKIP = new Set(['vacancy_type_talent_pool', 'vacancy_type_volunteer', 'vacancy_type_apprentice', 'vacancy_type_lecturer', 'vacancy_type_summer']);
const GUPY_MODE: Record<string, WorkMode> = { remote: 'remote', hybrid: 'hybrid', 'on-site': 'onsite' };

export const gupy: SourceDef = {
  id: 'gupy',
  name: 'Gupy',
  homepage: 'https://portal.gupy.io/',
  focus: ['BR'],
  description: 'Maior plataforma de recrutamento do Brasil (milhares de empresas). Buscamos ~25 termos de tecnologia no portal público.',
  minIntervalMinutes: 60,
  maxAgeDays: 180,
  async collect(ctx) {
    const byId = new Map<number, any>();
    const warnings: string[] = [];
    await mapLimit(GUPY_QUERIES, 3, async (q) => {
      try {
        for (let offset = 0; offset < 1000; offset += 100) {
          const url = `https://portal.gupy.io/api/job-search/jobs?jobName=${encodeURIComponent(q)}&limit=100&offset=${offset}&sortBy=publishedDate&sortOrder=desc`;
          const data = await fetchJson(url, { signal: ctx.signal, ua: 'bot' });
          const items: any[] = data.data ?? [];
          for (const j of items) byId.set(j.id, j);
          const last = items[items.length - 1];
          if (items.length < 100 || (last?.publishedDate && Date.parse(last.publishedDate) < ctx.since.getTime())) break;
          await sleep(250, ctx.signal);
        }
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        warnings.push(`busca "${q}": ${(e as Error).message.slice(0, 100)}`);
      }
    });
    const jobs: RawJob[] = [];
    for (const j of byId.values()) {
      if (GUPY_SKIP.has(j.type)) continue;
      const type = GUPY_TYPES[j.type];
      jobs.push({
        source: 'gupy',
        sourceId: String(j.id),
        url: j.jobUrl,
        title: String(j.name ?? '').trim(),
        company: /confidencial/i.test(j.careerPageName ?? '') ? 'Empresa confidencial' : j.careerPageName,
        companyLogo: j.careerPageLogo || undefined,
        location: joinLocation(j.city, j.state),
        regionHint: ['BR'],
        workMode: GUPY_MODE[j.workplaceType],
        publishedAt: toIsoDate(j.publishedDate),
        description: decodeEntities(String(j.description ?? '')),
        descriptionFormat: 'text',
        employmentType: type,
        seniority: j.type === 'vacancy_type_internship' || j.type === 'vacancy_type_trainee' ? 'intern' : undefined,
        tags: [type, j.disabilities ? 'Vaga afirmativa / PcD' : ''].filter(Boolean) as string[],
      });
    }
    return { jobs, complete: warnings.length === 0, warnings };
  },
};

// ---------------------------------------------------------------- GitHub (repositórios de vagas)

/** Repositórios ativos das comunidades brasileiras (cada issue é uma vaga). */
export const GITHUB_REPOS = [
  'backend-br/vagas',
  'frontendbr/vagas',
  'programadores-br/geral',
  'soujava/vagas-java',
  'react-brasil/vagas',
  'DevOps-Brasil/Vagas',
  'qa-brasil/vagas',
  'datascience-br/vagas',
  'dotnetdevbr/vagas',
  'nodejsdevbr/vagas',
  'pydevbr/vagas',
  'androiddevbr/vagas',
  'vuejs-br/vagas',
  'CocoaHeadsBrasil/vagas',
  'phpdevbr/vagas',
  'flutterbr/vagas',
];

const LOCATION_WORD =
  /remot|h[ií]brid|presencial|alocad|home.?office|exterior|brasil|brazil|[a-zà-ú]\s*[/-]\s?(?:SP|RJ|MG|PR|SC|RS|BA|PE|CE|GO|DF|ES|AM|PA|MA|MT|MS|PB|RN|AL|PI|SE|RO|TO|AC|AP|RR)\b|\b(?:SP|RJ|MG|PR|SC|RS|BA|PE|CE|GO|DF|ES|AM|PA|MA|MT|MS|PB|RN|AL|PI|SE|RO|TO|AC|AP|RR)\b|s[ãa]o paulo|rio de janeiro|curitiba|belo horizonte|porto alegre|florian[óo]polis|recife|campinas|bras[ií]lia|fortaleza|salvador|goi[âa]nia|joinville|blumenau/i;
const CONTRACT_LABEL = /^(clt|pj|freela|freelance|freelancer|contrato|cooperado|est[áa]gio|tempor[áa]rio|full time|part time)$/i;
const IGNORE_LABEL = /stale|aviso|pendente|falta de informa|duplicad|spam/i;

export function parseIssueTitle(raw: string) {
  let title = raw.trim();
  const brackets: string[] = [];
  for (;;) {
    const m = title.match(/^\s*[[(]([^\])]{1,70})[\])]\s*[-–|:]?\s*/);
    if (!m) break;
    brackets.push(m[1].trim());
    title = title.slice(m[0].length);
  }
  for (;;) {
    const m = title.match(/\s*[-–|]?\s*[[(]([^\])]{1,70})[\])]\s*$/);
    if (!m || m.index === 0) break;
    brackets.push(m[1].trim());
    title = title.slice(0, m.index);
  }
  let company = '';
  const at = title.match(/\s+@\s*([^@[\]()]{2,60})$/);
  if (at) {
    company = at[1].trim();
    title = title.slice(0, at.index).trim();
  }
  const parts = brackets.flatMap((b) => b.split(/\s*[|,]\s*/)).filter(Boolean);
  return {
    title: title.replace(/\s*[-–|]\s*$/, '').trim() || raw.trim(),
    company,
    location: parts.filter((p) => LOCATION_WORD.test(p)),
    other: parts.filter((p) => !LOCATION_WORD.test(p)),
  };
}

function bodyField(body: string, ...names: string[]): string | undefined {
  for (const n of names) {
    const m = body.match(new RegExp(`^#{2,4}\\s*(?:\\S+\\s+)?${n}\\s*\\n+([^\\n#][^\\n]{0,120})`, 'mi'));
    const v = m?.[1]?.trim();
    if (v && !/no response|_no_|n\/a/i.test(v)) return v.replace(/^[-*]\s*/, '');
  }
  return undefined;
}

export const github: SourceDef = {
  id: 'github',
  name: 'GitHub · comunidades BR',
  homepage: 'https://github.com/frontendbr/vagas',
  focus: ['BR'],
  description: `Issues dos repositórios de vagas das comunidades (${GITHUB_REPOS.length} repos: backend-br, frontendbr, react-brasil, soujava, DevOps-Brasil…). Com GITHUB_TOKEN o limite da API sobe.`,
  minIntervalMinutes: 30,
  async collect(ctx) {
    const since = ctx.since.toISOString().slice(0, 10);
    const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const items: any[] = [];
    // a busca aceita vários repositórios por consulta; dividimos em dois grupos por segurança
    const groups = [GITHUB_REPOS.slice(0, 8), GITHUB_REPOS.slice(8)];
    let complete = true;
    for (const group of groups) {
      const q = `is:issue is:open created:>=${since} ${group.map((r) => `repo:${r}`).join(' ')}`;
      for (let page = 1; page <= 10; page++) {
        const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=100&page=${page}`;
        const data = await fetchJson(url, { signal: ctx.signal, ua: 'bot', headers });
        if (data.incomplete_results) complete = false;
        items.push(...(data.items ?? []));
        if ((data.items ?? []).length < 100 || page * 100 >= (data.total_count ?? 0)) break;
        await sleep(2500, ctx.signal);
      }
      await sleep(1500, ctx.signal);
    }

    const jobs: RawJob[] = [];
    for (const it of items) {
      if (it.pull_request) continue;
      const labels: string[] = (it.labels ?? []).map((l: any) => String(l.name ?? '').trim()).filter(Boolean);
      if (labels.some((l) => /aviso|regras/i.test(l)) || /^\s*(regras|leia|aviso|como (postar|divulgar))/i.test(it.title)) continue;
      const repo = String(it.repository_url ?? '').split('/repos/')[1] ?? '';
      const t = parseIssueTitle(it.title);
      const body = String(it.body ?? '').replace(/<!--[\s\S]*?-->/g, '');
      const cleanLabels = labels.map((l) => l.replace(/^[^\p{L}\p{N}.#+]+/u, '').trim()).filter((l) => l && !IGNORE_LABEL.test(l));
      const salaryText =
        bodyField(body, 'Faixa salarial', 'Salário', 'Remuneração') ??
        body.match(/(?:sal[áa]rio|remunera[çc][ãa]o|faixa salarial)\s*[:\-–]\s*([^\n]{3,80})/i)?.[1]?.trim();
      jobs.push({
        source: 'github',
        sourceId: `${repo}#${it.number}`,
        url: it.html_url,
        title: t.title,
        company: t.company || bodyField(body, 'Empresa', 'Nome da empresa'),
        location: [...t.location, ...cleanLabels.filter((l) => LOCATION_WORD.test(l)), bodyField(body, 'Localização', 'Local')]
          .filter(Boolean)
          .join(' · '),
        regionHint: ['BR'],
        publishedAt: toIsoDate(it.created_at),
        description: body,
        descriptionFormat: 'markdown',
        salary: salaryText && /\d/.test(salaryText) ? { text: salaryText } : undefined,
        employmentType: cleanLabels.filter((l) => CONTRACT_LABEL.test(l)).join(', ') || undefined,
        tags: [...cleanLabels, ...t.other, repo],
        trustedDev: true,
      });
    }
    return { jobs, complete };
  },
};

// ---------------------------------------------------------------- Remotar

const REMOTAR_MODE: Record<string, WorkMode> = { remote: 'remote', hybrid: 'hybrid', onsite: 'onsite', 'on-site': 'onsite' };

export const remotar: SourceDef = {
  id: 'remotar',
  name: 'Remotar',
  homepage: 'https://remotar.com.br/',
  focus: ['BR', 'WORLDWIDE'],
  description: 'Vagas remotas e híbridas para quem mora no Brasil, inclusive de empresas de fora (categorias Programação, Mobile, DevOps, QA e Dados).',
  minIntervalMinutes: 60,
  async collect(ctx) {
    const jobs: RawJob[] = [];
    let complete = false;
    for (let page = 1; page <= 40; page++) {
      const data = await fetchJson(`https://api.remotar.com.br/jobs?categoryId=13,14,7,8,4&active=true&page=${page}`, {
        signal: ctx.signal,
        ua: 'bot',
      });
      const items: any[] = data.data ?? [];
      for (const j of items) {
        // Gupy já é coletada direto
        if (j.expired || j.integrationSource === 'gupy') continue;
        const sal = j.jobSalary;
        const hasSalary = sal && sal.type !== 'uninformed' && (Number(sal.from) > 0 || Number(sal.to) > 0);
        jobs.push({
          source: 'remotar',
          sourceId: String(j.id),
          url: `https://remotar.com.br/job/${j.id}`,
          title: j.title,
          company: j.companyDisplayName || j.company?.name,
          companyLogo: j.company?.companyProfilePicture?.url,
          location: joinLocation(j.city, j.state, j.country?.name),
          regionHint: ['BR'],
          workMode: REMOTAR_MODE[j.type],
          publishedAt: toIsoDate(j.createdAt),
          description: j.description,
          descriptionFormat: 'html',
          salary: hasSalary ? salaryFrom(sal.from, sal.to, sal.currency || 'BRL', periodFrom(sal.type) ?? 'month') : undefined,
          tags: [
            ...(j.jobTags ?? []).map((t: any) => t.tag?.name),
            ...(j.jobCategories ?? []).map((c: any) => c.category?.name),
          ].filter(Boolean),
        });
      }
      const last = items[items.length - 1];
      if (!items.length || page >= (data.meta?.last_page ?? 1)) {
        complete = true;
        break;
      }
      // a lista vem por data de atualização: parou de ter coisa recente, para
      if (last?.updatedAt && Date.parse(last.updatedAt) < ctx.since.getTime()) {
        complete = true;
        break;
      }
      await sleep(400, ctx.signal);
    }
    return { jobs, complete };
  },
};

// ---------------------------------------------------------------- Programathor

const LEVEL_MAP: Record<string, Seniority> = { junior: 'junior', pleno: 'mid', senior: 'senior', estagio: 'intern', especialista: 'lead' };

export const programathor: SourceDef = {
  id: 'programathor',
  name: 'ProgramaThor',
  homepage: 'https://programathor.com.br/jobs',
  focus: ['BR'],
  description: 'Quadro brasileiro só de vagas de programação, com nível, contrato e faixa salarial.',
  minIntervalMinutes: 120,
  maxAgeDays: 365,
  async collect(ctx) {
    const cards: RawJob[] = [];
    let reachedExpired = false;
    for (let page = 1; page <= 6 && !reachedExpired; page++) {
      const html = await fetchText(`https://programathor.com.br/jobs/page/${page}`, { signal: ctx.signal });
      const $ = cheerio.load(html);
      $('div.cell-list').each((_, el) => {
        const c = $(el);
        if (c.hasClass('min-height-180')) return; // anúncio
        if (c.hasClass('opacity-60p')) {
          reachedExpired = true; // daqui em diante só vagas vencidas
          return;
        }
        const href = c.find('a[href^="/jobs/"]').first().attr('href') ?? '';
        const id = href.match(/^\/jobs\/(\d+)/)?.[1];
        if (!id) return;
        const span = (icon: string) => cleanWhitespace(c.find(`i.${icon}`).first().parent().text());
        const level = span('fa-chart-bar');
        const salary = span('fa-money-bill-alt');
        cards.push({
          source: 'programathor',
          sourceId: id,
          url: `https://programathor.com.br${href}`,
          title: cleanWhitespace(c.find('h3').first().text()).replace(/\s*Vencida\s*$/i, ''),
          company: span('fa-briefcase'),
          companyLogo: c.find('.cell-logo img').attr('src'),
          location: span('fa-map-marker-alt'),
          regionHint: ['BR'],
          seniority: LEVEL_MAP[norm(level)],
          employmentType: span('fa-file-alt') || undefined,
          salary: salary ? { text: salary } : undefined,
          tags: c
            .find('span.tag-list')
            .map((_, t) => cleanWhitespace($(t).text()))
            .get()
            .filter(Boolean),
          trustedDev: true,
        });
      });
      await sleep(500, ctx.signal);
    }
    const { jobs, pending } = await withDetails(
      ctx,
      cards,
      async (job) => {
        const html = await fetchText(job.url, { signal: ctx.signal, retries: 0 });
        const ld = findJsonLd(html);
        const $ = cheerio.load(html);
        const desc = ld?.description || $('div.line-height-2-4').first().html() || '';
        const value = ld?.baseSalary?.value;
        return {
          description: desc,
          descriptionFormat: 'html',
          publishedAt: toIsoDate(ld?.datePosted),
          salary:
            value?.value || value?.minValue
              ? salaryFrom(value.minValue ?? value.value, value.maxValue, ld.baseSalary.currency || 'BRL', periodFrom(value.unitText) ?? 'month')
              : undefined,
        };
      },
      { max: 60, concurrency: 2, delayMs: 500 },
    );
    return { jobs, complete: reachedExpired, warnings: pending ? [`${pending} descrições ficam para a próxima coleta`] : [] };
  },
};

// ---------------------------------------------------------------- Nerdin

export const nerdin: SourceDef = {
  id: 'nerdin',
  name: 'Nerdin',
  homepage: 'https://www.nerdin.com.br/vagas.php',
  focus: ['BR'],
  description: 'Quadro brasileiro de vagas de TI (desenvolvimento, dados, infraestrutura…). Ficam só as de desenvolvimento.',
  minIntervalMinutes: 120,
  async collect(ctx) {
    const cards: RawJob[] = [];
    let complete = false;
    for (let page = 1; page <= 45; page++) {
      const html = await fetchText(`https://www.nerdin.com.br/vagas.php?pagina=${page}`, { signal: ctx.signal });
      const $ = cheerio.load(html);
      const els = $('div.vaga-card').toArray();
      if (!els.length) {
        complete = true;
        break;
      }
      let oldest = Infinity;
      for (const el of els) {
        const c = $(el);
        const href = c.attr('data-href') ?? '';
        const id = href.match(/-(\d+)\.php$/)?.[1];
        const titleEl = c.find('h3.vaga-titulo').first().clone();
        titleEl.children().remove();
        const title = cleanWhitespace(titleEl.text()).replace(/\s*Nova$/i, '');
        const date = c.find('p.vaga-meta-extra time').attr('datetime');
        if (date) oldest = Math.min(oldest, Date.parse(date));
        if (!id || !title || !isDevJob(norm(title), false)) continue;
        const [level, mode] = cleanWhitespace(c.find('p.vaga-resumo-linha').first().text()).split(/\s*•\s*/);
        const salary = cleanWhitespace(c.find('.vaga-salario-destaque span').first().text());
        cards.push({
          source: 'nerdin',
          sourceId: id,
          url: new URL(href, 'https://www.nerdin.com.br/').toString(),
          title,
          company: cleanWhitespace(c.find('.vaga-empresa-nome').first().text()),
          location: [cleanWhitespace(c.find('.vaga-local-linha span').first().text()).replace(/\s*•\s*/g, ', '), mode]
            .filter(Boolean)
            .join(' · '),
          regionHint: ['BR'],
          publishedAt: toIsoDate(date),
          salary: salary && !/combinar/i.test(salary) ? { text: salary } : undefined,
          tags: [
            level,
            ...c
              .find('.vaga-hashtags a.hashtag')
              .map((_, t) => $(t).text().replace(/^#/, '').trim())
              .get(),
          ].filter(Boolean),
        });
      }
      if (oldest < ctx.since.getTime()) {
        complete = true;
        break;
      }
      await sleep(600, ctx.signal);
    }
    const { jobs, pending } = await withDetails(
      ctx,
      cards,
      async (job) => {
        const ld = findJsonLd(await fetchText(job.url, { signal: ctx.signal, retries: 1 }));
        if (!ld) return undefined;
        return {
          description: ld.description,
          descriptionFormat: /<\w+[^>]*>/.test(ld.description ?? '') ? 'html' : 'text',
          employmentType: Array.isArray(ld.employmentType) ? ld.employmentType.join(', ') : ld.employmentType,
          company: ld.hiringOrganization?.name,
          companyLogo: ld.hiringOrganization?.logo?.url ?? ld.hiringOrganization?.logo,
        };
      },
      { max: 150, concurrency: 2, delayMs: 400 },
    );
    return { jobs, complete, warnings: pending ? [`${pending} descrições ficam para a próxima coleta`] : [] };
  },
};

// ---------------------------------------------------------------- GeekHunter

export const geekhunter: SourceDef = {
  id: 'geekhunter',
  name: 'GeekHunter',
  homepage: 'https://www.geekhunter.com/pt/vagas',
  focus: ['BR'],
  description: 'Plataforma de recrutamento tech brasileira. Descrição completa lida da página de cada vaga.',
  minIntervalMinutes: 6 * 60,
  async collect(ctx) {
    const seen = new Map<string, { url: string; name: string }>();
    for (let page = 1; page <= 15; page++) {
      const html = await fetchText(`https://www.geekhunter.com/pt/vagas?page=${page}`, { signal: ctx.signal });
      const list = findJsonLd(html, 'ItemList');
      const els: any[] = list?.itemListElement ?? [];
      if (!els.length) break;
      for (const e of els) {
        const url = e.url ?? e.item?.url;
        const name = e.name ?? e.item?.name;
        if (url && name) seen.set(url, { url, name });
      }
      await sleep(700, ctx.signal);
    }
    const cards: RawJob[] = [...seen.values()]
      .filter((e) => isDevJob(norm(e.name), false))
      .map((e) => ({
        source: 'geekhunter',
        sourceId: e.url.replace(/^https?:\/\/[^/]+\/pt\//, ''),
        url: e.url,
        title: e.name,
        regionHint: ['BR'],
      }));
    const { jobs, pending } = await withDetails(
      ctx,
      cards,
      async (job) => {
        const ld = findJsonLd(await fetchText(job.url, { signal: ctx.signal, retries: 1 }));
        if (!ld) return undefined;
        return {
          title: ld.title || job.title,
          description: ld.description,
          descriptionFormat: 'html',
          publishedAt: toIsoDate(ld.datePosted),
          company: ld.hiringOrganization?.name,
          companyLogo: typeof ld.hiringOrganization?.logo === 'string' ? ld.hiringOrganization.logo : ld.hiringOrganization?.logo?.url,
          location: jsonLdLocation(ld) || (ld.jobLocationType === 'TELECOMMUTE' ? 'Remoto' : undefined),
          workMode: ld.jobLocationType === 'TELECOMMUTE' ? 'remote' : undefined,
          employmentType: Array.isArray(ld.employmentType) ? ld.employmentType.join(', ') : ld.employmentType,
          tags: Array.isArray(ld.skills) ? ld.skills : typeof ld.skills === 'string' ? ld.skills.split(/\s*,\s*/) : undefined,
        };
      },
      { max: 80, concurrency: 2, delayMs: 700 },
    );
    // vagas sem detalhe ainda não têm data: ficam de fora até a próxima coleta
    return {
      jobs: jobs.filter((j) => j.description),
      complete: false,
      warnings: pending ? [`${pending} vagas aguardando a próxima coleta`] : [],
    };
  },
};
