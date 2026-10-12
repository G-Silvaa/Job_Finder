import type { Salary } from './types';

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = Date.parse(iso) - now;
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return 'agora';
  if (abs < hour) return rtf.format(Math.round(diff / min), 'minute');
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour');
  if (abs < 14 * day) return rtf.format(Math.round(diff / day), 'day');
  if (abs < 60 * day) return rtf.format(Math.round(diff / (7 * day)), 'week');
  return rtf.format(Math.round(diff / (30 * day)), 'month');
}

export function fullDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PERIOD: Record<string, string> = { year: '/ano', month: '/mês', hour: '/h' };

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      notation: n >= 10_000 ? 'compact' : 'standard',
      maximumFractionDigits: n >= 10_000 ? 1 : 0,
    }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString('pt-BR')}`;
  }
}

export function formatSalary(s?: Salary): string {
  if (!s) return '';
  const cur = s.currency || 'BRL';
  const per = s.period ? PERIOD[s.period] : '';
  if (s.min && s.max && s.max !== s.min) return `${money(s.min, cur)} – ${money(s.max, cur)}${per}`;
  const v = s.min || s.max;
  if (v) return `${s.max && !s.min ? 'até ' : ''}${money(v, cur)}${per}`;
  if (s.text) return s.text.length > 40 ? s.text.slice(0, 39) + '…' : s.text;
  return '';
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Cor estável a partir de um texto (para o avatar da empresa sem logo). */
export function hueFrom(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
}
