import { useState } from 'react';
import { initials } from '../lib/format';

/** Logo da empresa; sem logo (ou se a imagem falhar), mostra as iniciais. Use `key` por vaga para reiniciar o estado. */
export function CompanyLogo({ name, logo, size = 'md' }: { name: string; logo?: string; size?: 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const box = size === 'lg' ? 'h-14 w-14 rounded-2xl text-lg' : 'h-11 w-11 rounded-[12px] text-[13px]';
  if (logo && !failed) {
    return (
      <span className={`${box} flex shrink-0 items-center justify-center overflow-hidden border border-line bg-white p-1.5`}>
        <img src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span aria-hidden className={`${box} flex shrink-0 items-center justify-center border border-line bg-surface-2 font-display font-bold tracking-tight text-fg/70`}>
      {initials(name || '?')}
    </span>
  );
}
