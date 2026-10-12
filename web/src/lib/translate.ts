/**
 * Tradução de vagas para português usando a tradução embutida do navegador (Chrome/Edge 138+:
 * APIs `Translator` e `LanguageDetector`). Roda no seu computador, sem chave e sem mandar o texto
 * para servidor nenhum. Em navegadores sem essa API, a tela oferece abrir no Google Tradutor.
 */

const PT_WORDS = /\b(de|para|com|você|voce|vaga|experiência|experiencia|conhecimento|desenvolvimento|requisitos|benefícios|nós|nossa|empresa|trabalho|não|são|uma|será)\b/gi;
const EN_WORDS = /\b(the|and|you|with|we|our|experience|requirements|benefits|will|team|work|are|this|for|role|skills)\b/gi;

/** Palpite rápido: o texto já está em português? (para decidir se mostra o botão "Traduzir") */
export function looksPortuguese(text: string): boolean {
  const sample = text.slice(0, 3000);
  const pt = sample.match(PT_WORDS)?.length ?? 0;
  const en = sample.match(EN_WORDS)?.length ?? 0;
  return pt >= en;
}

export class TranslationUnsupported extends Error {}

type AnyApi = any;

export function browserCanTranslate(): boolean {
  return typeof globalThis !== 'undefined' && 'Translator' in globalThis;
}

async function detectLanguage(text: string): Promise<string> {
  const LD: AnyApi = (globalThis as AnyApi).LanguageDetector;
  if (!LD) return 'en';
  try {
    if ((await LD.availability()) === 'unavailable') return 'en';
    const detector = await LD.create();
    const [best] = await detector.detect(text.slice(0, 2000));
    return best?.confidence > 0.5 ? best.detectedLanguage : 'en';
  } catch {
    return 'en';
  }
}

/** Elementos de bloco que viram uma unidade de tradução (mantém a estrutura, perde negritos internos). */
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre, dt, dd';

export interface Translated {
  title: string;
  html: string;
  from: string;
}

/**
 * Traduz o título e a descrição (HTML já sanitizado pelo servidor). `onProgress` recebe 0..1
 * enquanto o navegador baixa o modelo de tradução (só na primeira vez de cada idioma).
 */
export async function translateJob(title: string, html: string, onProgress?: (p: number) => void): Promise<Translated> {
  const T: AnyApi = (globalThis as AnyApi).Translator;
  if (!T) throw new TranslationUnsupported('Navegador sem tradução embutida');

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root')!;
  root.querySelectorAll('mark').forEach((m) => m.replaceWith(...Array.from(m.childNodes)));

  const from = await detectLanguage(`${title}\n${root.textContent ?? ''}`);
  if (from.startsWith('pt')) return { title, html, from };

  const availability = await T.availability({ sourceLanguage: from, targetLanguage: 'pt' });
  if (availability === 'unavailable') throw new TranslationUnsupported(`Tradução de "${from}" para português indisponível neste navegador`);
  const translator = await T.create({
    sourceLanguage: from,
    targetLanguage: 'pt',
    monitor(m: AnyApi) {
      m.addEventListener('downloadprogress', (e: AnyApi) => onProgress?.(e.loaded));
    },
  });

  // blocos "folha" (sem outros blocos dentro); texto solto fora deles também entra
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS)).filter((el) => !el.querySelector(BLOCKS));
  const units: { set: (t: string) => void; text: string }[] = blocks
    .map((el) => ({ text: el.textContent?.trim() ?? '', set: (t: string) => (el.textContent = t) }))
    .filter((u) => u.text);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent?.trim();
    if (!text || (n.parentElement && n.parentElement.closest(BLOCKS))) continue;
    const node = n;
    units.push({ text, set: (t) => (node.textContent = ` ${t} `) });
  }

  const [translatedTitle] = await Promise.all([
    translator.translate(title),
    // poucas de cada vez para não travar a aba
    (async () => {
      for (let i = 0; i < units.length; i += 6) {
        const batch = units.slice(i, i + 6);
        const out = await Promise.all(batch.map((u) => translator.translate(u.text)));
        batch.forEach((u, k) => u.set(out[k]));
      }
    })(),
  ]);
  translator.destroy?.();
  return { title: translatedTitle, html: root.innerHTML, from };
}

/** Links do Google Tradutor para quando o navegador não traduz sozinho. */
export function googleTranslateLinks(url: string, text: string) {
  return {
    page: `https://translate.google.com/translate?sl=auto&tl=pt&u=${encodeURIComponent(url)}`,
    text: `https://translate.google.com/?sl=auto&tl=pt&op=translate&text=${encodeURIComponent(text.slice(0, 4500))}`,
  };
}
