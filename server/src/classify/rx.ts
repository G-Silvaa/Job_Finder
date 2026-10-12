/**
 * Monta uma regex para texto normalizado (minúsculo, sem acento) com fronteiras que
 * funcionam também para termos como ".net", "c#" e "c++" (onde \b do JS falha).
 */
export function rx(source: string, flags = 'g'): RegExp {
  return new RegExp(`(?<![a-z0-9])(?:${source})(?![a-z0-9])`, flags);
}

export function test(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  return re.test(text);
}

/** Posição da primeira ocorrência, ou -1. */
export function firstIndex(re: RegExp, text: string): number {
  re.lastIndex = 0;
  const m = re.exec(text);
  return m ? m.index : -1;
}

export function countMatches(re: RegExp, text: string, cap = 50): number {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) && n < cap) n++;
  return n;
}
