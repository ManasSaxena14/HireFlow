const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
  bull: '•',
};

export const decodeEntities = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const hex = code[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });

/**
 * Turns a job description into plain text. The result is only ever shown as text and never
 * as HTML, so a tag that gets through can do no harm. It would just look odd.
 * Some sources escape their HTML, so entities are changed back before the tags are removed.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    decodeEntities(html)
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)\s*>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
