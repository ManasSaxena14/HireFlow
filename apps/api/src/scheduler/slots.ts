import { DateTime } from 'luxon';

/** A span of real time, in milliseconds since 1970. The end is not part of the span. */
export interface Span {
  start: number;
  end: number;
}

export interface WeeklyRule {
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  validFrom: string | null;
  validTo: string | null;
}

const STEP_MS = 15 * 60 * 1000;

/**
 * Turns weekly hours into real times. Each date is worked out on its own in the person's zone,
 * so "9 to 5" stays 9 to 5 on their clock when the clocks change.
 */
export function expandRules(rules: WeeklyRule[], range: Span): Span[] {
  const spans: Span[] = [];
  for (const rule of rules) {
    // One extra day each side, because the date in their zone can differ from the date in UTC.
    let day = DateTime.fromMillis(range.start, { zone: rule.timezone })
      .startOf('day')
      .minus({ days: 1 });
    const lastDay = DateTime.fromMillis(range.end, { zone: rule.timezone })
      .startOf('day')
      .plus({ days: 1 });

    for (; day <= lastDay; day = day.plus({ days: 1 })) {
      if (day.weekday % 7 !== rule.weekday) continue;
      const date = day.toISODate() as string;
      if (rule.validFrom && date < rule.validFrom) continue;
      if (rule.validTo && date > rule.validTo) continue;
      const start = DateTime.fromISO(`${date}T${rule.startTime}`, { zone: rule.timezone });
      const end = DateTime.fromISO(`${date}T${rule.endTime}`, { zone: rule.timezone });
      if (end > start) spans.push({ start: start.toMillis(), end: end.toMillis() });
    }
  }
  return merge(spans);
}

export function merge(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

export function subtract(spans: Span[], taken: Span[]): Span[] {
  const blocks = merge(taken);
  const free: Span[] = [];
  for (const span of merge(spans)) {
    let cursor = span.start;
    for (const block of blocks) {
      if (block.end <= cursor) continue;
      if (block.start >= span.end) break;
      if (block.start > cursor) free.push({ start: cursor, end: block.start });
      cursor = Math.max(cursor, block.end);
    }
    if (cursor < span.end) free.push({ start: cursor, end: span.end });
  }
  return free;
}

export function intersect(a: Span[], b: Span[]): Span[] {
  const shared: Span[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const left = a[i] as Span;
    const right = b[j] as Span;
    const start = Math.max(left.start, right.start);
    const end = Math.min(left.end, right.end);
    if (start < end) shared.push({ start, end });
    if (left.end < right.end) i++;
    else j++;
  }
  return shared;
}

/** Start times sit on the quarter hour, so a late start like 10:07 is never offered. */
export function sliceSlots(free: Span[], durationMs: number, max: number): Span[] {
  const slots: Span[] = [];
  for (const span of free) {
    let start = Math.ceil(span.start / STEP_MS) * STEP_MS;
    for (; start + durationMs <= span.end; start += STEP_MS) {
      slots.push({ start, end: start + durationMs });
      if (slots.length === max) return slots;
    }
  }
  return slots;
}

export interface SuggestInput {
  range: Span;
  durationMs: number;
  max: number;
  people: { rules: WeeklyRule[]; busy: Span[] }[];
  candidateBusy: Span[];
}

export function suggest(input: SuggestInput): Span[] {
  const { range, durationMs, max, people, candidateBusy } = input;
  let free: Span[] = [range];
  for (const person of people) {
    const windows = subtract(expandRules(person.rules, range), person.busy);
    free = intersect(free, windows);
  }
  return sliceSlots(subtract(free, candidateBusy), durationMs, max);
}
