/** Regiões que o usuário pode filtrar. */
export type Region = 'BR' | 'PT' | 'US' | 'LATAM' | 'EUROPE' | 'WORLDWIDE';

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

export type Stack = 'fullstack' | 'frontend' | 'backend' | 'mobile' | 'devops' | 'data' | 'qa' | 'other';

export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'unknown';

/** vibe = usa IA para programar (Cursor, Copilot, Claude Code, vibe coding...). llm = constrói produtos com IA/LLM. */
export type AiCategory = 'vibe' | 'llm';

export type DescriptionFormat = 'html' | 'markdown' | 'text';

export interface Salary {
  min?: number;
  max?: number;
  currency?: string;
  period?: 'year' | 'month' | 'hour';
  /** Texto livre quando a fonte não estrutura o salário (ex.: "R$ 8.000 a 10.000"). */
  text?: string;
}

/**
 * Vaga como vem da fonte, já mapeada para campos comuns mas ainda sem classificação.
 * É isso que fica salvo no banco: dá para reclassificar tudo sem buscar de novo.
 */
export interface RawJob {
  source: string;
  sourceId: string;
  url: string;
  title: string;
  company?: string;
  companyLogo?: string;
  /** Localização em texto livre, como a fonte mostra. */
  location?: string;
  /** Códigos ISO-2 de país quando a fonte informa de forma estruturada. */
  countries?: string[];
  /** Regiões já conhecidas pela fonte (ex.: Gupy -> BR). Servem de fallback. */
  regionHint?: Region[];
  workMode?: WorkMode;
  publishedAt?: string;
  description?: string;
  descriptionFormat?: DescriptionFormat;
  salary?: Salary;
  tags?: string[];
  employmentType?: string;
  seniority?: Seniority;
  /** Quando true, a fonte já filtra só vagas de tecnologia (dispensa checagem estrita do título). */
  trustedDev?: boolean;
}

export interface AiInfo {
  score: number;
  categories: AiCategory[];
  /** Termos encontrados, em forma legível ("Cursor", "Claude Code", "LLM"...). */
  matches: string[];
}

/** Vaga normalizada e classificada (o que a API entrega). */
export interface Job {
  id: string;
  source: string;
  sourceId: string;
  url: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  regions: Region[];
  workMode: WorkMode;
  stack: Stack;
  seniority: Seniority;
  techs: string[];
  ai: AiInfo;
  salary?: Salary;
  employmentType?: string;
  tags: string[];
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** false quando a vaga sumiu da fonte (encerrada). Só aparece em favoritas/candidaturas. */
  active: boolean;
  /** Começo da descrição em texto puro, para o card. */
  snippet: string;
  /** Texto normalizado (minúsculo, sem acento) usado na busca. Não vai para o front. */
  searchText: string;
  dedupKey: string;
}

export interface CollectContext {
  /** Data de corte: vagas publicadas antes disso podem ser ignoradas pela fonte. */
  since: Date;
  /**
   * Vagas desta fonte já salvas (sourceId -> vaga). Fontes que precisam de uma requisição por vaga
   * para pegar a descrição reaproveitam o que já têm em vez de baixar de novo.
   */
  previous: Map<string, RawJob>;
  /** Pequeno armazenamento chave-valor persistente (ex.: ETags) da fonte. */
  cache: { get(key: string): string | undefined; set(key: string, value: string): void };
  log: (msg: string) => void;
  signal: AbortSignal;
}

export interface CollectResult {
  jobs: RawJob[];
  /**
   * true quando a fonte trouxe a lista completa de vagas abertas: vagas que não vieram
   * podem ser marcadas como encerradas. Fontes paginadas com limite devolvem false.
   */
  complete: boolean;
  warnings?: string[];
}

export interface SourceDef {
  id: string;
  name: string;
  /** 'company' = site de carreira da própria empresa (via ATS); 'board' = quadro/agregador de vagas. */
  kind?: 'board' | 'company';
  homepage: string;
  /** Regiões em que a fonte é forte (só para exibição). */
  focus: Region[];
  description: string;
  /** Intervalo mínimo entre coletas, para respeitar limites das APIs. */
  minIntervalMinutes: number;
  /**
   * Idade máxima das vagas aceitas (padrão 60 dias). Fontes que só listam vagas abertas (sites de
   * carreira das empresas) usam um valor maior: lá uma vaga antiga ainda está de pé.
   */
  maxAgeDays?: number;
  /** Variáveis de ambiente necessárias (ex.: chave de API). Sem elas a fonte fica desativada. */
  requiresEnv?: string[];
  collect(ctx: CollectContext): Promise<CollectResult>;
}
