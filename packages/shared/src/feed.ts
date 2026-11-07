import { z } from 'zod';
import { paginationSchema } from './common.js';

export const ALERT_FREQUENCIES = ['instant', 'daily'] as const;
export type AlertFrequency = (typeof ALERT_FREQUENCIES)[number];

/** Each person can keep this many alerts. It stops one account from slowing the matcher. */
export const MAX_ALERTS_PER_USER = 20;

const emptyToUndefined = (value: string | undefined) => (value === '' ? undefined : value);

export const listFeedJobsSchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional().transform(emptyToUndefined),
  location: z.string().trim().max(200).optional().transform(emptyToUndefined),
  remote: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type ListFeedJobs = z.output<typeof listFeedJobsSchema>;

/** Removes repeats, ignoring capital letters, and keeps the first spelling. */
const uniqueWords = (words: string[]) => {
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const wordList = (max: number) =>
  z.array(z.string().trim().min(1).max(60)).max(max).transform(uniqueWords);

const alertFields = {
  name: z.string().trim().min(1, 'Give this alert a name').max(80),
  keywords: wordList(20).refine((words) => words.length > 0, 'Enter at least one keyword'),
  locations: wordList(10),
  remoteOnly: z.boolean(),
  frequency: z.enum(ALERT_FREQUENCIES),
};

export const createAlertSchema = z.object({
  ...alertFields,
  locations: alertFields.locations.default([]),
  remoteOnly: alertFields.remoteOnly.default(false),
  frequency: alertFields.frequency.default('daily'),
});
export type CreateAlertInput = z.input<typeof createAlertSchema>;
export type CreateAlert = z.output<typeof createAlertSchema>;

export const updateAlertSchema = z
  .object({ ...alertFields, active: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateAlert = z.output<typeof updateAlertSchema>;

export interface FeedJob {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  remote: boolean;
  url: string;
  skills: string[];
  postedAt: string | null;
  createdAt: string;
  sourceName: string;
  /** The first part of the description. */
  summary: string | null;
  /** Set when this job is already on the person's board. */
  savedApplicationId: string | null;
}

export interface FeedJobDetail extends FeedJob {
  description: string | null;
}

export interface JobAlert {
  id: string;
  name: string;
  keywords: string[];
  locations: string[];
  remoteOnly: boolean;
  frequency: AlertFrequency;
  active: boolean;
  lastSentAt: string | null;
  createdAt: string;
  /** How many jobs this alert has sent so far. */
  sentCount: number;
}
