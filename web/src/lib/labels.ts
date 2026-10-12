import type { AiFilter, Region, Seniority, Stack, WorkMode } from './types';

export const REGION_LABEL: Record<Region, string> = {
  BR: 'Brasil',
  PT: 'Portugal',
  US: 'EUA',
  LATAM: 'América Latina',
  EUROPE: 'Europa',
  WORLDWIDE: 'Global',
};

/** Nome curto no filtro. Fora do Brasil todas as vagas são remotas. */
export const REGION_FILTER_LABEL: Record<Region, string> = {
  BR: 'Brasil',
  PT: 'Portugal · remoto',
  US: 'EUA · remoto',
  LATAM: 'LATAM · remoto',
  EUROPE: 'Europa · remoto',
  WORLDWIDE: 'Global · remoto',
};

export const REGION_HINT: Record<Region, string> = {
  BR: 'Vagas no Brasil (presenciais, híbridas ou remotas)',
  PT: 'Vagas remotas de empresas/para quem está em Portugal',
  US: 'Vagas remotas nos EUA (algumas exigem morar lá)',
  LATAM: 'Remotas abertas para a América Latina',
  EUROPE: 'Remotas abertas para a Europa',
  WORLDWIDE: 'Remotas de qualquer lugar do mundo',
};

export const REGION_ORDER: Region[] = ['BR', 'PT', 'US', 'LATAM', 'EUROPE', 'WORLDWIDE'];

export const STACK_LABEL: Record<Stack, string> = {
  fullstack: 'Fullstack',
  frontend: 'Front-end',
  backend: 'Back-end',
  mobile: 'Mobile',
  devops: 'DevOps / Cloud',
  data: 'Dados & ML',
  qa: 'QA / Testes',
  other: 'Outros',
};

export const STACK_ORDER: Stack[] = ['fullstack', 'frontend', 'backend', 'mobile', 'devops', 'data', 'qa', 'other'];

/** Cor de cada área: bolinha + texto discreto. */
export const STACK_DOT: Record<Stack, string> = {
  fullstack: 'bg-violet-500',
  frontend: 'bg-sky-500',
  backend: 'bg-emerald-500',
  mobile: 'bg-orange-500',
  devops: 'bg-zinc-500',
  data: 'bg-amber-500',
  qa: 'bg-rose-500',
  other: 'bg-stone-400',
};

export const SENIORITY_LABEL: Record<Seniority, string> = {
  intern: 'Estágio / Trainee',
  junior: 'Júnior',
  mid: 'Pleno',
  senior: 'Sênior',
  lead: 'Lead / Staff / Especialista',
  unknown: 'Não informado',
};

export const SENIORITY_SHORT: Record<Seniority, string> = {
  intern: 'Estágio',
  junior: 'Júnior',
  mid: 'Pleno',
  senior: 'Sênior',
  lead: 'Lead/Staff',
  unknown: '',
};

export const SENIORITY_ORDER: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'unknown'];

export const WORKMODE_LABEL: Record<WorkMode, string> = {
  remote: 'Remoto',
  hybrid: 'Híbrido',
  onsite: 'Presencial',
  unknown: 'Não informado',
};

export const WORKMODE_ORDER: WorkMode[] = ['remote', 'hybrid', 'onsite', 'unknown'];

export const AI_LABEL: Record<AiFilter, string> = {
  any: 'Tudo de IA',
  vibe: 'IA para programar',
  llm: 'Engenharia de IA',
};

export const AI_HINT: Record<AiFilter, string> = {
  any: 'Qualquer vaga que peça IA',
  vibe: 'Pedem quem programa com IA: Cursor, Copilot, Claude Code, Windsurf, vibe coding, agentes de código…',
  llm: 'Para construir produtos com IA: LLMs, RAG, LangChain, agentes, MCP, OpenAI/Anthropic…',
};

export const PERIODS: { days: number; label: string }[] = [
  { days: 1, label: '24 horas' },
  { days: 3, label: '3 dias' },
  { days: 7, label: '7 dias' },
  { days: 14, label: '14 dias' },
  { days: 30, label: '30 dias' },
];

export const PRESETS: { label: string; regions: Region[]; hint: string }[] = [
  { label: 'Moro no Brasil', regions: ['BR', 'LATAM', 'WORLDWIDE'], hint: 'Brasil + remotas abertas à América Latina e ao mundo' },
  { label: 'Remoto Portugal', regions: ['PT', 'EUROPE', 'WORLDWIDE'], hint: 'Remotas em Portugal, Europa e globais' },
  { label: 'Remoto EUA', regions: ['US'], hint: 'Remotas de empresas dos EUA' },
];
