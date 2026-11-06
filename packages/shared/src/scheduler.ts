import { z } from 'zod';
import { paginationSchema, timezoneSchema, uuidSchema } from './common.js';

export const INTERVIEW_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const MIN_INTERVIEW_MINUTES = 15;
export const MAX_INTERVIEW_MINUTES = 480;
export const MAX_OFFERED_SLOTS = 10;
export const MAX_SUGGEST_DAYS = 31;
export const SLOT_STEP_MINUTES = 15;
export const MAX_SUGGESTED_SLOTS = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

const instant = z.iso.datetime({ offset: true, error: 'Enter a valid date and time' });
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time like 09:30');
const calendarDate = z.iso.date();
const durationMin = z
  .number()
  .int()
  .min(MIN_INTERVIEW_MINUTES, `An interview must be at least ${MIN_INTERVIEW_MINUTES} minutes`)
  .max(MAX_INTERVIEW_MINUTES, 'An interview cannot be longer than 8 hours');
const meetingUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => value === '' || /^https?:\/\/\S+$/i.test(value), {
    error: 'Enter a link that starts with https://',
  })
  .nullish()
  .transform((value) => value || null);
const notes = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((value) => value || null);

const availabilityRuleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: clockTime,
    endTime: clockTime,
    validFrom: calendarDate.nullish().transform((value) => value ?? null),
    validTo: calendarDate.nullish().transform((value) => value ?? null),
  })
  .refine((rule) => rule.endTime > rule.startTime, {
    path: ['endTime'],
    error: 'The end time must be after the start time',
  })
  .refine((rule) => !rule.validFrom || !rule.validTo || rule.validTo >= rule.validFrom, {
    path: ['validTo'],
    error: 'The last day must be after the first day',
  });

const availabilityBlockSchema = z
  .object({ start: instant, end: instant, reason: notes })
  .refine((block) => Date.parse(block.end) > Date.parse(block.start), {
    path: ['end'],
    error: 'The end must be after the start',
  });

export const availabilityQuerySchema = z.object({ companyId: uuidSchema });
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const putAvailabilitySchema = z.object({
  timezone: timezoneSchema,
  rules: z.array(availabilityRuleSchema).max(70),
  blocks: z.array(availabilityBlockSchema).max(200),
});
export type PutAvailability = z.infer<typeof putAvailabilitySchema>;
export type PutAvailabilityInput = z.input<typeof putAvailabilitySchema>;

export const suggestSlotsSchema = z
  .object({
    applicationId: uuidSchema,
    interviewerIds: z
      .array(uuidSchema)
      .min(1, 'Choose at least one interviewer')
      .max(5, 'Choose up to 5 interviewers'),
    durationMin,
    from: instant,
    to: instant,
    // When changing the time of an interview, its old time should count as free.
    ignoreInterviewId: uuidSchema.optional(),
  })
  .refine((body) => Date.parse(body.to) > Date.parse(body.from), {
    path: ['to'],
    error: 'The end must be after the start',
  })
  .refine((body) => Date.parse(body.to) - Date.parse(body.from) <= MAX_SUGGEST_DAYS * DAY_MS, {
    path: ['to'],
    error: `Please look at up to ${MAX_SUGGEST_DAYS} days at a time`,
  });
export type SuggestSlots = z.infer<typeof suggestSlotsSchema>;

export const createInterviewSchema = z.object({
  applicationId: uuidSchema,
  interviewerId: uuidSchema,
  start: instant,
  durationMin,
  meetingUrl,
  notes,
});
export type CreateInterview = z.infer<typeof createInterviewSchema>;
export type CreateInterviewInput = z.input<typeof createInterviewSchema>;

export const rescheduleInterviewSchema = z.object({
  start: instant,
  durationMin: durationMin.optional(),
});
export type RescheduleInterview = z.infer<typeof rescheduleInterviewSchema>;

export const listInterviewsSchema = paginationSchema.extend({
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
});
export type ListInterviews = z.infer<typeof listInterviewsSchema>;

export const createOfferSchema = z.object({
  applicationId: uuidSchema,
  interviewerId: uuidSchema,
  durationMin,
  slots: z
    .array(instant)
    .min(1, 'Choose at least one time')
    .max(MAX_OFFERED_SLOTS, `Choose up to ${MAX_OFFERED_SLOTS} times`),
  meetingUrl,
  notes,
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
export type CreateOffer = z.infer<typeof createOfferSchema>;
export type CreateOfferInput = z.input<typeof createOfferSchema>;

export const bookOfferSchema = z.object({
  start: instant,
  timezone: timezoneSchema.optional(),
});
export type BookOffer = z.infer<typeof bookOfferSchema>;

export interface Slot {
  start: string;
  end: string;
}

export interface Availability {
  timezone: string;
  rules: {
    id: string;
    weekday: number;
    startTime: string;
    endTime: string;
    validFrom: string | null;
    validTo: string | null;
  }[];
  blocks: { id: string; start: string; end: string; reason: string | null }[];
}

export interface Interview {
  id: string;
  applicationId: string;
  status: InterviewStatus;
  start: string;
  end: string;
  meetingUrl: string | null;
  notes: string | null;
  jobTitle: string;
  candidate: { id: string; fullName: string };
  interviewer: { id: string; fullName: string };
  createdAt: string;
}

export type OfferStatus = 'open' | 'booked' | 'expired' | 'withdrawn';

export interface InterviewOffer {
  id: string;
  applicationId: string;
  status: OfferStatus;
  durationMin: number;
  slots: string[];
  expiresAt: string;
  interviewer: { id: string; fullName: string };
  bookingUrl: string;
  createdAt: string;
}

export interface ApplicationInterviews {
  interviews: Interview[];
  offers: InterviewOffer[];
}

export interface MyInterview {
  id: string;
  companyId: string;
  applicationId: string;
  companyName: string;
  jobTitle: string;
  start: string;
  end: string;
  status: InterviewStatus;
  meetingUrl: string | null;
  /** Interviewers meet the candidate, and candidates meet the interviewer. */
  role: 'interviewer' | 'candidate';
  otherPerson: string;
}

export interface PublicOffer {
  status: OfferStatus;
  companyName: string;
  jobTitle: string;
  candidateName: string;
  interviewerName: string;
  durationMin: number;
  expiresAt: string;
  slots: Slot[];
  booked: (Slot & { meetingUrl: string | null; calendarUrl: string }) | null;
}

/** Always names the zone, so nobody has to guess whose morning this is. */
export function formatInterviewTime(date: Date | string, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
  return `${formatted} (${timeZone.replaceAll('_', ' ')})`;
}
