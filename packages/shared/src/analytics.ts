import { z } from 'zod';
import { uuidSchema } from './common.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-01-31')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'This date does not exist');

export const analyticsQuerySchema = z
  .object({ from: isoDate.optional(), to: isoDate.optional(), jobId: uuidSchema.optional() })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'The end date must be after the start date',
  });
export type AnalyticsQuery = z.output<typeof analyticsQuerySchema>;

export const FUNNEL_STEPS = ['applied', 'screening', 'interview', 'offer', 'hired'] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface AnalyticsRange {
  from: string;
  to: string;
}

export interface FunnelReport {
  range: AnalyticsRange;
  total: number;
  /** How many people reached each step, or went further. */
  steps: { step: FunnelStep; count: number }[];
  rejected: number;
}

export interface TimeToHireReport {
  range: AnalyticsRange;
  hires: number;
  medianDays: number | null;
  averageDays: number | null;
  fastestDays: number | null;
  slowestDays: number | null;
  byJob: { jobId: string; title: string; hires: number; medianDays: number }[];
}

export interface SourcesReport {
  range: AnalyticsRange;
  sources: { source: string; applications: number; hires: number }[];
}
