import { config } from '../config.js';
import type { Job, RawJob } from '../types.js';
import { cleanWhitespace, norm, toPlainText, truncate } from '../lib/text.js';
import { classifyAi } from './ai.js';
import { classifyLocation } from './location.js';
import { isDevJob } from './relevance.js';
import { classifySeniority } from './seniority.js';
import { classifyStack } from './stack.js';
import { detectTechs } from './techs.js';

/** Aumente quando mudar regras de classificação: o servidor reclassifica tudo ao iniciar. */
export const CLASSIFIER_VERSION = 9;

/** O que fica salvo na coluna `job`: datas de visto e status vêm de colunas próprias. */
export type ClassifiedJob = Omit<Job, 'firstSeenAt' | 'lastSeenAt' | 'active'>;

export type ClassifyOutcome =
  | { ok: true; job: ClassifiedJob }
  | { ok: false; reason: 'not-dev' | 'region' | 'not-remote' | 'invalid' };

const MAX_DESCRIPTION_CHARS = 60_000;

/** Partes do título que só dizem onde/como é a vaga: "(Remote)", "[Híbrido]", "(m/f/d)", "[IC5]". */
const NOISE_PART =
  /\[[^\]]*\]|\((?:[^)]*(?:remot|hybrid|hibrid|presencial|on[\s-]?site|m\/f|m\/w|f\/m|h\/f|gn|all genders|latam|emea|americas|brasil|brazil|portugal|usa|us|eu|europe|worldwide|global|anywhere)[^)]*|ic\d+|l\d|[a-z]{0,5}\d{2,})\)/g;

/**
 * Chave para juntar a mesma vaga vinda de fontes/cidades diferentes: empresa + cargo, sem o que é
 * só local/modelo. Área e nível entram na chave para não juntar "(Java)" com "(iOS)" ou Júnior com Sênior.
 */
function dedupKey(company: string, titleNorm: string, stack: string, seniority: string): string {
  const title = titleNorm.replace(NOISE_PART, ' ').replace(/[^a-z0-9#+]+/g, ' ').trim();
  return `${norm(company).replace(/[^a-z0-9]+/g, '')}|${title}|${stack}|${seniority}`;
}

export function classify(raw: RawJob): ClassifyOutcome {
  const title = cleanWhitespace(String(raw.title ?? ''));
  if (!title || !raw.url || !raw.sourceId) return { ok: false, reason: 'invalid' };
  // "Engenheiro(a) de Dados", "Desenvolvedor/a" -> sem a marcação de gênero, para as regras casarem
  const titleNorm = norm(title)
    .replace(/\((?:a|o|as|os|e|es)\)/g, '')
    .replace(/(?<=[a-z])\/(?:a|as|o|os)(?![a-z])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!isDevJob(titleNorm, !!raw.trustedDev)) return { ok: false, reason: 'not-dev' };

  const format = raw.descriptionFormat ?? 'html';
  const description = String(raw.description ?? '').slice(0, MAX_DESCRIPTION_CHARS);
  const text = toPlainText(description, format);
  const textNorm = norm(text);
  const tags = (Array.isArray(raw.tags) ? raw.tags : []).map((t) => cleanWhitespace(String(t ?? ''))).filter(Boolean);
  const tagsNorm = norm(tags.join(' | '));

  const located = classifyLocation({
    location: raw.location,
    countries: raw.countries,
    regionHint: raw.regionHint,
    workMode: raw.workMode,
    titleNorm,
    titleOriginal: title,
    textNorm,
    tagsNorm,
  });
  const { workMode } = located;
  let { regions } = located;
  if (regions.length === 0) return { ok: false, reason: 'region' };
  // Fora do Brasil só interessam vagas remotas: uma vaga presencial em Lisboa ou Nova York sai,
  // e uma vaga "São Paulo ou Nova York" presencial fica só como vaga do Brasil.
  if (config.remoteOnlyOutsideBr && workMode !== 'remote') {
    regions = regions.filter((r) => r === 'BR');
    if (regions.length === 0) return { ok: false, reason: 'not-remote' };
  }

  const company = cleanWhitespace(String(raw.company ?? ''));
  const techs = detectTechs(titleNorm, textNorm, text, tagsNorm);
  const stack = classifyStack(titleNorm, textNorm, tagsNorm);
  const seniority = classifySeniority(titleNorm, textNorm, tagsNorm, raw.seniority);
  const location = cleanWhitespace(String(raw.location ?? ''));

  return {
    ok: true,
    job: {
      id: `${raw.source}:${raw.sourceId}`,
      source: raw.source,
      sourceId: raw.sourceId,
      url: raw.url,
      title,
      company,
      companyLogo: raw.companyLogo || undefined,
      location: truncate(location, 120),
      regions,
      workMode,
      stack,
      seniority,
      techs,
      ai: classifyAi(titleNorm, textNorm, tagsNorm),
      salary: raw.salary,
      employmentType: raw.employmentType ? cleanWhitespace(raw.employmentType) : undefined,
      tags: tags.slice(0, 20),
      publishedAt: raw.publishedAt ?? null,
      snippet: truncate(cleanWhitespace(text), 280),
      searchText: cleanWhitespace(`${titleNorm} ${norm(company)} ${norm(location)} ${norm(techs.join(' '))} ${tagsNorm} ${textNorm}`),
      // "Empresa confidencial" não serve para juntar vagas repetidas
      dedupKey: company && !/confidencia|confidential|sigilos|nao\sdivulgad|anonim/.test(norm(company)) ? dedupKey(company, titleNorm, stack, seniority) : '',
    },
  };
}
