import { ArrowUpRight, Brain, Check, ChevronDown, ChevronUp, EyeOff, LoaderCircle, Sparkles, Star, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { formatSalary, fullDate, relativeTime } from '../lib/format';
import { AI_HINT, REGION_LABEL, SENIORITY_LABEL, STACK_DOT, STACK_LABEL, WORKMODE_LABEL } from '../lib/labels';
import type { JobDetail, JobSummary, Mark } from '../lib/types';
import { CompanyLogo } from './CompanyLogo';
import { RegionIcon } from './RegionIcon';

interface Props {
  id: string;
  /** Versão resumida (da lista) para mostrar algo enquanto a descrição carrega. */
  preview?: JobSummary;
  sourceName: (id: string) => string;
  /** true para sites de carreira das empresas (o botão diz "Abrir vaga no site da empresa"). */
  isCompanySite: (sourceId: string) => boolean;
  onClose: () => void;
  onMark: (job: JobSummary, patch: Partial<Pick<Mark, 'favorite' | 'applied' | 'hidden'>>) => void;
  onPrev?: () => void;
  onNext?: () => void;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-line py-3">
      <dt className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-[14px] font-medium">{children}</dd>
    </div>
  );
}

const toolBtn =
  'inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium transition hover:border-line-strong hover:bg-surface-2';

