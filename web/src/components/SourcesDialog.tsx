import { ArrowUpRight, CircleAlert, CircleCheck, KeyRound, LoaderCircle, RotateCw, X } from 'lucide-react';
import { useEffect } from 'react';
import { relativeTime } from '../lib/format';
import type { SourceInfo, SourcesResponse } from '../lib/types';
import { RegionIcon } from './RegionIcon';

interface Props {
  data: SourcesResponse | null;
  onClose: () => void;
  onCollect: (sources?: string[]) => void;
}

function StatusIcon({ s, data }: { s: SourceInfo; data: SourcesResponse }) {
  const prog = data.collecting ? data.progress?.sources[s.id] : undefined;
  if (prog?.status === 'running') return <LoaderCircle className="h-4 w-4 animate-spin text-fg" />;
  if (prog?.status === 'pending') return <span className="block h-2 w-2 rounded-full bg-faint" title="Na fila" />;
  if (!s.enabled) return <KeyRound className="h-4 w-4 text-faint" />;
  if (s.run?.lastError) return <CircleAlert className="h-4 w-4 text-rose-500" />;
  if (s.run?.lastSuccessAt) return <CircleCheck className="h-4 w-4 text-emerald-500" />;
  return <span className="block h-2 w-2 rounded-full bg-faint" />;
}

export function SourcesDialog({ data, onClose, onCollect }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const enabled = data?.sources.filter((s) => s.enabled) ?? [];
  const disabled = data?.sources.filter((s) => !s.enabled) ?? [];
  const done = data?.progress ? Object.values(data.progress.sources).filter((p) => p.status !== 'pending' && p.status !== 'running').length : 0;
  const totalProg = data?.progress ? Object.keys(data.progress.sources).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fontes de vagas"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-line bg-surface shadow-soft sm:rounded-[28px]"
      >
        <header className="flex items-start gap-3 px-6 pt-6 pb-4">
          <div className="flex-1">
            <p className="font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">( {enabled.length} fontes ativas )</p>
            <h2 className="mt-1 font-display text-[30px] leading-none font-extrabold tracking-[-0.04em]">
              De onde vêm <span className="font-serif font-normal italic">as vagas</span>
            </h2>
            <p className="mt-2 text-sm text-muted">
              O radar confere cada fonte sozinho, respeitando o intervalo mínimo de cada uma. Aqui você vê o status e pode forçar uma coleta.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex items-center gap-3 border-y border-line bg-surface-2 px-6 py-3">
          {data?.collecting ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <span className="font-mono text-xs tracking-wide uppercase">
                Coletando {done}/{totalProg}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-lime transition-all" style={{ width: `${totalProg ? (done / totalProg) * 100 : 0}%` }} />
              </div>
            </>
          ) : (
            <>
              <span className="flex-1 font-mono text-xs tracking-wide text-muted uppercase">
                {enabled.reduce((n, s) => n + s.active, 0).toLocaleString('pt-BR')} vagas no radar
              </span>
              <button
                onClick={() => onCollect()}
                className="inline-flex items-center gap-2 rounded-full bg-invert px-4 py-2 text-sm font-semibold text-invert-fg transition hover:bg-lime hover:text-ink"
              >
                <RotateCw className="h-4 w-4" /> Atualizar agora
              </button>
            </>
          )}
        </div>

        <div className="thin-scroll flex-1 overflow-y-auto px-2 py-2 sm:px-3">
          {!data && (
            <div className="flex h-32 items-center justify-center">
              <LoaderCircle className="h-6 w-6 animate-spin text-muted" />
            </div>
          )}
          <ul className="divide-y divide-line">
            {[...enabled, ...disabled].map((s) => {
              const prog = data?.collecting ? data.progress?.sources[s.id] : undefined;
              return (
                <li key={s.id} className={`flex gap-3 px-3 py-3.5 ${s.enabled ? '' : 'opacity-60'}`}>
                  <div className="mt-1 flex w-4 justify-center">{data && <StatusIcon s={s} data={data} />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <a
                        href={s.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-display text-[15px] font-bold tracking-tight hover:underline"
                      >
                        {s.name} <ArrowUpRight className="h-3.5 w-3.5 opacity-50" />
                      </a>
                      <span className="flex items-center gap-1">
                        {s.focus.map((r) => (
                          <RegionIcon key={r} region={r} />
                        ))}
                      </span>
                      {s.enabled && <span className="font-mono text-[11px] text-muted">{s.active.toLocaleString('pt-BR')} vagas</span>}
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">{s.description}</p>
                    {!s.enabled && s.requiresEnv.length > 0 && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        Desativada: precisa de chave gratuita. Configure <code className="font-mono">{s.requiresEnv.join(', ')}</code> em{' '}
                        <code className="font-mono">server/.env</code>.
                      </p>
                    )}
                    {s.enabled && (
                      <p className="mt-1 font-mono text-[11px] text-muted">
                        {prog?.status === 'running'
                          ? 'Coletando agora…'
                          : prog?.status === 'done'
                            ? `Concluída: ${prog.kept ?? 0} vagas (${prog.created ?? 0} novas)`
                            : prog?.status === 'skipped'
                              ? `Pulada (${prog.note})`
                              : s.run?.lastSuccessAt
                                ? `Última coleta ${relativeTime(s.run.lastSuccessAt)} · ${s.run.lastCount ?? 0} de ${s.run.lastFetched ?? 0} anúncios eram vagas dev válidas`
                                : 'Ainda não coletada'}
                      </p>
                    )}
                    {(prog?.error || s.run?.lastError) && (
                      <p className="mt-1 text-xs break-words text-rose-600 dark:text-rose-400">Erro: {prog?.error ?? s.run?.lastError}</p>
                    )}
                    {s.run?.lastWarnings?.map((w) => (
                      <p key={w} className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        Aviso: {w}
                      </p>
                    ))}
                  </div>
                  {s.enabled && !data?.collecting && (
                    <button
                      onClick={() => onCollect([s.id])}
                      title="Coletar só esta fonte agora"
                      className="self-start rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
                    >
                      <RotateCw className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="px-3 py-4 text-xs text-muted">
            LinkedIn, Indeed, Glassdoor e Catho não estão aqui de propósito: os termos de uso deles proíbem coleta automática e eles bloqueiam
            robôs. Para cobrir vagas parecidas, ative Adzuna e Jooble (chaves gratuitas) no <code>server/.env</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
