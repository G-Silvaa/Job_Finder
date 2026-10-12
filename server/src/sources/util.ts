import type { Salary } from '../types.js';

/** ISO-2 a partir de nomes de país comuns (para APIs que mandam o nome por extenso). */
const COUNTRY_CODES: Record<string, string> = {
  brazil: 'BR',
  brasil: 'BR',
  portugal: 'PT',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  us: 'US',
  'estados unidos': 'US',
  eua: 'US',
};

export function countryCode(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const n = name.trim();
  if (/^[A-Za-z]{2}$/.test(n)) return n.toUpperCase();
  return COUNTRY_CODES[n.toLowerCase()];
}

export function joinLocation(...parts: (string | undefined | null)[]): string {
  return [...new Set(parts.map((p) => (p ?? '').trim()).filter(Boolean))].join(', ');
}

export function salaryFrom(min: unknown, max: unknown, currency?: string | null, period?: Salary['period']): Salary | undefined {
  const lo = Number(min) || undefined;
  const hi = Number(max) || undefined;
  if (!lo && !hi) return undefined;
  return { min: lo, max: hi, currency: currency || undefined, period };
}

/** "1 YEAR", "per year", "yearly", "annual", "month", "mensal", "hour" -> period */
export function periodFrom(v: unknown): Salary['period'] | undefined {
  const s = String(v ?? '').toLowerCase();
  if (/year|annual|ano|anual/.test(s)) return 'year';
  if (/month|mes|mensal/.test(s)) return 'month';
  if (/hour|hora/.test(s)) return 'hour';
  return undefined;
}
