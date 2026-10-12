import type { Region } from '../types.js';

export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workable' | 'recruitee' | 'teamtailor' | 'gem';

export interface Company {
  name: string;
  ats: Ats;
  /** Identificador da empresa no ATS (ex.: boards.greenhouse.io/<slug>). No Teamtailor, o domínio do site de vagas. */
  slug: string;
  /** Onde a empresa contrata quando a vaga não diz (ex.: "Remoto" numa empresa brasileira). */
  regionHint?: Region[];
  /** Lever da Europa (api.eu.lever.co). */
  eu?: boolean;
  /** Filtro extra na URL (ex.: "country=br" no SmartRecruiters). */
  query?: string;
}

const BR: Region[] = ['BR'];
const PT: Region[] = ['PT'];

/**
 * Empresas acompanhadas pelos sites de carreira (todas verificadas em out/2026).
 * Para adicionar uma, descubra o ATS pela URL da página de vagas:
 *   boards.greenhouse.io/<slug> · jobs.lever.co/<slug> · jobs.ashbyhq.com/<slug>
 *   apply.workable.com/<slug> · <slug>.recruitee.com · jobs.smartrecruiters.com/<slug>
 */
export const COMPANIES: Company[] = [
  // ---------- IA, ferramentas de código e devtools ----------
  { name: 'Anthropic', ats: 'greenhouse', slug: 'anthropic' },
  { name: 'OpenAI', ats: 'ashby', slug: 'openai' },
  { name: 'Cursor (Anysphere)', ats: 'ashby', slug: 'cursor' },
  { name: 'Replit', ats: 'ashby', slug: 'replit' },
  { name: 'Vercel', ats: 'greenhouse', slug: 'vercel' },
  { name: 'Supabase', ats: 'ashby', slug: 'supabase' },
  { name: 'Lovable', ats: 'ashby', slug: 'lovable' },
  { name: 'StackBlitz (Bolt.new)', ats: 'greenhouse', slug: 'stackblitz' },
  { name: 'Cognition (Devin / Windsurf)', ats: 'ashby', slug: 'cognition' },
  { name: 'Sourcegraph', ats: 'greenhouse', slug: 'sourcegraph91' },
  { name: 'Poolside', ats: 'ashby', slug: 'poolside' },
  { name: 'Magic', ats: 'ashby', slug: 'magic.dev' },
  { name: 'Factory', ats: 'ashby', slug: 'factory' },
  { name: 'Warp', ats: 'greenhouse', slug: 'warp' },
  { name: 'Cline', ats: 'greenhouse', slug: 'cline' },
  { name: 'CodeRabbit', ats: 'ashby', slug: 'coderabbit' },
  { name: 'Graphite', ats: 'ashby', slug: 'graphite' },
  { name: 'Greptile', ats: 'ashby', slug: 'greptile' },
  { name: 'Mintlify', ats: 'ashby', slug: 'mintlify' },
  { name: 'Mistral AI', ats: 'ashby', slug: 'mistral.ai' },
  { name: 'Cohere', ats: 'ashby', slug: 'cohere' },
  { name: 'Perplexity', ats: 'ashby', slug: 'perplexity' },
  { name: 'Hugging Face', ats: 'workable', slug: 'huggingface' },
  { name: 'LangChain', ats: 'ashby', slug: 'langchain' },
  { name: 'LlamaIndex', ats: 'ashby', slug: 'llamaindex' },
  { name: 'Pinecone', ats: 'ashby', slug: 'pinecone' },
  { name: 'Modal', ats: 'ashby', slug: 'modal' },
  { name: 'Baseten', ats: 'ashby', slug: 'baseten' },
  { name: 'Together AI', ats: 'greenhouse', slug: 'togetherai' },
  { name: 'Fireworks AI', ats: 'ashby', slug: 'fireworks' },
  { name: 'ElevenLabs', ats: 'ashby', slug: 'elevenlabs' },
  { name: 'Harvey', ats: 'ashby', slug: 'harvey' },
  { name: 'Glean', ats: 'greenhouse', slug: 'gleanwork' },
  { name: 'Sierra', ats: 'ashby', slug: 'sierra' },
  { name: 'Decagon', ats: 'ashby', slug: 'decagon' },
  { name: 'Scale AI', ats: 'greenhouse', slug: 'scaleai' },
  { name: 'Databricks', ats: 'greenhouse', slug: 'databricks' },
  { name: 'xAI', ats: 'greenhouse', slug: 'xai' },
  { name: 'Mercor', ats: 'ashby', slug: 'mercor' },
  { name: 'Writer', ats: 'ashby', slug: 'writer' },
  { name: 'Vapi', ats: 'ashby', slug: 'vapi' },
  { name: 'Browserbase', ats: 'ashby', slug: 'browserbase' },
  { name: 'n8n', ats: 'ashby', slug: 'n8n' },
  { name: 'Linear', ats: 'ashby', slug: 'linear' },
  { name: 'Ramp', ats: 'ashby', slug: 'ramp' },
  { name: 'Notion', ats: 'ashby', slug: 'notion' },
  { name: 'Figma', ats: 'greenhouse', slug: 'figma' },
  { name: 'Retool', ats: 'gem', slug: 'retool' },
  { name: 'GitLab', ats: 'greenhouse', slug: 'gitlab' },
  { name: 'Stripe', ats: 'greenhouse', slug: 'stripe' },
  { name: 'PostHog', ats: 'ashby', slug: 'posthog' },
  { name: 'Sentry', ats: 'ashby', slug: 'sentry' },
  { name: 'Render', ats: 'ashby', slug: 'render' },
  { name: 'Railway', ats: 'ashby', slug: 'railway' },
  { name: 'Clerk', ats: 'ashby', slug: 'clerk' },
  { name: 'Convex', ats: 'ashby', slug: 'convex-dev' },
  { name: 'Resend', ats: 'ashby', slug: 'resend' },
  { name: 'Temporal', ats: 'ashby', slug: 'temporal' },

  // ---------- Brasil ----------
  { name: 'Nubank', ats: 'ashby', slug: 'nubank', regionHint: BR },
  { name: 'iFood', ats: 'greenhouse', slug: 'ifoodcarreiras', regionHint: BR },
  { name: 'QuintoAndar', ats: 'greenhouse', slug: 'quintoandar', regionHint: BR },
  { name: 'Hotmart', ats: 'greenhouse', slug: 'hotmartcareersbr', regionHint: BR },
  { name: 'VTEX', ats: 'greenhouse', slug: 'vtex', regionHint: BR },
  { name: 'Stone', ats: 'greenhouse', slug: 'stone', regionHint: BR },
  { name: 'Loft', ats: 'teamtailor', slug: 'loft.teamtailor.com', regionHint: BR },
  { name: 'Zup', ats: 'greenhouse', slug: 'zupinnovation', regionHint: BR },
  { name: 'CI&T', ats: 'lever', slug: 'ciandt', regionHint: BR },
  { name: 'Wildlife Studios', ats: 'greenhouse', slug: 'wildlifestudios', regionHint: BR },
  { name: 'Wellhub (Gympass)', ats: 'greenhouse', slug: 'gympass', regionHint: BR },
  { name: 'EBANX', ats: 'greenhouse', slug: 'ebanx', regionHint: BR },
  { name: 'Neon', ats: 'lever', slug: 'neon', regionHint: BR },
  { name: 'Jusbrasil', ats: 'greenhouse', slug: 'jusbrasil', regionHint: BR },
  { name: 'RD Station', ats: 'greenhouse', slug: 'rdstation', regionHint: BR },
  { name: 'Inter', ats: 'greenhouse', slug: 'inter', regionHint: BR },
  { name: 'BTG Pactual', ats: 'greenhouse', slug: 'btgpactual', regionHint: BR },
  { name: 'Bosch (Brasil)', ats: 'smartrecruiters', slug: 'BoschGroup', query: 'country=br', regionHint: BR },
  { name: 'Turing', ats: 'greenhouse', slug: 'turing' },

  // ---------- Portugal ----------
  { name: 'Talkdesk', ats: 'greenhouse', slug: 'talkdesk2', regionHint: PT },
  { name: 'Feedzai', ats: 'greenhouse', slug: 'feedzai', regionHint: PT },
  { name: 'Sword Health', ats: 'greenhouse', slug: 'swordhealth' },
  { name: 'Farfetch', ats: 'lever', slug: 'farfetch', regionHint: PT },
  { name: 'Mindera', ats: 'workable', slug: 'minderacraft' },
  { name: 'Mercedes-Benz.io', ats: 'recruitee', slug: 'mbio', regionHint: PT },
  { name: 'Volkswagen Digital Solutions', ats: 'lever', slug: 'vwgds', eu: true, regionHint: PT },
  { name: 'Cloudflare', ats: 'greenhouse', slug: 'cloudflare' },
  { name: 'Bosch (Portugal)', ats: 'smartrecruiters', slug: 'BoschGroup', query: 'country=pt', regionHint: PT },
  { name: 'Elastic', ats: 'greenhouse', slug: 'elastic' },

  // ---------- EUA / remoto ----------
  { name: 'Canonical', ats: 'greenhouse', slug: 'canonical' },
  { name: 'Grafana Labs', ats: 'greenhouse', slug: 'grafanalabs' },
  { name: 'Datadog', ats: 'greenhouse', slug: 'datadog' },
  { name: 'MongoDB', ats: 'greenhouse', slug: 'mongodb' },
  { name: 'Twilio', ats: 'greenhouse', slug: 'twilio' },
  { name: 'Coinbase', ats: 'greenhouse', slug: 'coinbase' },
  { name: 'Anchorage Digital', ats: 'lever', slug: 'anchorage' },
  { name: 'Wikimedia', ats: 'greenhouse', slug: 'wikimedia' },
];
