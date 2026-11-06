import { describe, expect, it } from 'vitest';
import { toIcs } from '../src/scheduler/ics.js';
import {
  expandRules,
  intersect,
  merge,
  sliceSlots,
  type Span,
  subtract,
  suggest,
  type WeeklyRule,
} from '../src/scheduler/slots.js';

const SUNDAY = 0;
const HOUR = 60 * 60 * 1000;
const at = (iso: string) => Date.parse(iso);
const span = (start: string, end: string): Span => ({ start: at(start), end: at(end) });
const iso = (spans: Span[]) =>
  spans.map(({ start, end }) => [new Date(start).toISOString(), new Date(end).toISOString()]);
const rule = (
  timezone: string,
  weekday: number,
  startTime: string,
  endTime: string,
): WeeklyRule => ({
  timezone,
  weekday,
  startTime,
  endTime,
  validFrom: null,
  validTo: null,
});

describe('weekly hours across clock changes', () => {
  it('New York spring forward: the morning is one hour shorter in real time', () => {
    const spans = expandRules(
      [rule('America/New_York', SUNDAY, '01:00', '04:00')],
      span('2027-03-14T00:00:00Z', '2027-03-15T00:00:00Z'),
    );
    // 01:00 EST is 06:00 UTC, and 04:00 EDT is 08:00 UTC.
    expect(iso(spans)).toEqual([['2027-03-14T06:00:00.000Z', '2027-03-14T08:00:00.000Z']]);
  });

  it('New York fall back: the morning is one hour longer in real time', () => {
    const spans = expandRules(
      [rule('America/New_York', SUNDAY, '00:00', '03:00')],
      span('2027-11-07T00:00:00Z', '2027-11-08T00:00:00Z'),
    );
    // 00:00 EDT is 04:00 UTC, and 03:00 EST is 08:00 UTC.
    expect(iso(spans)).toEqual([['2027-11-07T04:00:00.000Z', '2027-11-07T08:00:00.000Z']]);
  });

  it('New York: 9 o clock stays 9 o clock on the wall on both sides of the change', () => {
    const spans = expandRules(
      [rule('America/New_York', SUNDAY, '09:00', '10:00')],
      span('2027-03-07T00:00:00Z', '2027-03-15T00:00:00Z'),
    );
    expect(iso(spans)).toEqual([
      ['2027-03-07T14:00:00.000Z', '2027-03-07T15:00:00.000Z'],
      ['2027-03-14T13:00:00.000Z', '2027-03-14T14:00:00.000Z'],
    ]);
  });

  it('London spring forward moves 9 o clock to a different real time', () => {
    const spans = expandRules(
      [rule('Europe/London', SUNDAY, '09:00', '10:00')],
      span('2027-03-21T00:00:00Z', '2027-03-29T00:00:00Z'),
    );
    expect(iso(spans)).toEqual([
      ['2027-03-21T09:00:00.000Z', '2027-03-21T10:00:00.000Z'],
      ['2027-03-28T08:00:00.000Z', '2027-03-28T09:00:00.000Z'],
    ]);
  });

  it('London fall back: the night hours cover three real hours', () => {
    const spans = expandRules(
      [rule('Europe/London', SUNDAY, '00:30', '02:30')],
      span('2027-10-30T12:00:00Z', '2027-10-31T12:00:00Z'),
    );
    expect(iso(spans)).toEqual([['2027-10-30T23:30:00.000Z', '2027-10-31T02:30:00.000Z']]);
  });

  it('a slot across the change keeps its real length', () => {
    const slots = sliceSlots(
      expandRules(
        [rule('America/New_York', SUNDAY, '01:00', '04:00')],
        span('2027-03-14T00:00:00Z', '2027-03-15T00:00:00Z'),
      ),
      HOUR,
      50,
    );
    // 01:30 EST to 03:30 EDT is one real hour, even though the clock moves two.
    expect(iso(slots)).toContainEqual(['2027-03-14T06:30:00.000Z', '2027-03-14T07:30:00.000Z']);
    expect(slots.every((slot) => slot.end - slot.start === HOUR)).toBe(true);
    expect(slots).toHaveLength(5);
  });

  it('uses half hour zones and the date in the zone of the person', () => {
    const spans = expandRules(
      [rule('Asia/Kolkata', 1, '01:00', '02:00')],
      span('2027-01-03T12:00:00Z', '2027-01-04T12:00:00Z'),
    );
    // 01:00 on Monday in India is still Sunday in UTC.
    expect(iso(spans)).toEqual([['2027-01-03T19:30:00.000Z', '2027-01-03T20:30:00.000Z']]);
  });

  it('respects the first and last day of a rule', () => {
    const spans = expandRules(
      [
        {
          ...rule('UTC', SUNDAY, '09:00', '10:00'),
          validFrom: '2027-01-10',
          validTo: '2027-01-10',
        },
      ],
      span('2027-01-01T00:00:00Z', '2027-02-01T00:00:00Z'),
    );
    expect(iso(spans)).toEqual([['2027-01-10T09:00:00.000Z', '2027-01-10T10:00:00.000Z']]);
  });
});