export function JobDrawer({ id, preview, sourceName, isCompanySite, onClose, onMark, onPrev, onNext }: Props) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setDetail(null);
    setError(null);
    scroller.current?.scrollTo({ top: 0 });
    api
      .job(id, ctrl.signal)
      .then(setDetail)
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e.message);
      });
    return () => ctrl.abort();
  }, [id]);

  // a marcação pode mudar pelo card; a versão da lista é a mais atual
  const job: JobSummary | null = detail ? { ...detail, mark: preview?.mark ?? detail.mark } : (preview ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === 'Escape') onClose();
      else if ((e.key === 'ArrowDown' || e.key === 'j') && onNext) (e.preventDefault(), onNext());
      else if ((e.key === 'ArrowUp' || e.key === 'k') && onPrev) (e.preventDefault(), onPrev());
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose, onNext, onPrev]);

  const salary = formatSalary(job?.salary);
  const date = job?.publishedAt ?? job?.firstSeenAt;

  return (
    <aside className="flex h-full flex-col bg-surface" aria-label="Detalhes da vaga" style={{ animation: 'slide-in .3s cubic-bezier(.2,.7,.2,1)' }}>
      <div className="flex items-center gap-1 border-b border-line px-3 py-2.5">
        <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-fg" title="Fechar (Esc)" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
        <button onClick={onPrev} disabled={!onPrev} className="rounded-full p-2 text-muted hover:bg-surface-2 disabled:opacity-30" title="Vaga anterior (↑ ou k)">
          <ChevronUp className="h-5 w-5" />
        </button>
        <button onClick={onNext} disabled={!onNext} className="rounded-full p-2 text-muted hover:bg-surface-2 disabled:opacity-30" title="Próxima vaga (↓ ou j)">
          <ChevronDown className="h-5 w-5" />
        </button>
        {job && (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => onMark(job, { favorite: !job.mark?.favorite })}
              className={`${toolBtn} ${job.mark?.favorite ? 'border-amber-400/60 text-amber-600 dark:text-amber-400' : ''}`}
            >
              <Star className="h-4 w-4" fill={job.mark?.favorite ? 'currentColor' : 'none'} />
              <span className="hidden sm:inline">{job.mark?.favorite ? 'Favorita' : 'Favoritar'}</span>
            </button>
            <button
              onClick={() => onMark(job, { applied: !job.mark?.applied })}
              title="Marque para lembrar que já se candidatou"
              className={`${toolBtn} ${job.mark?.applied ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400' : ''}`}
            >
              <Check className="h-4 w-4" />
              <span className="hidden sm:inline">{job.mark?.applied ? 'Candidatura ✓' : 'Me candidatei'}</span>
            </button>
            <button
              onClick={() => onMark(job, { hidden: !job.mark?.hidden })}
              title={job.mark?.hidden ? 'Voltar a mostrar esta vaga' : 'Esconder esta vaga da lista'}
              className={toolBtn}
            >
              <EyeOff className="h-4 w-4" />
              <span className="hidden sm:inline">{job.mark?.hidden ? 'Mostrar' : 'Ocultar'}</span>
            </button>
          </div>
        )}
      </div>

      <div ref={scroller} className="thin-scroll flex-1 overflow-y-auto">
        {!job && !error && (
          <div className="flex h-40 items-center justify-center text-muted">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </div>
        )}
        {error && <p className="p-6 text-rose-600">{error}</p>}
        {job && (
          <div className="px-5 pt-6 pb-12 sm:px-8">
            <div className="flex items-center gap-3">
              <CompanyLogo key={job.id} name={job.company || job.title} logo={job.companyLogo} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{job.company || 'Empresa não informada'}</p>
                <p className="font-mono text-[10.5px] tracking-[0.12em] text-muted uppercase">
                  {sourceName(job.source)} · {date ? relativeTime(date) : ''}
                </p>
              </div>
            </div>

            <h2 className="mt-5 font-display text-[28px] leading-[1.08] font-bold tracking-[-0.035em] sm:text-[34px]">{job.title}</h2>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {job.isNew && <span className="rounded-full bg-lime px-2.5 py-0.5 font-mono text-[11px] font-bold text-ink uppercase">Nova</span>}
              {job.ai.categories.includes('vibe') && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  <Sparkles className="h-3 w-3" /> Vibe coding
                </span>
              )}
              {job.ai.categories.includes('llm') && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  <Brain className="h-3 w-3" /> IA / LLM
                </span>
              )}
              {!job.active && <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600">Encerrada</span>}
            </div>

            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-6 flex h-13 w-full items-center justify-between rounded-full bg-invert pr-2 pl-6 text-[15px] font-semibold text-invert-fg transition hover:bg-lime hover:text-ink"
            >
              {isCompanySite(job.source) ? 'Abrir vaga no site da empresa' : `Abrir vaga em ${sourceName(job.source)}`}
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime text-ink transition group-hover:bg-ink group-hover:text-lime">
                <ArrowUpRight className="h-4.5 w-4.5 transition-transform group-hover:rotate-45" />
              </span>
            </a>
            {job.alsoOn.length > 0 && (
              <p className="mt-2.5 text-center text-xs text-muted">
                Também anunciada em{' '}
                {job.alsoOn.map((a, i) => (
                  <span key={a.url}>
                    {i > 0 && ', '}
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg"
                    >
                      {sourceName(a.source)}
                      {a.location ? ` (${a.location})` : ''}
                    </a>
                  </span>
                ))}
              </p>
            )}

            <dl className="mt-7 grid grid-cols-2 gap-x-6">
              <Meta label="Local">
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {job.regions.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1">
                      <RegionIcon region={r} /> {REGION_LABEL[r]}
                    </span>
                  ))}
                </span>
                {job.location && <span className="mt-0.5 block text-[13px] font-normal text-muted">{job.location}</span>}
              </Meta>
              <Meta label="Modelo">{WORKMODE_LABEL[job.workMode]}</Meta>
              <Meta label="Área">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${STACK_DOT[job.stack]}`} /> {STACK_LABEL[job.stack]}
                </span>
              </Meta>
              <Meta label="Nível">{SENIORITY_LABEL[job.seniority]}</Meta>
              <Meta label="Salário">{salary || <span className="text-muted">Não informado</span>}</Meta>
              <Meta label="Contrato">{job.employmentType || <span className="text-muted">Não informado</span>}</Meta>
            </dl>

            {job.ai.categories.length > 0 && (
              <section className="mt-7 rounded-[22px] bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-500 p-[1px]">
                <div className="rounded-[21px] bg-surface p-5">
                  <h3 className="flex items-center gap-2 font-display text-[17px] font-bold tracking-tight">
                    <Sparkles className="h-4 w-4 text-fuchsia-500" />
                    Por que é vaga de <span className="text-ai">IA</span>
                  </h3>
                  <ul className="mt-2 space-y-1 text-[13px] text-muted">
                    {job.ai.categories.map((c) => (
                      <li key={c}>
                        <strong className="font-semibold text-fg">{c === 'vibe' ? 'IA para programar' : 'Engenharia de IA'}:</strong> {AI_HINT[c]}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {job.ai.matches.map((m) => (
                      <span key={m} className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px]">
                        {m}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-muted">Os termos aparecem destacados na descrição.</p>
                </div>
              </section>
            )}

            {job.techs.length > 0 && (
              <section className="mt-7">
                <h3 className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">Tecnologias citadas</h3>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {job.techs.map((t) => (
                    <span key={t} className="rounded-full bg-surface-2 px-3 py-1 font-mono text-[12px]">
                      {t}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-8">
              <h3 className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">Descrição</h3>
              {detail ? (
                detail.descriptionHtml ? (
                  <div className="job-description mt-3" dangerouslySetInnerHTML={{ __html: detail.descriptionHtml }} />
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    A descrição desta vaga ainda não foi baixada (ou a fonte não a fornece). Abra a vaga original para ver todos os detalhes.
                  </p>
                )
              ) : (
                <div className="mt-4 space-y-2.5">
                  {[92, 80, 86, 60, 75, 68].map((w, i) => (
                    <div key={i} className="skeleton h-3.5 rounded-full" style={{ width: `${w}%` }} />
                  ))}
                </div>
              )}
            </section>

            <footer className="mt-10 border-t border-line pt-4 font-mono text-[11px] leading-relaxed text-muted">
              <p>
                Fonte: {sourceName(job.source)}
                {date && ` · publicada ${relativeTime(date)} (${fullDate(date)})`}
              </p>
              <p>
                Vista pela primeira vez em {fullDate(job.firstSeenAt)} · conferida {relativeTime(job.lastSeenAt)}
              </p>
              {!job.active && <p className="mt-1 text-rose-600">Esta vaga não aparece mais na fonte (provavelmente encerrada).</p>}
            </footer>
          </div>
        )}
      </div>
    </aside>
  );
}
