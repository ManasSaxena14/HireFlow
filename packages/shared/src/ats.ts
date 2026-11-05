import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common.js';
import {
  JOB_STATUSES,
  type JobStatus,
  type MembershipRole,
  RECOMMENDATIONS,
  type Recommendation,
  STAGE_KINDS,
  type StageKind,
} from './enums.js';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_EXTENSIONS = ['pdf', 'docx'] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const jobFields = {
  title: z.string().trim().min(2, 'Enter the job title').max(200),
  description: z.string().trim().min(20, 'Please write at least 20 characters').max(20_000),
  location: optionalText(200),
  employmentType: optionalText(60),
  remote: z.boolean(),
  skills: z.array(z.string().trim().min(1).max(60)).max(30),
};

export const createJobSchema = z.object({
  ...jobFields,
  remote: jobFields.remote.default(false),
  skills: jobFields.skills.default([]),
});
export type CreateJob = z.infer<typeof createJobSchema>;
export type CreateJobInput = z.input<typeof createJobSchema>;

export const updateJobSchema = z
  .object(jobFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateJob = z.infer<typeof updateJobSchema>;

export const listJobsSchema = paginationSchema.extend({
  status: z.enum(JOB_STATUSES).optional(),
});
export type ListJobs = z.infer<typeof listJobsSchema>;

const stageSchema = z
  .object({
    id: uuidSchema.optional(),
    name: z.string().trim().min(1, 'Enter a name').max(60),
    kind: z.enum(STAGE_KINDS),
    // One line only, because this becomes the email subject.
    emailSubject: z
      .string()
      .trim()
      .max(150)
      .regex(/^[^\r\n]*$/, 'Use one line only')
      .nullish()
      .transform((value) => value || null),
    emailBody: optionalText(5000),
  })
  .refine((stage) => Boolean(stage.emailSubject) === Boolean(stage.emailBody), {
    message: 'Fill in both the subject and the message, or leave both empty',
    path: ['emailBody'],
  });

export const replaceStagesSchema = z
  .object({ stages: z.array(stageSchema).min(3).max(20) })
  .superRefine(({ stages }, ctx) => {
    if (stages[0]?.kind !== 'applied') {
      ctx.addIssue({
        code: 'custom',
        path: ['stages'],
        message: 'The first step must be for new people',
      });
    }
    if (!stages.some((stage) => stage.kind === 'hired')) {
      ctx.addIssue({ code: 'custom', path: ['stages'], message: 'Add a step for people you hire' });
    }
    if (!stages.some((stage) => stage.kind === 'rejected')) {
      ctx.addIssue({
        code: 'custom',
        path: ['stages'],
        message: 'Add a step for people not selected',
      });
    }
    const ids = stages.flatMap((stage) => (stage.id ? [stage.id] : []));
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['stages'], message: 'The same step is listed twice' });
    }
  });
export type ReplaceStages = z.infer<typeof replaceStagesSchema>;

export const listCandidatesSchema = paginationSchema.extend({
  jobId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  minScore: z.coerce.number().min(1).max(5).optional(),
});
export type ListCandidates = z.infer<typeof listCandidatesSchema>;

export const moveCandidateSchema = z.object({
  toStageId: uuidSchema,
  reason: z.string().trim().min(1).max(1000).optional(),
});
export type MoveCandidate = z.infer<typeof moveCandidateSchema>;

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment first').max(5000),
});
export type CreateComment = z.infer<typeof createCommentSchema>;

export const createScorecardSchema = z.object({
  rating: z.number().int().min(1, 'Pick a rating').max(5),
  recommendation: z.enum(RECOMMENDATIONS),
  comments: optionalText(5000),
});
export type CreateScorecard = z.infer<typeof createScorecardSchema>;

export const assignInterviewerSchema = z.object({ userId: uuidSchema });
export type AssignInterviewer = z.infer<typeof assignInterviewerSchema>;

/** The text fields of the apply form. The resume file is checked apart from these. */
export const applyToJobSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  phone: optionalText(40),
  source: optionalText(100),
});
export type ApplyToJob = z.infer<typeof applyToJobSchema>;
export type ApplyToJobInput = z.input<typeof applyToJobSchema>;

export interface Job {
  id: string;
  title: string;
  slug: string;
  description: string;
  location: string | null;
  employmentType: string | null;
  remote: boolean;
  skills: string[];
  status: JobStatus;
  createdBy: string;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  applicationCount: number;
  /** True when this person may edit, publish or close the job. */
  canManage: boolean;
}

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  kind: StageKind;
  emailSubject: string | null;
  emailBody: string | null;
}

export interface JobDetail extends Job {
  stages: PipelineStage[];
}

export interface AtsApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  stageId: string;
  stageName: string;
  stageKind: StageKind;
  score: number | null;
  appliedAt: string;
  decidedAt: string | null;
  candidate: { id: string; fullName: string; email: string };
}

export interface StageEvent {
  id: string;
  fromStageName: string | null;
  toStageName: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface Scorecard {
  id: string;
  interviewerId: string;
  interviewerName: string;
  rating: number;
  recommendation: Recommendation;
  comments: string | null;
  createdAt: string;
}

export interface Assignee {
  userId: string;
  fullName: string;
}

export interface AtsApplicationDetail extends AtsApplication {
  candidate: AtsApplication['candidate'] & { phone: string | null; source: string | null };
  rejectionReason: string | null;
  resume: { originalName: string; sizeBytes: number } | null;
  stages: Pick<PipelineStage, 'id' | 'name' | 'kind'>[];
  events: StageEvent[];
  comments: Comment[];
  scorecards: Scorecard[];
  assignees: Assignee[];
}

export interface CompanyMember {
  userId: string;
  fullName: string;
  email: string;
  role: MembershipRole;
}

export interface ResumeLink {
  url: string;
  expiresAt: string;
}

export interface PublicJobSummary {
  title: string;
  slug: string;
  location: string | null;
  employmentType: string | null;
  remote: boolean;
  skills: string[];
  publishedAt: string | null;
}

export interface PublicJob extends PublicJobSummary {
  description: string;
}

export interface PublicCompany {
  name: string;
  slug: string;
}

export interface PublicJobList {
  company: PublicCompany;
  items: PublicJobSummary[];
  nextCursor: string | null;
}

export interface PublicJobDetail {
  company: PublicCompany;
  job: PublicJob;
}
