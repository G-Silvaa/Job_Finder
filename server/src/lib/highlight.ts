/**
 * Envolve em <mark> os trechos de um HTML (já sanitizado) que casam com as regexes.
 * As regexes são escritas para texto normalizado (minúsculo, sem acento); para achar as posições
 * certas no texto original, normalizamos caractere a caractere mantendo o mesmo tamanho.
 */
function normSameLength(s: string): string {
  let out = '';
  for (const ch of s) {
    let n = ch
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    if (n.length !== ch.length) n = ch.length === 1 ? (n[0] ?? ' ') : ch;
    out += n;
  }
  return out;
}

export function highlightHtml(html: string, patterns: RegExp[]): string {
  if (!patterns.length || !html) return html;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (!part || part.startsWith('<')) return part;
      const normed = normSameLength(part);
      const ranges: [number, number][] = [];
      for (const re of patterns) {
        const g = new RegExp(re.source, 'g');
        for (const m of normed.matchAll(g)) {
          if (m[0].length) ranges.push([m.index!, m.index! + m[0].length]);
        }
      }
      if (!ranges.length) return part;
      ranges.sort((a, b) => a[0] - b[0]);
      const merged: [number, number][] = [];
      for (const r of ranges) {
        const last = merged[merged.length - 1];
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else merged.push([...r]);
      }
      let out = '';
      let pos = 0;
      for (const [a, b] of merged) {
        out += part.slice(pos, a) + '<mark>' + part.slice(a, b) + '</mark>';
        pos = b;
      }
      return out + part.slice(pos);
    })
    .join('');
}
