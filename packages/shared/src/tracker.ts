import { z } from 'zod';
import { paginationSchema } from './common.js';
import { TRACKER_STATUSES, type TrackerStatus } from './enums.js';

const status = z.enum(TRACKER_STATUSES);

/** An empty form field becomes null, so "cleared" and "never set" are saved the same way. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const jobUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) => value === '' || /^https?:\/\/\S+$/i.test(value),
    'Enter a full link starting with https://',
  )
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const salary = z.number().int().min(0).max(1_000_000_000).nullable().optional();

const labelList = z.array(z.string().trim().min(1).max(40)).max(30);

const salaryOrder = (value: { salaryMin?: number | null; salaryMax?: number | null }) =>
  value.salaryMin == null || value.salaryMax == null || value.salaryMin <= value.salaryMax;
const salaryOrderIssue = {
  path: ['salaryMax'],
  message: 'Must be higher than the lowest salary',
};

const applicationFields = {
  title: z.string().trim().min(1, 'Enter the job title').max(200),
  companyName: z.string().trim().min(1, 'Enter the company').max(200),
  jobUrl,
  location: optionalText(200),
  source: optionalText(100),
  salaryMin: salary,
  salaryMax: salary,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'Use a 3-letter code')
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
  skills: labelList.optional(),
  description: optionalText(20_000),
  tags: labelList.optional(),
};

export const createApplicationSchema = z
  .object({ ...applicationFields, status: status.optional() })
  .refine(salaryOrder, salaryOrderIssue);
export type CreateApplicationInput = z.input<typeof createApplicationSchema>;
export type CreateApplication = z.output<typeof createApplicationSchema>;

export const updateApplicationSchema = z
  .object({ ...applicationFields, archived: z.boolean() })
  .partial()
  .refine(salaryOrder, salaryOrderIssue)
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateApplication = z.output<typeof updateApplicationSchema>;

export const moveApplicationSchema = z.object({
  toStatus: status,
  note: optionalText(2000),
});
export type MoveApplication = z.output<typeof moveApplicationSchema>;

export const listApplicationsSchema = paginationSchema.extend({
  status: status.optional(),
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(40).optional(),
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type ListApplications = z.output<typeof listApplicationsSchema>;

export const createNoteSchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(10_000),
});
export type CreateNote = z.output<typeof createNoteSchema>;

export const createReminderSchema = z.object({
  remindAt: z.iso
    .datetime({ offset: true, error: 'Choose a date and time' })
    .refine((value) => new Date(value).getTime() > Date.now(), 'Choose a time in the future'),
  message: z.string().trim().min(1, 'Write what the reminder is for').max(500),
});
export type CreateReminder = z.output<typeof createReminderSchema>;

export interface TrackedApplication {
  id: string;
  title: string;
  companyName: string;
  jobUrl: string | null;
  location: string | null;
  source: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  status: TrackerStatus;
  appliedAt: string | null;
  skills: string[];
  description: string | null;
  tags: string[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationReminder {
  id: string;
  kind: 'follow_up' | 'custom' | 'interview';
  remindAt: string;
  message: string;
  sentAt: string | null;
}

export interface ApplicationDetail extends TrackedApplication {
  reminders: ApplicationReminder[];
}

export interface ApplicationEvent {
  id: string;
  fromStatus: TrackerStatus | null;
  toStatus: TrackerStatus;
  note: string | null;
  createdAt: string;
}

export interface ApplicationNote {
  id: string;
  body: string;
  createdAt: string;
}

export interface TrackerStats {
  byStatus: Record<TrackerStatus, number>;
  perWeek: { weekStart: string; count: number }[];
  responseRate: number | null;
  funnel: { applied: number; screening: number; interview: number; offer: number };
}

export interface AppNotification {
  id: string;
  type: string;
  payload: { message?: string; trackedApplicationId?: string | null; link?: string };
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
}
