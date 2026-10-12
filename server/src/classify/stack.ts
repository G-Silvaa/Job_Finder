import type { Stack } from '../types.js';
import { countMatches, rx, test } from './rx.js';

const FULLSTACK = rx('full[\\s-]?stack|fullstack');
const FRONT_EXPLICIT = rx('front[\\s-]?end|frontend');
const BACK_EXPLICIT = rx('back[\\s-]?end|backend');
const FRONT_TITLE = rx(
  'ui\\s(?:engineer|developer|dev)|design\\sengineer|react(?:\\.?js)?(?![\\s-]*native)|angular(?:js)?|vue(?:\\.?js)?|next\\.?js|nuxt|svelte|interface|web\\s?designer\\sdeveloper',
);
const BACK_TITLE = rx(
  'api|apis|node(?:\\.?js)?|nest\\.?js|express\\.?js|java(?![\\s-]*script)|spring|python|django|flask|fast\\s?api|golang|go(?![\\s-]*to[\\s-]*market)|\\.net|dotnet|c#|php|laravel|ruby|rails|elixir|scala|rust|microservic(?:es|os)|server[\\s-]?side|integra(?:coes|tions?)|cobol|delphi|abap|as\\s?400|rpg(?:le)?|mainframe|natural\\sadabas|advpl|protheus|progress\\s4gl|payments?|pagamentos',
);
const MOBILE_TITLE = rx('mobile|ios|android|react[\\s-]*native|flutter|swift(?:ui)?|kotlin\\smultiplatform|kmp|apps?\\smoveis');
const QA_TITLE = rx(
  'qa|quality\\sassurance|quality\\sengineer|tester|testes?|testing|sdet|test\\s(?:engineer|automation|analyst)|automacao\\sde\\stestes|qualidade\\sde\\ssoftware|engenheir[oa]\\sde\\squalidade|analista\\sde\\squalidade',
);
const DEVOPS_TITLE = rx(
  'devops|devsecops|sre|site\\sreliability|platform\\sengineer(?:ing)?|engenheir[oa]\\sde\\s(?:plataforma|cloud|infraestrutura|confiabilidade)|infra(?:structure|estrutura)?\\s(?:engineer|developer)|infrastructure|infraestrutura|cloud\\s(?:engineer|architect|ops|infrastructure|platform|security|sre)|arquitet[oa]\\s(?:de\\s)?cloud|kubernetes|security\\sengineer|seguranca\\s(?:da\\sinformacao|cibernetica)|ciberseguranca|cyber\\s?security|observability|observabilidade|release\\sengineer|build\\sengineer|network',
);
const DATA_TITLE = rx(
  'data\\s(?:engineer(?:ing)?|scien\\w+|platform|infrastructure)|analytics|dados|machine\\slearning|ml\\s?ops|mlops|ml\\sengineer|deep\\slearning|computer\\svision|visao\\scomputacional|nlp|analytics\\sengineer|big\\sdata|etl|cientista',
);
const GENERIC_AI_TITLE = rx('ai|ia|llm|genai|inteligencia\\sartificial|applied\\sai|forward\\sdeployed|agents?|agentes?');
const WEB_TITLE = rx('web\\s(?:developer|dev|programmer|engineer)|(?:programador|desenvolvedor)(?:a)?\\sweb|webdev');
const CLOUD_TITLE = rx('aws|azure|gcp|google\\scloud|cloud');

const FRONT_SIGNALS = [
  rx('react(?:\\.?js)?(?![\\s-]*native)'),
  rx('angular'),
  rx('vue(?:\\.?js)?'),
  rx('next(?:\\.|\\s)?js'),
  rx('nuxt'),
  rx('svelte'),
  rx('css3?|scss|sass|tailwind|styled[\\s-]components'),
  rx('html5?'),
  rx('front[\\s-]?end|frontend'),
  rx('redux|zustand|react\\squery|tanstack'),
  rx('webpack|vite'),
  rx('storybook|design\\ssystem'),
  rx('web\\s?(?:vitals|performance|accessibility)|acessibilidade|a11y|responsive|responsiv[oa]'),
];
const BACK_SIGNALS = [
  rx('node(?:\\.?js)?|nest\\.?js|express\\.?js'),
  rx('java(?![\\s-]*script)|spring'),
  rx('python|django|flask|fast\\s?api'),
  rx('golang'),
  rx('\\.net|dotnet|c#'),
  rx('php|laravel|symfony'),
  rx('ruby|rails'),
  rx('elixir|scala|rust'),
  rx('sql|postgres(?:ql)?|mysql|mongo(?:db)?|dynamodb|cassandra'),
  rx('redis|kafka|rabbit\\s?mq|sqs|pub/?sub'),
  rx('micro[\\s-]?services?|micro[\\s-]?s?servicos'),
  rx('back[\\s-]?end|backend'),
  rx('(?:rest(?:ful)?|graphql|grpc)\\s?apis?|apis?\\s(?:rest(?:ful)?|graphql)'),
];

function signals(list: RegExp[], text: string): number {
  return list.reduce((n, re) => n + (test(re, text) ? 1 : 0), 0);
}

/**
 * Área principal da vaga. O título manda; se ele for genérico ("Software Engineer", "Desenvolvedor"),
 * olhamos tags e as tecnologias pedidas na descrição.
 */
export function classifyStack(titleNorm: string, textNorm: string, tagsNorm: string): Stack {
  const t = titleNorm;
  if (test(FULLSTACK, t)) return 'fullstack';

  const frontX = test(FRONT_EXPLICIT, t);
  const backX = test(BACK_EXPLICIT, t);
  if (frontX && backX) return 'fullstack';
  if (frontX) return 'frontend';
  if (backX) return 'backend';

  const front = test(FRONT_TITLE, t);
  const back = test(BACK_TITLE, t);
  if (test(MOBILE_TITLE, t)) return 'mobile';
  if (front && back) return 'fullstack';
  if (test(QA_TITLE, t)) return 'qa';
  if (test(DATA_TITLE, t)) return 'data';
  if (test(DEVOPS_TITLE, t)) return 'devops';
  if (front) return 'frontend';
  if (back) return 'backend';
  if (test(WEB_TITLE, t)) return 'fullstack';
  if (test(CLOUD_TITLE, t)) return 'devops';

  // Tags estruturadas da fonte (ex.: RemoteOK, Himalayas, labels do GitHub)
  if (tagsNorm) {
    if (test(FULLSTACK, tagsNorm)) return 'fullstack';
    const tf = test(FRONT_EXPLICIT, tagsNorm);
    const tb = test(BACK_EXPLICIT, tagsNorm);
    if (tf && tb) return 'fullstack';
    if (tf) return 'frontend';
    if (tb) return 'backend';
    if (test(rx('mobile|ios|android|flutter|react[\\s-]native'), tagsNorm)) return 'mobile';
    if (test(rx('devops|sre|infra(?:structure)?'), tagsNorm)) return 'devops';
  }

  // Título genérico: decide pela descrição
  const fullMentions = countMatches(FULLSTACK, textNorm, 5);
  const f = signals(FRONT_SIGNALS, textNorm);
  const b = signals(BACK_SIGNALS, textNorm);
  if (fullMentions >= 1 && f >= 1 && b >= 1) return 'fullstack';
  if (f >= 2 && b >= 2) return 'fullstack';
  if (f >= 2 && f > b) return 'frontend';
  if (b >= 2) return 'backend';
  if (f >= 1 && b === 0) return 'frontend';
  if (b >= 1 && f === 0) return 'backend';
  if (test(GENERIC_AI_TITLE, t)) return 'backend';
  return 'other';
}
