import { isDevJob } from '../classify/relevance.js';
import { fetchJson } from '../lib/http.js';
import { decodeEntities, norm, toIsoDate } from '../lib/text.js';
import type { RawJob, SourceDef } from '../types.js';

const ALGOLIA = 'https://hn.algolia.com/api/v1';

const DEV_ROLE = /engineer|developer|programmer|full[\s-]?stack|front[\s-]?end|back[\s-]?end|devops|sre|\bswe\b|software|mobile|ios|android|ml\b|ai\b|data|platform|infra|architect|tech lead|cto/i;
const LOCATION_HINT =
  /remote|onsite|on-site|hybrid|in[\s-]office|\b(?:us|usa|uk|eu|emea|latam|americas|worldwide|anywhere|global)\b|san francisco|\bsf\b|new york|nyc|seattle|austin|boston|chicago|los angeles|london|berlin|toronto|lisbon|portugal|brazil|brasil|são paulo|europe|\b[A-Z]{2}\b,|,\s*[A-Z]{2}\b/i;
const SALARY_HINT = /[$€£]\s?\d|\d\s?k\b|\bequity\b|\bsalary\b|\d{2,3},\d{3}/i;
const URL_HINT = /https?:\/\/|www\.|\.\w{2,}\/?$/i;

/**
 * Comentário típico: "Acme | Senior Backend Engineer | San Francisco or REMOTE (US) | $180k-$220k | https://acme.com/jobs"
 * Separa empresa, cargo, local e salário pelas barras da primeira linha.
 */
export function parseHnPosting(html: string) {
  const firstBlock = html.split(/<p>/i)[0] ?? '';
  const header = decodeEntities(firstBlock.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const parts = header
    .split(/\s*[|｜]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const company = parts[0]
    .replace(/\(.*?\)/g, '')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    .trim()
    .slice(0, 80);
  const rest = parts.slice(1);
  const roleParts = rest.filter((p) => DEV_ROLE.test(p) && !URL_HINT.test(p) && p.length < 160);
  // "Senior Product Engineer, Product Manager, Sales Engineer" -> fica só o que é de dev
  const roles = roleParts.flatMap((p) => {
    const pieces = p.split(/\s*(?:,|;|\s&\s|\sand\s|\s\+\s|\s\/\s)\s*/).filter(Boolean);
    const dev = pieces.filter((x) => isDevJob(norm(x), false));
    return dev.length && dev.length < pieces.length ? [dev.join(', ')] : [p];
  });
  const locations = rest.filter(
    (p) => !roleParts.includes(p) && LOCATION_HINT.test(p) && !SALARY_HINT.test(p) && !URL_HINT.test(p) && p.length < 90,
  );
  const salary = rest.find((p) => SALARY_HINT.test(p) && !roleParts.includes(p));
  const remoteInRoles = roleParts.some((r) => /remote/i.test(r));
  return {
    company,
    title: roles.join(' / ').slice(0, 200),
    location: [...locations, ...(remoteInRoles ? ['Remote'] : [])].join(' · ').slice(0, 200),
    salaryText: salary?.slice(0, 80),
  };
}

export const hackernews: SourceDef = {
  id: 'hackernews',
  name: 'Hacker News · Who is hiring?',
  homepage: 'https://news.ycombinator.com/submitted?id=whoishiring',
  focus: ['US', 'WORLDWIDE', 'EUROPE'],
  description: 'Thread mensal "Ask HN: Who is hiring?" — vagas postadas direto por fundadores e times técnicos, muitas de startups de IA.',
  minIntervalMinutes: 120,
  async collect(ctx) {
    const search = await fetchJson(`${ALGOLIA}/search_by_date?tags=story,author_whoishiring&hitsPerPage=20`, { signal: ctx.signal, ua: 'bot' });
    const threads = (search.hits ?? [])
      .filter((h: any) => /^Ask HN: Who is hiring\?/i.test(h.title ?? ''))
      .sort((a: any, b: any) => b.created_at_i - a.created_at_i)
      .slice(0, 2); // mês atual + anterior
    if (!threads.length) throw new Error('Thread "Who is hiring?" não encontrada');

    const jobs: RawJob[] = [];
    for (const t of threads) {
      const item = await fetchJson(`${ALGOLIA}/items/${t.objectID}`, { signal: ctx.signal, ua: 'bot', timeoutMs: 60_000 });
      for (const c of item.children ?? []) {
        if (!c.text || c.author === null) continue;
        const p = parseHnPosting(c.text);
        if (!p || !p.title) continue;
        jobs.push({
          source: 'hackernews',
          sourceId: String(c.id),
          url: `https://news.ycombinator.com/item?id=${c.id}`,
          title: p.title,
          company: p.company,
          location: p.location || undefined,
          publishedAt: toIsoDate(c.created_at),
          description: c.text,
          descriptionFormat: 'html',
          salary: p.salaryText ? { text: p.salaryText } : undefined,
          // sem local claro, a grande maioria das vagas do HN é nos EUA
          regionHint: ['US'],
        });
      }
      ctx.log(`thread "${t.title}": ${item.children?.length ?? 0} comentários`);
    }
    return { jobs, complete: true };
  },
};
