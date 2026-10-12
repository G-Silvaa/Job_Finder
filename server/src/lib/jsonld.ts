import * as cheerio from 'cheerio';
import { decodeEntities } from './text.js';

/** Lê os blocos JSON-LD de uma página e devolve o primeiro objeto do tipo pedido (ex.: JobPosting). */
export function findJsonLd(html: string, type = 'JobPosting'): any | undefined {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(el).text();
    const found = parseLenient(raw);
    const hit = found && pick(found, type);
    if (hit) return hit;
  }
  return undefined;
}

function parseLenient(raw: string): any {
  // alguns sites deixam quebras de linha e tabs crus dentro das strings, o que quebra o JSON.parse
  const attempts = [raw, raw.replace(/[\u0000-\u001F]+/g, ' '), decodeEntities(raw).replace(/[\u0000-\u001F]+/g, ' ')];
  for (const a of attempts) {
    try {
      return JSON.parse(a.trim());
    } catch {
      /* tenta a próxima forma */
    }
  }
  return undefined;
}

function pick(node: any, type: string): any {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = pick(n, type);
      if (r) return r;
    }
    return undefined;
  }
  const t = node['@type'];
  if (t === type || (Array.isArray(t) && t.includes(type))) return node;
  if (node['@graph']) return pick(node['@graph'], type);
  return undefined;
}

/** Endereço do JobPosting em texto ("Lisboa, Lisboa, PT"). */
export function jsonLdLocation(job: any): string {
  const locs = Array.isArray(job?.jobLocation) ? job.jobLocation : job?.jobLocation ? [job.jobLocation] : [];
  const parts = locs.map((l: any) => {
    const a = l?.address ?? {};
    const country = typeof a.addressCountry === 'string' ? a.addressCountry : a.addressCountry?.name;
    return [a.addressLocality, a.addressRegion, country].filter(Boolean).join(', ');
  });
  return [...new Set(parts.filter(Boolean))].join(' · ');
}
