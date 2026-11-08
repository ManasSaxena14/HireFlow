import { z } from 'zod';
import { paginationSchema } from './common.js';

export const PRACTICE_KINDS = ['dsa', 'system_design', 'behavioral', 'mock', 'other'] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];

export const PRACTICE_OUTCOMES = ['solved', 'partial', 'failed'] as const;
export type PracticeOutcome = (typeof PRACTICE_OUTCOMES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const createPracticeSessionSchema = z.object({
  topic: z.string().trim().min(1, 'Enter what you practised').max(100),
  kind: z.enum(PRACTICE_KINDS),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  durationMin: z
    .number()
    .int('Whole minutes only')
    .min(1, 'At least 1 minute')
    .max(600, 'Up to 600 minutes')
    .nullable()
    .optional(),
  outcome: z.enum(PRACTICE_OUTCOMES).nullable().optional(),
  notes: optionalText(2000),
});
export type CreatePracticeSessionInput = z.input<typeof createPracticeSessionSchema>;
export type CreatePracticeSession = z.output<typeof createPracticeSessionSchema>;

export const listPracticeSessionsSchema = paginationSchema;

export const gradeReviewSchema = z.object({ quality: z.number().int().min(0).max(5) });
export type GradeReview = z.output<typeof gradeReviewSchema>;

export interface ReviewState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

/**
 * One SM-2 step, exactly as in the plan. Quality is 0 to 5, and under 3 means the person
 * did not remember, so the topic starts again tomorrow. Ease never goes under 1.3.
 */
export function sm2(state: ReviewState, quality: number): ReviewState {
  let { repetitions, intervalDays } = state;
  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    intervalDays =
      repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(intervalDays * state.easeFactor);
  }
  const miss = 5 - quality;
  const easeFactor = Math.max(1.3, state.easeFactor + (0.1 - miss * (0.08 + miss * 0.02)));
  // The column keeps two decimals, so the next step starts from what is saved.
  return { easeFactor: Math.round(easeFactor * 100) / 100, intervalDays, repetitions };
}

export interface PracticeSession {
  id: string;
  topic: string;
  kind: PracticeKind;
  difficulty: number | null;
  durationMin: number | null;
  outcome: PracticeOutcome | null;
  notes: string | null;
  createdAt: string;
}

export interface ReviewItem {
  id: string;
  topic: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  /** A calendar date in the person's time zone, like 2026-11-08. */
  dueOn: string;
  lastReviewedAt: string | null;
}

export interface PrepStats {
  streak: { current: number; best: number; practisedToday: boolean };
  last30Days: {
    sessions: number;
    minutes: number;
    byKind: { kind: PracticeKind; sessions: number; minutes: number }[];
    outcomes: Record<PracticeOutcome, number>;
    topTopics: { topic: string; sessions: number; minutes: number }[];
  };
  reviewsDue: number;
}
