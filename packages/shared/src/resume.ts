import { z } from 'zod';
import { uuidSchema } from './common.js';

export const RESUME_STATUSES = ['pending', 'ready', 'failed'] as const;
export type ResumeStatus = (typeof RESUME_STATUSES)[number];

/** Each person can keep this many resumes. */
export const MAX_RESUMES_PER_USER = 10;
export const MAX_JOB_TEXT_LENGTH = 50_000;
/** More text than this adds nothing to a resume and only slows the check. */
export const MAX_RESUME_TEXT_LENGTH = 100_000;

export const uploadResumeSchema = z.object({
  label: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
});
export type UploadResume = z.output<typeof uploadResumeSchema>;

export const matchResumeSchema = z
  .object({
    jobDescription: z
      .string()
      .trim()
      .min(30, 'Paste more of the job, so there is enough to compare')
      .max(MAX_JOB_TEXT_LENGTH, 'This is too long. Paste only the job description')
      .optional(),
    trackedApplicationId: uuidSchema.optional(),
    jobLabel: z.string().trim().max(120).optional(),
  })
  .refine((value) => Boolean(value.jobDescription) !== Boolean(value.trackedApplicationId), {
    path: ['jobDescription'],
    message: 'Paste a job description or pick a job from your board',
  });
export type MatchResumeInput = z.input<typeof matchResumeSchema>;
export type MatchResumeBody = z.output<typeof matchResumeSchema>;

export interface Resume {
  id: string;
  label: string;
  status: ResumeStatus;
  parseError: string | null;
  parsedSkills: string[];
  originalName: string;
  sizeBytes: number;
  createdAt: string;
  /** The score from the latest check, if there has been one. */
  lastScore: number | null;
}

export interface ResumeMatch {
  id: string;
  trackedApplicationId: string | null;
  jobRef: string | null;
  score: number;
  matched: string[];
  missing: string[];
  sectionsFound: string[];
  suggestions: string[];
  breakdown: { coverage: number; keywordSim: number; sections: number };
  createdAt: string;
}
