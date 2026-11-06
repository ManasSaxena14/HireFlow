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

const AVATAR_COLORS = ['#ff4b32', '#5cb8ff', '#ffc24b', '#3ddc97', '#ff6b8a', '#f6f7f8'];

export function avatarColor(name: string): string {
  let total = 0;
  for (const letter of name) total += letter.charCodeAt(0);
  return AVATAR_COLORS[total % AVATAR_COLORS.length] as string;
}

export const zoneLabel = (timeZone: string) => timeZone.replaceAll('_', ' ');

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function dayParts(iso: string, timeZone: string) {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(new Date(iso));
  return {
    weekday: part({ weekday: 'short' }),
    day: part({ day: 'numeric' }),
    month: part({ month: 'short' }),
    long: part({ weekday: 'long', day: 'numeric', month: 'long' }),
  };
}
