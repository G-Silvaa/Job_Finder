import { rx, test } from './rx.js';

interface TechDef {
  name: string;
  /** Regex para título e tags (texto normalizado). Também usada na descrição se `textRe` não existir. */
  re: RegExp;
  /** Teste na descrição original (com maiúsculas) para nomes que também são palavras comuns ("React", "Go"). */
  textRe?: RegExp | ((text: string) => boolean);
}

const T = (name: string, source: string, textRe?: TechDef['textRe']): TechDef => ({ name, re: rx(source), textRe });

const OTHER_LANGS = /Python|Java(?!Script)|JavaScript|TypeScript|Rust|Node(?:\.js)?|Kotlin|Ruby|C\+\+|C#|Scala|Elixir|PHP|Swift|Erlang|Haskell|Clojure|\.NET|Golang/;

/**
 * "Go" é palavra comum em inglês ("Go beyond", "AL Go for GitHub"): só conta quando aparece numa lista
 * de linguagens, como "Go developer" ou "em/with Go".
 */
function mentionsGo(text: string): boolean {
  if (/golang/i.test(text)) return true;
  for (const m of text.matchAll(/(?<![A-Za-z0-9.])Go(?![A-Za-z0-9-])/g)) {
    const i = m.index!;
    if (OTHER_LANGS.test(text.slice(Math.max(0, i - 40), i + 42))) return true;
    const after = text.slice(i + 2, i + 32);
    if (/^\s*(?:developers?|engineers?|programming|services?|microservices?|back[\s-]?end|code(?:base)?|stack|\(golang\))/i.test(after)) return true;
    const before = text.slice(Math.max(0, i - 12), i);
    if (/(?:\bin|\bwith|\busing|\buses?|\bem|\bcom)\s+$/i.test(before) && /^\s*(?:[,.;)]|$|\s(?:and|or|e|ou)\b)/.test(after)) return true;
  }
  return false;
}

/** Ordem = ordem de exibição quando empatam. */
export const TECHS: TechDef[] = [
  T('TypeScript', 'typescript'),
  T('JavaScript', 'javascript|ecmascript'),
  T('React', 'react(?:\\.?js)?(?![\\s-]*native)', /(?<![A-Za-z0-9])React(?:\.?js|JS)?(?![A-Za-z0-9])(?!\s*-?\s*Native)|ReactJS|React\.js/),
  T('React Native', 'react[\\s-]*native'),
  T('Next.js', 'next(?:\\.|\\s)?js'),
  T('Vue', 'vue(?:\\.?js)?(?:\\s?[23])?'),
  T('Nuxt', 'nuxt(?:\\.?js)?'),
  T('Angular', 'angular(?:js)?'),
  T('Svelte', 'svelte(?:kit)?'),
  T('HTML/CSS', 'html5?|css3?|sass|scss'),
  T('Tailwind', 'tailwind(?:\\s?css)?'),
  T('Node.js', 'node(?:\\.?js)?'),
  T('NestJS', 'nest\\.?js'),
  T('Express', 'express\\.?js'),
  T('Python', 'python'),
  T('Django', 'django'),
  T('FastAPI', 'fast\\s?api'),
  T('Flask', 'flask'),
  T('Java', 'java(?![\\s-]*script)'),
  T('Spring', 'spring[\\s-]?(?:boot|framework|cloud|data|mvc|security|batch|webflux)'),
  T('Kotlin', 'kotlin'),
  T('Go', 'golang|go(?![\\s-]*to[\\s-]*market)', mentionsGo),
  T('Rust', 'rust'),
  T('C#', 'c#|c\\s?sharp'),
  T('.NET', '\\.net(?:\\s?core|\\s?framework)?|dotnet|asp\\.net(?:\\s?core|\\s?mvc)?|vb\\.net'),
  T('PHP', 'php'),
  T('Laravel', 'laravel'),
  T('Symfony', 'symfony'),
  T('Ruby', 'ruby'),
  T('Rails', 'rails|ruby\\s?on\\s?rails|ror'),
  T('Elixir', 'elixir'),
  T('Scala', 'scala'),
  T('C++', 'c\\+\\+|cpp'),
  T('Swift', 'swift(?:ui)?', /(?<![A-Za-z0-9])Swift(?:UI)?(?![A-Za-z0-9])/),
  T('Flutter', 'flutter'),
  T('Dart', 'dart'),
  T('iOS', 'ios'),
  T('Android', 'android'),
  T('SQL', 'sql'),
  T('PostgreSQL', 'postgres(?:ql)?'),
  T('MySQL', 'mysql|mariadb'),
  T('SQL Server', 'sql\\s?server|mssql'),
  T('MongoDB', 'mongo(?:db)?'),
  T('Redis', 'redis'),
  T('Elasticsearch', 'elastic\\s?search|opensearch'),
  T('GraphQL', 'graphql'),
  T('Kafka', 'kafka'),
  T('RabbitMQ', 'rabbit\\s?mq'),
  T('AWS', 'aws|amazon\\s?web\\s?services'),
  T('GCP', 'gcp|google\\s?cloud(?:\\s?platform)?'),
  T('Azure', 'azure'),
  T('Docker', 'docker'),
  T('Kubernetes', 'kubernetes|k8s'),
  T('Terraform', 'terraform'),
  T('Microsserviços', 'micro[\\s-]?services?|micro[\\s-]?s?servicos'),
  T('Linux', 'linux'),
  T('Firebase', 'firebase'),
  T('Supabase', 'supabase'),
  T('Spark', 'spark|pyspark', /(?<![A-Za-z0-9])(?:Apache\s)?Spark(?![A-Za-z0-9])|[Pp]y[Ss]park/),
  T('Airflow', 'airflow'),
  T('Databricks', 'databricks'),
  T('Snowflake', 'snowflake'),
  T('PyTorch', 'pytorch'),
  T('TensorFlow', 'tensorflow'),
  T('Cypress', 'cypress'),
  T('Playwright', 'playwright'),
  T('Selenium', 'selenium'),
  T('Delphi', 'delphi'),
  T('ABAP', 'abap'),
  T('COBOL', 'cobol'),
  T('Solidity', 'solidity'),
];

/**
 * Detecta tecnologias. `titleNorm`, `textNorm` e `tagsNorm` estão normalizados; `textOriginal` é a
 * descrição em texto puro com maiúsculas preservadas. Tecnologias do título vêm primeiro.
 */
export function detectTechs(titleNorm: string, textNorm: string, textOriginal: string, tagsNorm: string): string[] {
  const inTitle: string[] = [];
  const inText: string[] = [];
  for (const t of TECHS) {
    if (test(t.re, titleNorm)) inTitle.push(t.name);
    else if (test(t.re, tagsNorm)) inText.push(t.name);
    else if (typeof t.textRe === 'function' ? t.textRe(textOriginal) : t.textRe ? t.textRe.test(textOriginal) : test(t.re, textNorm))
      inText.push(t.name);
  }
  return [...inTitle, ...inText];
}
