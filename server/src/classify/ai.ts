import type { AiCategory, AiInfo } from '../types.js';
import { rx } from './rx.js';

interface AiTerm {
  label: string;
  cat: AiCategory;
  /** 5 = sinal forte e específico; 1 = menção genérica a IA. */
  w: number;
  re: RegExp;
}

const V = (label: string, w: number, source: string): AiTerm => ({ label, cat: 'vibe', w, re: rx(source) });
const L = (label: string, w: number, source: string): AiTerm => ({ label, cat: 'llm', w, re: rx(source) });

const AI_WORD = '(?:ai|ia|llms?|genai|gen\\s?ai|inteligencia\\sartificial)';
const TOOLS_NEAR_CURSOR = 'copilot|claude|windsurf|codex|chatgpt|gemini|codeium|cline|aider|lovable|bolt|v0|replit|llms?|ai|ia';

/**
 * "vibe": vagas que pedem gente que programa com IA (vibe coding, Cursor, Copilot, Claude Code, agentes de código...).
 * "llm": vagas para construir produtos com IA (LLMs, RAG, agentes, LangChain...).
 */
export const AI_TERMS: AiTerm[] = [
  // ---------- vibe coding / IA para programar ----------
  V('Vibe coding', 6, 'vibe[\\s-]?cod(?:ing|ers?|e|ar|ando)|vibecod(?:ing|ers?|e)|vibe[\\s-]?engineer(?:ing)?'),
  V('Claude Code', 6, 'claude[\\s-]?code'),
  V('GitHub Copilot', 5, 'git\\s?hub\\s?copilot'),
  V('Copilot', 4, '(?<!git\\s?hub\\s)copilot(?!\\s?studio)(?:\\s?(?:chat|agent|workspace))?'),
  // "cursor" sozinho pode ser cursor de banco de dados: só conta com contexto de IA por perto.
  // O lookbehind fica depois do literal para só ser avaliado quando "cursor" casar (desempenho).
  V('Cursor', 5, `cursor(?:\\s?(?:ai|ide|editor|agent|composer)|\\.(?:sh|com|so))|cursor(?=[^.\\n]{0,60}(?<![a-z])(?:${TOOLS_NEAR_CURSOR})(?![a-z]))|cursor(?<=(?<![a-z])(?:${TOOLS_NEAR_CURSOR})(?![a-z])[^.\\n]{0,60}cursor)`),
  V('Windsurf', 5, 'windsurf'),
  V('OpenAI Codex', 5, 'openai\\s?codex|codex\\s?cli'),
  V('OpenAI Codex', 3, 'codex'),
  V('Gemini CLI', 5, 'gemini\\s?(?:cli|code\\s?assist)'),
  V('Amazon Q', 4, 'amazon\\s?q(?:\\s?developer)?|codewhisperer'),
  V('Codeium', 5, 'codeium'),
  V('Tabnine', 5, 'tabnine'),
  V('Aider', 3, 'aider(?:\\.chat)?'),
  V('Cline', 3, 'cline'),
  V('Roo Code', 5, 'roo\\s?code'),
  V('Kiro', 5, 'kiro(?:\\.dev|\\s?ide)'),
  V('Devin', 5, 'devin\\s?(?:ai|\\(cognition\\))|cognition\\s?devin'),
  V('JetBrains AI', 5, 'jetbrains\\s?(?:ai|junie)'),
  V('Sourcegraph Cody', 5, 'sourcegraph\\s?cody|cody\\s?ai'),
  V('OpenCode', 3, 'opencode'),
  V('Continue.dev', 5, 'continue\\.dev'),
  V('Lovable', 5, 'lovable(?:\\.dev|\\s?(?:ai|app))|(?:bolt|v0|replit|cursor)[^.\\n]{0,40}lovable|lovable[^.\\n]{0,40}(?:bolt|v0|replit|cursor)'),
  V('Bolt.new', 5, 'bolt\\.new|stackblitz\\s?bolt|bolt\\s?\\(stackblitz\\)'),
  V('v0 (Vercel)', 5, 'v0\\.dev|v0\\.app|v0\\s?(?:by|da|from)\\s?vercel|vercel\\s?v0'),
  V('Replit Agent', 5, 'replit\\s?(?:agent|ai)'),
  V('Agentic coding', 6, 'agentic\\s?(?:coding|programming|development|software\\s?(?:development|engineering)|engineering|engineer|workflows?\\s(?:for|in)\\s(?:coding|development))'),
  V('Agentes de código', 5, '(?:ai\\s)?coding\\s?agents?|code\\s?agents?|agentes?\\s(?:de\\s)?(?:ia\\s)?(?:codigo|programacao|codificacao|desenvolvimento)|software\\s?engineering\\s?agents?'),
  V('Desenvolvimento assistido por IA', 6, `${AI_WORD}[\\s-]?(?:assisted|powered|augmented|driven|enabled|native|first)\\s?(?:coding|development|programming|software\\s?(?:development|engineering)|engineering|code|developers?|engineers?|dev)`),
  V('Desenvolvimento assistido por IA', 6, `(?:desenvolvimento|programacao|codificacao|engenharia(?:\\sde\\ssoftware)?|codigo)\\s(?:assistid[ao]|aumentad[ao]|potencializad[ao]|apoiad[ao]|orientad[ao]|acelerad[ao]|turbinad[ao])\\s(?:por|com|pela|pelo|via)\\s(?:a\\s|o\\s)?${AI_WORD}`),
  V('Ferramentas de IA para código', 5, `${AI_WORD}[\\s-]?(?:coding|code|programming|dev(?:elopment)?|developer|engineering)\\s?(?:tools?|assistants?|copilots?|agents?|tooling)`),
  V('Ferramentas de IA para código', 5, `(?:ferramentas|assistentes?|copilotos?|agentes?)\\s(?:de\\s)?${AI_WORD}(?:\\sgenerativa)?\\s(?:para|no|na|em|de)\\s(?:o\\s|a\\s)?(?:desenvolvimento|codigo|programacao|programar|codificacao|codar|engenharia)`),
  V('Ferramentas de IA para código', 4, `(?:uso|usar|utilizar|utilizacao|experiencia|familiaridade|vivencia|dominio)\\s(?:de\\s|com\\s|em\\s)?(?:ferramentas\\s(?:de\\s)?)?${AI_WORD}(?:\\sgenerativa)?\\s(?:para|no|na|em)\\s(?:o\\s|a\\s)?(?:desenvolvimento|programar|programacao|codificar|codigo|dia\\sa\\sdia\\sde\\sdesenvolvimento)`),
  V('Ferramentas de IA para código', 4, `(?:use|using|leverage|leveraging|proficien(?:t|cy)\\s(?:with|in)|experience\\swith|comfortable\\swith|fluent\\swith|fluency\\swith|embrace|embracing)\\s(?:modern\\s)?(?:${AI_WORD}|generative\\sai)[\\s-]?(?:powered\\s)?(?:tools?|assistants?|copilots?)`),
  V('Pair programming com IA', 5, `${AI_WORD}\\s?pair[\\s-]?programm(?:ing|er)|pair[\\s-]?programm(?:ing|er)\\s(?:with|com)\\s(?:an?\\s)?${AI_WORD}`),
  V('Geração de código com IA', 6, `${AI_WORD}[\\s-]?(?:based\\s|powered\\s|driven\\s)?code\\s?gen(?:eration)?|code\\s?generation\\s(?:with|using|via|through)\\s(?:an?\\s)?${AI_WORD}|gera(?:cao|r)\\s(?:de\\s)?codigo\\s(?:com|por|usando|via|atraves\\sde)\\s(?:a\\s)?${AI_WORD}|${AI_WORD}\\s(?:para|pra)\\s(?:gerar|geracao\\sde|escrever)\\scodigo`),
  V('Geração de código', 2, 'geracao\\sde\\scodigo|code\\s?generation|codegen'),
  V('AI-native / AI-first', 3, `${AI_WORD}[\\s-](?:native|first)`),
  V('Spec-driven development', 4, 'spec[\\s-]?driven\\s?development'),
  V('Context engineering', 4, 'context\\s?engineering|engenharia\\sde\\scontexto'),
  V('Prompt-driven development', 5, 'prompt[\\s-]?driven\\s?(?:development|coding|programming)'),
  V('ChatGPT', 1, 'chat\\s?gpt'),
  V('Ferramentas de IA', 1, `${AI_WORD}\\s(?:tools|tooling)|ferramentas\\s(?:de\\s)?${AI_WORD}`),

  // ---------- engenharia de IA / LLM ----------
  L('LLM', 4, 'llms?|large\\slanguage\\smodels?|modelos?\\sde\\slinguagem(?:\\s(?:de\\sgrande\\sporte|grandes?|natural))?'),
  L('IA generativa', 4, 'generative\\sai|gen[\\s-]?ai|ia\\sgenerativa|inteligencia\\sartificial\\sgenerativa|genai'),
  L('RAG', 4, 'rag|retrieval[\\s-]augmented(?:\\sgeneration)?'),
  L('LangChain', 6, 'langchain|langgraph|langsmith'),
  L('LlamaIndex', 6, 'llama[\\s-]?index'),
  L(
    'Agentes de IA',
    4,
    'ai\\s?agents?|agentes?\\s(?:de\\s|com\\s)?(?:ia|inteligencia\\sartificial)|agentic\\s(?:ai|systems?|workflows?|applications?|apps?|frameworks?|platforms?|solutions?|products?|features?|experiences?|capabilities|architectures?|pipelines?|tools?)|multi[\\s-]?agents?|agentes?\\sautonomos|autonomous\\sagents?|llm\\sagents?|agentes?\\sinteligentes',
  ),
  // "agentic" solto aparece muito em texto institucional ("the agentic infrastructure company")
  L('Agentic', 1, 'agentic(?!\\s(?:ai|systems?|workflows?|applications?|apps?|frameworks?|platforms?|solutions?|products?|features?|experiences?|capabilities|architectures?|pipelines?|tools?|coding|programming|development|software|engineering|engineer))'),
  L('MCP', 4, 'model\\scontext\\sprotocol|mcp\\s(?:servers?|protocol|tools?)|servidor(?:es)?\\smcp'),
  L('CrewAI / AutoGen', 6, 'crew\\s?ai|autogen|semantic\\skernel|dspy|pydantic\\s?ai|mastra|vercel\\sai\\ssdk|openai\\sagents?\\ssdk|claude\\sagent\\ssdk'),
  L('OpenAI', 3, 'open\\s?ai'),
  L('Anthropic / Claude', 3, 'anthropic|claude(?![\\s-]?code)(?:\\s(?:api|sonnet|opus|haiku))?'),
  L('GPT', 2, 'gpt[\\s-]?(?:[3-9](?:\\.\\d)?o?|4o|4\\.1|5)|gpts?'),
  L('Gemini', 2, 'gemini(?!\\s?(?:cli|code))'),
  L('Hugging Face', 4, 'hugging\\s?face|huggingface'),
  L('Embeddings', 3, 'embeddings?'),
  L('Banco vetorial', 4, 'vector\\s?(?:databases?|dbs?|stores?|search|indexes?)|banco(?:s)?\\s(?:de\\sdados\\s)?vetori(?:al|ais)|pinecone|weaviate|qdrant|pgvector|chroma\\s?db|milvus'),
  L('Prompt engineering', 3, 'prompt\\s?engineer(?:ing)?|engenharia\\sde\\sprompts?|prompt\\sdesign|prompting'),
  L('Fine-tuning', 3, 'fine[\\s-]?tun(?:ing|e|ed)|ajuste\\sfino|rlhf'),
  L('Function calling', 3, 'function\\scalling|tool\\scalling'),
  L('Bedrock / Vertex AI', 3, '(?:amazon|aws)\\sbedrock|vertex\\s?ai|azure\\s?openai|azure\\sai\\s(?:foundry|studio)'),
  L('Ollama / vLLM', 4, 'ollama|vllm|llama\\.cpp|text\\sgeneration\\sinference'),
  L('Engenheiro(a) de IA', 5, `(?:ai|ia|llm|genai|gen\\sai|applied\\sai|ml|machine\\slearning)\\s(?:engineers?|developers?|engineering|software\\sengineers?)|engenheir[oa]s?\\s(?:de\\s)?(?:ia|inteligencia\\sartificial|machine\\slearning|ml|llms?|genai)|desenvolvedor(?:a|es)?\\s(?:de\\s)?(?:ia|inteligencia\\sartificial|llms?)|forward\\sdeployed\\s(?:ai\\s)?engineer`),
  L('Machine Learning', 2, 'machine\\slearning|aprendizado\\sde\\smaquina|deep\\slearning|ml\\s?ops|mlops'),
  L('NLP', 2, 'nlp|natural\\slanguage\\sprocessing|processamento\\sde\\slinguagem\\snatural|pln'),
  L('PyTorch / TensorFlow', 2, 'pytorch|tensorflow'),
  L('Inteligência artificial', 1, 'inteligencia\\sartificial|artificial\\sintelligence|ai|ia'),
];

