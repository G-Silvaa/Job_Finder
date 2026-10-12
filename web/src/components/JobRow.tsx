import { ArrowUpRight, Brain, Check, Sparkles, Star } from 'lucide-react';
import { memo } from 'react';
import { formatSalary, relativeTime } from '../lib/format';
import { SENIORITY_SHORT, STACK_DOT, STACK_LABEL } from '../lib/labels';
import type { JobSummary } from '../lib/types';
import { CompanyLogo } from './CompanyLogo';
import { RegionIcon } from './RegionIcon';

interface Props {
  job: JobSummary;
  index: number;
  selected: boolean;
  sourceName: (id: string) => string;
  onOpen: (id: string) => void;
  onToggleFavorite: (job: JobSummary) => void;
}

export function AiChips({ job, max = 3 }: { job: JobSummary; max?: number }) {
  if (!job.ai.categories.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {job.ai.categories.includes('vibe') && (
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-2.5 py-[3px] text-[11px] font-semibold text-white">
          <Sparkles className="h-3 w-3" /> Vibe coding
        </span>
      )}
      {job.ai.categories.includes('llm') && (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-[3px] text-[11px] font-semibold text-white">
          <Brain className="h-3 w-3" /> IA / LLM
        </span>
      )}
      <span className="text-ai text-[12px] font-medium">{job.ai.matches.slice(0, max).join(' · ')}</span>
    </span>
  );
}

/** Uma vaga na lista: linha editorial (número, logo, título grande, metadados em mono e seta). */
export const JobRow = memo(function JobRow({ job, index, selected, sourceName, onOpen, onToggleFavorite }: Props) {
  const salary = formatSalary(job.salary);
  const seniority = SENIORITY_SHORT[job.seniority];
  const date = job.publishedAt ?? job.firstSeenAt;
  return (
    <article
      onClick={() => onOpen(job.id)}
      style={{ animationDelay: `${(index % 30) * 18}ms` }}
      className={`group relative grid animate-rise cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-x-4 px-4 py-5 transition-colors sm:grid-cols-[2.25rem_auto_1fr_auto] sm:px-6 ${
        selected ? 'bg-surface-2' : 'hover:bg-surface-2/70'
      } ${job.mark?.applied ? 'opacity-70' : ''}`}
    >
      {selected && <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-lime" />}
      <span className="hidden pt-1 font-mono text-[11px] text-faint tabular-nums sm:block">{String(index + 1).padStart(3, '0')}</span>
      <CompanyLogo name={job.company || job.title} logo={job.companyLogo} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] tracking-[0.1em] text-muted uppercase">
          {job.company && <span className="max-w-[22ch] truncate font-semibold text-fg/80">{job.company}</span>}
          {job.company && <span className="text-faint">/</span>}
          <span className="hidden sm:inline">{sourceName(job.source)}</span>
          <span className="hidden text-faint sm:inline">/</span>
          <time dateTime={date} title={new Date(date).toLocaleString('pt-BR')}>
            {relativeTime(date)}
          </time>
          {job.isNew && <span className="rounded-full bg-lime px-2 py-px font-bold text-ink">Nova</span>}
          {job.alsoOn.length > 0 && (
            <span
              className="cursor-help text-faint"
              title={`Também anunciada em:\n${job.alsoOn.map((a) => `• ${sourceName(a.source)}${a.location ? ` (${a.location})` : ''}`).join('\n')}`}
            >
              +{job.alsoOn.length}
            </span>
          )}
        </div>

        <h3 className="mt-1.5 font-display text-[18px] leading-snug font-semibold tracking-[-0.02em] text-fg sm:text-[20px]">
          <button
            type="button"
            className="text-left decoration-line-strong decoration-1 underline-offset-[5px] group-hover:underline focus:outline-none"
            onClick={(e) => (e.stopPropagation(), onOpen(job.id))}
          >
            {job.title}
          </button>
        </h3>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {job.regions.slice(0, 3).map((r) => (
              <RegionIcon key={r} region={r} />
            ))}
            {/* "Remoto" sozinho já aparece ao lado; aí basta a bandeira */}
            {job.location && !/^(?:100%\s*)?remot[eo]s?$/i.test(job.location.trim()) && <span className="max-w-[34ch] truncate">{job.location}</span>}
          </span>
          {job.workMode === 'remote' && (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Remoto
            </span>
          )}
          {job.workMode === 'hybrid' && <span>Híbrido</span>}
          {job.workMode === 'onsite' && <span>Presencial</span>}
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STACK_DOT[job.stack]}`} />
            {STACK_LABEL[job.stack]}
          </span>
          {seniority && <span>{seniority}</span>}
          {salary && <span className="font-mono text-[12px] font-medium text-fg">{salary}</span>}
        </div>

        {job.ai.categories.length > 0 && (
          <div className="mt-2.5">
            <AiChips job={job} />
          </div>
        )}

        {job.techs.length > 0 && (
          <p className="mt-2 truncate font-mono text-[11.5px] text-faint lowercase">
            {job.techs.slice(0, 8).join(' / ')}
            {job.techs.length > 8 ? ` +${job.techs.length - 8}` : ''}
          </p>
        )}

        {(job.mark?.applied || !job.active) && (
          <p className="mt-2 flex gap-3 text-xs font-semibold">
            {job.mark?.applied && (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" /> Candidatura enviada
              </span>
            )}
            {!job.active && <span className="text-rose-600 dark:text-rose-400">Encerrada</span>}
          </p>
        )}
      </div>

      <div className="flex flex-col items-end gap-2">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Abrir vaga original"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-fg transition group-hover:border-transparent group-hover:bg-lime group-hover:text-ink"
        >
          <ArrowUpRight className="h-4.5 w-4.5 transition-transform duration-300 group-hover:rotate-45" />
        </a>
        <button
          type="button"
          title={job.mark?.favorite ? 'Remover dos favoritos' : 'Favoritar'}
          aria-label={job.mark?.favorite ? 'Remover dos favoritos' : 'Favoritar'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(job);
          }}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-surface ${
            job.mark?.favorite ? 'text-amber-500' : 'text-faint hover:text-fg'
          }`}
        >
          <Star className="h-4.5 w-4.5" fill={job.mark?.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
    </article>
  );
});
