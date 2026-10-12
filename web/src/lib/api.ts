import type { JobDetail, JobsResponse, Mark, SourcesResponse, Stats } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* corpo não é JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  jobs: (params: URLSearchParams, signal?: AbortSignal) => request<JobsResponse>(`/api/jobs?${params}`, { signal }),
  job: (id: string, signal?: AbortSignal) => request<JobDetail>(`/api/jobs/${encodeURIComponent(id)}`, { signal }),
  mark: (id: string, patch: Partial<Pick<Mark, 'favorite' | 'applied' | 'hidden'>>) =>
    request<{ mark: Mark }>(`/api/jobs/${encodeURIComponent(id)}/mark`, { method: 'POST', body: JSON.stringify(patch) }),
  stats: (since?: string | null) => request<Stats>(`/api/stats${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  sources: () => request<SourcesResponse>('/api/sources'),
  /** Sem `sources`, atualiza tudo respeitando o intervalo de cada fonte; com `sources`, força só essas. */
  collect: (sources?: string[]) =>
    request<{ started: boolean }>('/api/collect', { method: 'POST', body: JSON.stringify({ sources, force: !!sources?.length }) }),
};
