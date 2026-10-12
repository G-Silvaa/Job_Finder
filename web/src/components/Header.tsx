import { Database, LoaderCircle, Monitor, Moon, RotateCw, Search, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { relativeTime } from '../lib/format';
import type { Stats } from '../lib/types';

export type Theme = 'system' | 'light' | 'dark';

interface Props {
  q: string;
  onSearch: (q: string) => void;
  stats: Stats | null;
  collecting: boolean;
  progress: { done: number; total: number } | null;
  onCollect: () => void;
  onOpenSources: () => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
}

export function Logo() {
  return (
    <a href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Radar de Vagas — início">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-lime shadow-[0_0_0_1px_rgb(255_255_255/0.06)_inset]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="8.5" opacity=".35" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 12 18 6" className="origin-[12px_12px] transition-transform duration-700 group-hover:rotate-[360deg]" />
        </svg>
      </span>
      <span className="hidden leading-none sm:block">
        <span className="font-display text-[19px] font-extrabold tracking-[-0.04em]">Radar</span>{' '}
        <span className="font-serif text-[20px] italic">de vagas</span>
      </span>
    </a>
  );
}

const iconBtn =
  'flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-fg transition hover:border-line-strong hover:bg-surface-2';

export function Header({ q, onSearch, stats, collecting, progress, onCollect, onOpenSources, theme, onTheme }: Props) {
  const [value, setValue] = useState(q);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(q), [q]);

  // busca enquanto digita (com pequena espera)
  useEffect(() => {
    if (value === q) return;
    const t = setTimeout(() => onSearch(value), 300);
    return () => clearTimeout(t);
  }, [value, q, onSearch]);

  // "/" ou Ctrl+K focam a busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select');
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Logo />

        <form
          className="relative max-w-2xl flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(value);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Buscar cargo, empresa, tecnologia…"
            aria-label="Buscar vagas"
            className="h-11 w-full rounded-full border border-line bg-surface pr-20 pl-11 text-[15px] outline-none transition placeholder:text-faint focus:border-line-strong focus:shadow-[0_0_0_4px_rgb(215_255_60/0.35)]"
          />
          {value ? (
            <button
              type="button"
              onClick={() => {
                setValue('');
                onSearch('');
              }}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-faint sm:block">
              Ctrl K
            </kbd>
          )}
        </form>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden text-right font-mono text-[11px] leading-tight tracking-wide text-muted uppercase xl:block">
            {collecting ? (
              <span className="text-fg">{progress ? `Coletando ${progress.done}/${progress.total} fontes` : 'Coletando…'}</span>
            ) : stats?.lastCollectAt ? (
              <>
                Atualizado
                <br />
                <span className="text-fg">{relativeTime(stats.lastCollectAt)}</span>
              </>
            ) : (
              'Ainda não atualizado'
            )}
          </div>
          <button
            onClick={onCollect}
            disabled={collecting}
            title={collecting ? 'Buscando vagas novas…' : 'Buscar vagas novas agora'}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-invert px-4 text-sm font-semibold text-invert-fg transition hover:bg-lime hover:text-ink disabled:cursor-progress disabled:opacity-90"
          >
            {collecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            <span className="hidden md:inline">{collecting ? 'Atualizando' : 'Atualizar'}</span>
          </button>
          <button onClick={onOpenSources} title="Fontes de vagas" aria-label="Fontes de vagas" className={iconBtn}>
            <Database className="h-4 w-4" />
          </button>
          <button
            onClick={() => onTheme(nextTheme[theme])}
            title={`Tema: ${theme === 'system' ? 'automático' : theme === 'light' ? 'claro' : 'escuro'}`}
            aria-label="Trocar tema"
            className={`${iconBtn} hidden sm:flex`}
          >
            <ThemeIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      {collecting && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
          <div
            className="h-full bg-lime transition-all duration-700"
            style={{ width: `${progress ? Math.max(4, (progress.done / Math.max(1, progress.total)) * 100) : 8}%` }}
          />
        </div>
      )}
    </header>
  );
}