describe('working with spans', () => {
  it('joins spans that touch or overlap', () => {
    expect(
      merge([
        { start: 5, end: 7 },
        { start: 0, end: 2 },
        { start: 2, end: 3 },
        { start: 6, end: 9 },
      ]),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 9 },
    ]);
  });

  it('cuts taken time out of free time', () => {
    expect(
      subtract(
        [{ start: 0, end: 10 }],
        [
          { start: 2, end: 3 },
          { start: 5, end: 6 },
          { start: 9, end: 12 },
        ],
      ),
    ).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 9 },
    ]);
  });

  it('keeps only the time both sides share', () => {
    expect(
      intersect(
        [
          { start: 0, end: 4 },
          { start: 6, end: 10 },
        ],
        [{ start: 2, end: 8 }],
      ),
    ).toEqual([
      { start: 2, end: 4 },
      { start: 6, end: 8 },
    ]);
  });

  it('starts slots on the quarter hour and stops at the limit', () => {
    const free = [span('2027-01-04T09:07:00Z', '2027-01-04T10:00:00Z')];
    const slots = sliceSlots(free, 30 * 60 * 1000, 50);
    expect(new Date((slots[0] as Span).start).toISOString()).toBe('2027-01-04T09:15:00.000Z');
    expect(slots).toHaveLength(2);
    expect(
      sliceSlots([span('2027-01-04T00:00:00Z', '2027-01-05T00:00:00Z')], HOUR, 50),
    ).toHaveLength(50);
  });

  it('finds time when every interviewer and the candidate are free', () => {
    const slots = suggest({
      range: span('2027-01-03T00:00:00Z', '2027-01-04T00:00:00Z'),
      durationMs: HOUR,
      max: 50,
      people: [
        { rules: [rule('UTC', SUNDAY, '09:00', '13:00')], busy: [] },
        {
          rules: [rule('UTC', SUNDAY, '10:00', '15:00')],
          busy: [span('2027-01-03T11:00:00Z', '2027-01-03T11:30:00Z')],
        },
      ],
      candidateBusy: [span('2027-01-03T12:30:00Z', '2027-01-03T13:00:00Z')],
    });
    expect(iso(slots)).toEqual([
      ['2027-01-03T10:00:00.000Z', '2027-01-03T11:00:00.000Z'],
      ['2027-01-03T11:30:00.000Z', '2027-01-03T12:30:00.000Z'],
    ]);
  });
});

describe('calendar files', () => {
  const event = {
    id: 'abc',
    start: new Date('2027-01-04T09:00:00Z'),
    end: new Date('2027-01-04T10:00:00Z'),
    title: 'Interview: Dev, Backend; team',
    description: 'With Riya.\nBring your laptop',
    url: 'https://meet.example.com/room',
    cancelled: false,
  };

  it('writes times in UTC and escapes special letters', () => {
    const file = toIcs(event, new Date('2027-01-01T00:00:00Z'));
    expect(file).toContain('DTSTART:20270104T090000Z\r\n');
    expect(file).toContain('DTEND:20270104T100000Z\r\n');
    expect(file).toContain('DTSTAMP:20270101T000000Z\r\n');
    expect(file).toContain('SUMMARY:Interview: Dev\\, Backend\\; team\r\n');
    expect(file).toContain('DESCRIPTION:With Riya.\\nBring your laptop\r\n');
    expect(file).toContain('STATUS:CONFIRMED');
    expect(file.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('cannot be tricked into adding lines through a job title', () => {
    const file = toIcs({ ...event, title: 'Dev\r\nATTENDEE:evil@example.com' });
    expect(file).not.toMatch(/^ATTENDEE/m);
  });

  it('keeps every line short enough', () => {
    const file = toIcs({ ...event, description: 'é'.repeat(300) });
    for (const line of file.split('\r\n')) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
  });

  it('marks a cancelled interview', () => {
    expect(toIcs({ ...event, cancelled: true })).toContain('STATUS:CANCELLED');
  });
});
