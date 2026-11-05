const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export function timeAgo(iso: string): string {
  const elapsed = new Date(iso).getTime() - Date.now();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return relative.format(Math.trunc(elapsed / ms), unit);
  }
  return 'just now';
}

/** Absolute times always carry the zone, so nobody has to guess whose clock it is. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  if (min === null && max === null) return null;
  const amount = (value: number) => new Intl.NumberFormat('en').format(value);
  const range =
    min !== null && max !== null
      ? `${amount(min)} – ${amount(max)}`
      : amount((min ?? max) as number);
  return currency ? `${range} ${currency}` : range;
}