/**
 * Limiares: um termo forte e específico basta ("Claude Code", "vibe coding", "LangChain"); termos
 * genéricos ("LLM", "IA generativa", "OpenAI") precisam aparecer junto com outros, porque também
 * surgem em texto institucional ("somos uma empresa de IA generativa").
 */
const VIBE_THRESHOLD = 5;
const LLM_THRESHOLD = 6;
/** Termos fracos que não aparecem sozinhos na lista de motivos. */
const WEAK = new Set(['Inteligência artificial', 'Ferramentas de IA', 'ChatGPT', 'Geração de código', 'Agentic']);

/** Detecta se a vaga é de IA. Ocorrências no título valem o dobro. */
export function classifyAi(titleNorm: string, textNorm: string, tagsNorm: string): AiInfo {
  const best = new Map<string, { term: AiTerm; score: number }>();
  const body = `${tagsNorm}\n${textNorm}`;
  for (const term of AI_TERMS) {
    term.re.lastIndex = 0;
    let score = 0;
    if (term.re.test(titleNorm)) score = term.w * 2;
    else {
      term.re.lastIndex = 0;
      if (term.re.test(body)) score = term.w;
    }
    if (!score) continue;
    const prev = best.get(term.label);
    if (!prev || prev.score < score) best.set(term.label, { term, score });
  }

  let vibe = 0;
  let llm = 0;
  for (const { term, score } of best.values()) {
    if (term.cat === 'vibe') vibe += score;
    else llm += score;
  }

  const categories: AiCategory[] = [];
  if (vibe >= VIBE_THRESHOLD) categories.push('vibe');
  if (llm >= LLM_THRESHOLD) categories.push('llm');

  const ranked = [...best.values()].sort((a, b) => b.score - a.score || (a.term.cat === 'vibe' ? -1 : 1));
  const strong = ranked.filter((r) => !WEAK.has(r.term.label));
  const matches = (categories.length ? (strong.length ? strong : ranked) : []).map((r) => r.term.label);

  return {
    score: categories.length ? Math.round(vibe * 1.5 + llm) : 0,
    categories,
    matches: [...new Set(matches)].slice(0, 8),
  };
}

/** Regex (para o front destacar) com os termos que casaram, a partir dos rótulos. */
export function aiHighlightSources(labels: string[]): string[] {
  return AI_TERMS.filter((t) => labels.includes(t.label)).map((t) => t.re.source);
}
