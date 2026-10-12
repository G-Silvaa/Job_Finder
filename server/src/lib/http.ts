const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; RadarVagasDev/1.0; agregador pessoal de vagas)';

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    body?: string,
  ) {
    super(`HTTP ${status} em ${url}${body ? ` — ${body.slice(0, 160).replace(/\s+/g, ' ')}` : ''}`);
  }
}

export interface FetchOpts {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
  /** 'bot' identifica o agregador; 'browser' é usado em sites que recusam user-agents desconhecidos. */
  ua?: 'browser' | 'bot';
  /** Codificação do corpo quando o servidor não usa UTF-8 (ex.: 'latin1'). */
  encoding?: string;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function request(url: string, opts: FetchOpts, accept: string): Promise<Response> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 25_000);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        body: opts.body,
        signal,
        redirect: 'follow',
        headers: {
          'user-agent': opts.ua === 'bot' ? BOT_UA : BROWSER_UA,
          accept,
          'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          ...opts.headers,
        },
      });
      if (res.ok || res.status === 304) return res;
      const body = await res.text().catch(() => '');
      const err = new HttpError(res.status, url, body);
      // 4xx (exceto 429) não melhora tentando de novo.
      if (res.status !== 429 && res.status < 500) throw err;
      lastErr = err;
      const retryAfter = Number(res.headers.get('retry-after'));
      if (attempt < retries) {
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1500 * 2 ** attempt;
        await sleep(wait, opts.signal);
      }
    } catch (err) {
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err;
      if (opts.signal?.aborted) throw err;
      lastErr = err;
      if (attempt < retries) await sleep(1500 * 2 ** attempt, opts.signal);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await request(url, opts, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  if (opts.encoding) return new TextDecoder(opts.encoding).decode(await res.arrayBuffer());
  return res.text();
}

export async function fetchJson<T = any>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await request(url, opts, 'application/json, text/plain, */*');
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Resposta não é JSON em ${url}: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
  }
}

/**
 * GET condicional: manda o ETag da última resposta e, se o servidor disser que nada mudou (304),
 * devolve `notModified` sem baixar o corpo de novo.
 */
export async function fetchJsonIfChanged<T = any>(
  url: string,
  etag: string | undefined,
  opts: FetchOpts = {},
): Promise<{ notModified: true } | { notModified: false; data: T; etag?: string }> {
  const res = await request(url, { ...opts, headers: { ...opts.headers, ...(etag ? { 'if-none-match': etag } : {}) } }, 'application/json');
  if (res.status === 304) return { notModified: true };
  const text = await res.text();
  try {
    return { notModified: false, data: JSON.parse(text) as T, etag: res.headers.get('etag') ?? undefined };
  } catch {
    throw new Error(`Resposta não é JSON em ${url}: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
  }
}

/** Executa fn para cada item com no máximo `limit` chamadas simultâneas. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
