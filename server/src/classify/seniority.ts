import type { Seniority } from '../types.js';
import { rx } from './rx.js';

const LEVELS: [Seniority, RegExp][] = [
  [
    'lead',
    rx(
      'tech\\s?lead|team\\s?lead|lead|leader|lider(?:anca)?(?:\\stecnic[oa])?|principal|staff|head|arquitet[oa]|architect|engineering\\smanager|gerente|manager|coordenador(?:a)?|especialista|specialist|expert|distinguished|director|diretor(?:a)?|vp|cto|iv|v',
    ),
  ],
  ['intern', rx('estagi(?:o|ari[oa]s?)|intern(?:ship)?|trainee|aprendiz|working\\sstudent|apprentice')],
  ['senior', rx('senior|sr\\.?|iii|experiente|experienced')],
  ['mid', rx('pleno|pl(?!\\s*/\\s*sql)|mid[\\s-]?level|mid|intermediate|intermediari[oa]|ii')],
  ['junior', rx('junior|jr\\.?|entry[\\s-]?level|associate|graduate|new\\sgrad|recem[\\s-]formad[oa]|i')],
];

const LABEL_LEVELS: [Seniority, RegExp][] = [
  ['intern', rx('estagio|estagiari[oa]|intern(?:ship)?|trainee')],
  ['junior', rx('junior|jr')],
  ['mid', rx('pleno|mid[\\s-]?level')],
  ['senior', rx('senior|sr')],
  ['lead', rx('especialista|lead|staff|principal|tech\\s?lead|lider')],
];

const ROMAN_SUFFIX = /^\s(?:i|v)\s*(?:[-–|(,:].*)?$/;

/** Posição da primeira ocorrência válida do nível no título, ou -1. */
function findInTitle(re: RegExp, title: string): number {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title))) {
    // "i" e "v" sozinhos só valem como numeral no fim do título ("Software Engineer II", "Engineer I - Payments")
    if ((m[0] === 'i' || m[0] === 'v') && !ROMAN_SUFFIX.test(title.slice(m.index - 1))) continue;
    return m.index;
  }
  return -1;
}

/** Nível pelo título; se não houver, pela dica da fonte, pelas tags e pelos anos de experiência pedidos. */
export function classifySeniority(titleNorm: string, textNorm: string, tagsNorm: string, hint?: Seniority): Seniority {
  let best: Seniority = 'unknown';
  let bestPos = Infinity;
  for (const [level, re] of LEVELS) {
    const pos = findInTitle(re, titleNorm);
    if (pos < 0) continue;
    // liderança vence quando aparece junto com outro nível ("Senior Tech Lead");
    // nos demais, vale o que aparece primeiro ("Pleno/Sênior" -> pleno)
    const rank = level === 'lead' ? -1 : pos;
    if (rank < bestPos) {
      best = level;
      bestPos = rank;
    }
  }
  if (best !== 'unknown') return best;

  if (hint && hint !== 'unknown') return hint;

  if (tagsNorm) {
    for (const [level, re] of LABEL_LEVELS) {
      re.lastIndex = 0;
      if (re.test(tagsNorm)) return level;
    }
  }

  // "5+ years of experience", "3 anos de experiência"
  const yrs =
    /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|anos?|yrs)(?:\s+(?:or\smore|ou\smais))?(?:\s+(?:of|de))?(?:\s+\w+){0,3}?\s+(?:experien|exp\b|atuacao|working|hands-on)/.exec(
      textNorm,
    );
  if (yrs) {
    const n = Number(yrs[1]);
    if (n >= 1 && n <= 20) {
      if (n >= 5) return 'senior';
      if (n >= 3) return 'mid';
      return 'junior';
    }
  }
  return 'unknown';
}
