import { decodeHTML } from 'entities';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import type { DescriptionFormat } from '../types.js';

/** minúsculo e sem acentos: "Sênior Back-End" -> "senior back-end" */
export function norm(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function decodeEntities(s: string): string {
  return decodeHTML(s);
}

export function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

const BLOCK_END = /<\/(p|div|li|ul|ol|h[1-6]|tr|table|section|article|blockquote|pre)>|<br\s*\/?>/gi;

/** HTML -> texto puro, preservando separação entre blocos (evita "React</li><li>Node" virar "ReactNode"). */
export function htmlToText(html: string): string {
  if (!html) return '';
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(BLOCK_END, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer nofollow' }),
    // títulos grandes da descrição viram subtítulos discretos no painel
    h1: 'h4',
    h2: 'h4',
    h3: 'h5',
  },
  exclusiveFilter: (frame) => ['p', 'span', 'div', 'strong', 'b', 'em'].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren?.length,
};

/** Converte a descrição da fonte para HTML seguro para exibir no front. */
export function toSafeHtml(content: string | undefined, format: DescriptionFormat = 'html'): string {
  if (!content) return '';
  let html: string;
  if (format === 'markdown') {
    html = marked.parse(content, { async: false, gfm: true, breaks: true }) as string;
  } else if (format === 'text') {
    html = content
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
      .join('');
  } else {
    // Algumas APIs (ex.: Greenhouse) entregam o HTML "escapado": &lt;p&gt;...
    html = /&lt;\/?[a-z][^&]*&gt;/i.test(content) && !/<\/?[a-z][^>]*>/i.test(content) ? decodeEntities(content) : content;
  }
  return sanitizeHtml(html, SANITIZE).trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Texto puro a partir de qualquer formato, para classificação e busca. */
export function toPlainText(content: string | undefined, format: DescriptionFormat = 'html'): string {
  if (!content) return '';
  if (format === 'text') return content;
  if (format === 'markdown') return htmlToText(marked.parse(content, { async: false, gfm: true }) as string);
  return htmlToText(/&lt;\/?[a-z]/i.test(content) && !/<\/?[a-z][^>]*>/i.test(content) ? decodeEntities(content) : content);
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

/** Data em ISO ou null. Aceita ISO, RFC 2822 (RSS), epoch em segundos ou milissegundos. */
export function toIsoDate(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  let d: Date;
  if (typeof value === 'number') d = new Date(value < 1e12 ? value * 1000 : value);
  else if (typeof value === 'string' && /^\d{9,13}$/.test(value)) {
    const n = Number(value);
    d = new Date(n < 1e12 ? n * 1000 : n);
  } else d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return undefined;
  // datas no futuro (fuso/erros da fonte) são limitadas a "agora"
  const now = Date.now();
  return new Date(Math.min(d.getTime(), now)).toISOString();
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
