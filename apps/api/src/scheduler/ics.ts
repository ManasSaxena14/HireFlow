export interface CalendarEvent {
  id: string;
  start: Date;
  end: Date;
  title: string;
  description: string;
  url: string | null;
  cancelled: boolean;
}

const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');

const escapeText = (value: string) =>
  value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

/** The calendar format allows 75 bytes on a line. Longer lines go on, starting with a space. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const letter of line) {
    const bytes = Buffer.byteLength(letter);
    if (size + bytes > 73) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += letter;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function toIcs(event: CalendarEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HireFlow//Interviews//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@hireflow`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.url ? [`LOCATION:${escapeText(event.url)}`, `URL:${event.url}`] : []),
    `STATUS:${event.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
