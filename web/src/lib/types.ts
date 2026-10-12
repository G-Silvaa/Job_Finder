export type Region = 'BR' | 'PT' | 'US' | 'LATAM' | 'EUROPE' | 'WORLDWIDE';
export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export type Stack = 'fullstack' | 'frontend' | 'backend' | 'mobile' | 'devops' | 'data' | 'qa' | 'other';
export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'unknown';
export type AiCategory = 'vibe' | 'llm';
export type AiFilter = 'any' | AiCategory;
export type View = 'all' | 'favorites' | 'applied' | 'hidden';
export type Sort = 'recent' | 'ai' | 'relevance';

export interface Salary {
  min?: number;
  max?: number;
  currency?: string;
  period?: 'year' | 'month' | 'hour';
  text?: string;
}

export interface Mark {
  favorite: boolean;
  applied: boolean;
  hidden: boolean;
  updatedAt: string;
}

export interface JobSummary {
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
  ai: { score: number; categories: AiCategory[]; matches: string[] };
  salary?: Salary;
  employmentType?: string;
  tags: string[];
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  active: boolean;
  snippet: string;
  isNew: boolean;
  alsoOn: { source: string; url: string; location: string }[];
  mark: Mark | null;
}

export interface JobDetail extends JobSummary {
  descriptionHtml: string;
}

export type FacetDim = 'regions' | 'stack' | 'seniority' | 'workMode' | 'ai' | 'techs' | 'sources';
export type Facets = Record<FacetDim, Record<string, number>>;

export interface JobsResponse {
  total: number;
  page: number;
  pageSize: number;
  items: JobSummary[];
  facets: Facets;
  collecting: boolean;
  lastCollectAt: string | null;
}

export interface Stats {
  total: number;
  new24h: number;
  /** Vagas que apareceram desde a última visita (quando a tela manda `since`). */
  newSince: number;
  ai: { any: number; vibe: number; llm: number };
  regions: Record<string, number>;
  sources: Record<string, number>;
  topCompanies: { name: string; logo?: string; count: number }[];
  marks: { favorites: number; applied: number; hidden: number };
  collecting: boolean;
  lastCollectAt: string | null;
  sourcesEnabled: number;
}

export interface SourceRun {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastCount: number | null;
  lastFetched: number | null;
  lastError: string | null;
  lastWarnings: string[];
  durationMs: number | null;
}

export interface SourceInfo {
  id: string;
  name: string;
  kind: 'board' | 'company';
  homepage: string;
  focus: Region[];
  description: string;
  enabled: boolean;
  requiresEnv: string[];
  run: SourceRun | null;
  active: number;
}

export interface SourceProgress {
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  fetched?: number;
  kept?: number;
  created?: number;
  error?: string;
  note?: string;
}

export interface SourcesResponse {
  collecting: boolean;
  progress: { startedAt: string; finishedAt?: string; sources: Record<string, SourceProgress> } | null;
  sources: SourceInfo[];
}
