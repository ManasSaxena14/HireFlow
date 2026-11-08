import type { ColumnType, Generated, Insertable } from 'kysely';
import type {
  AlertFrequency,
  InterviewStatus,
  PracticeKind,
  PracticeOutcome,
  JobStatus,
  MembershipRole,
  Recommendation,
  ResumeStatus,
  StageKind,
  TrackerStatus,
} from '@hireflow/shared';
import type { MatchBreakdown } from '@hireflow/shared/matcher';

export interface UsersTable {
  id: Generated<string>;
  email: string;
  passwordHash: string;
  fullName: string;
  timezone: Generated<string>;
  emailVerifiedAt: Date | null;
  isActive: Generated<boolean>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface CompaniesTable {
  id: Generated<string>;
  name: string;
  slug: string;
  careersEnabled: Generated<boolean>;
  createdAt: Generated<Date>;
}

export interface MembershipsTable {
  id: Generated<string>;
  companyId: string;
  userId: string;
  role: MembershipRole;
  createdAt: Generated<Date>;
}

export interface RefreshTokensTable {
  id: Generated<string>;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  createdAt: Generated<Date>;
}

export interface EmailTokensTable {
  id: Generated<string>;
  userId: string;
  purpose: 'verify_email' | 'reset_password';
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface AuditLogsTable {
  id: Generated<string>;
  companyId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  diff: unknown;
  ip: string | null;
  createdAt: Generated<Date>;
}

export interface TrackedApplicationsTable {
  id: Generated<string>;
  userId: string;
  title: string;
  companyName: string;
  jobUrl: string | null;
  location: string | null;
  source: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  status: TrackerStatus;
  appliedAt: Date | null;
  skills: string[];
  description: string | null;
  tags: string[];
  jobHash: string;
  resumeId: string | null;
  /** Set when this card follows the person's application to a company on HireFlow. */
  companyApplicationId: ColumnType<string | null, string | null | undefined, string | null>;
  archivedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ApplicationEventsTable {
  id: Generated<string>;
  trackedApplicationId: string;
  fromStatus: TrackerStatus | null;
  toStatus: TrackerStatus;
  note: string | null;
  createdAt: Generated<Date>;
}

export interface ApplicationNotesTable {
  id: Generated<string>;
  trackedApplicationId: string;
  body: string;
  createdAt: Generated<Date>;
}

export interface RemindersTable {
  id: Generated<string>;
  userId: string;
  trackedApplicationId: string | null;
  interviewId: string | null;
  kind: 'follow_up' | 'custom' | 'interview';
  remindAt: Date;
  message: string;
  sentAt: Date | null;
  createdAt: Generated<Date>;
}

export interface NotificationsTable {
  id: Generated<string>;
  userId: string;
  type: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Generated<Date>;
}

export interface FilesTable {
  id: Generated<string>;
  ownerUserId: string | null;
  companyId: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Generated<Date>;
}

export interface JobsTable {
  id: Generated<string>;
  companyId: string;
  title: string;
  slug: string;
  description: string;
  location: string | null;
  employmentType: string | null;
  remote: Generated<boolean>;
  skills: Generated<string[]>;
  status: Generated<JobStatus>;
  createdBy: string;
  publishedAt: Date | null;
  closedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface PipelineStagesTable {
  id: Generated<string>;
  companyId: string;
  jobId: string;
  name: string;
  position: number;
  kind: StageKind;
  emailSubject: string | null;
  emailBody: string | null;
}

export interface CandidatesTable {
  id: Generated<string>;
  companyId: string;
  userId: string | null;
  fullName: string;
  email: string;
  phone: string | null;
  resumeFileId: string | null;
  source: string | null;
  createdAt: Generated<Date>;
}

export interface ApplicationsTable {
  id: Generated<string>;
  companyId: string;
  jobId: string;
  candidateId: string;
  stageId: string;
  resumeFileId: string | null;
  /** PostgreSQL sends numeric values as text, so this is a string here. */
  score: string | null;
  rejectionReason: string | null;
  appliedAt: Generated<Date>;
  decidedAt: Date | null;
}

export interface ApplicationStageEventsTable {
  id: Generated<string>;
  companyId: string;
  applicationId: string;
  fromStageId: string | null;
  toStageId: string;
  actorId: string | null;
  createdAt: Generated<Date>;
}

export interface ScorecardsTable {
  id: Generated<string>;
  companyId: string;
  applicationId: string;
  interviewerId: string;
  rating: number;
  recommendation: Recommendation;
  comments: string | null;
  createdAt: Generated<Date>;
}

export interface CommentsTable {
  id: Generated<string>;
  companyId: string;
  applicationId: string;
  authorId: string;
  body: string;
  createdAt: Generated<Date>;
}

export interface ApplicationAssignmentsTable {
  companyId: string;
  applicationId: string;
  userId: string;
  assignedBy: string | null;
  createdAt: Generated<Date>;
}

export interface AvailabilityRulesTable {
  id: Generated<string>;
  companyId: string;
  userId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface AvailabilityBlocksTable {
  id: Generated<string>;
  companyId: string;
  userId: string;
  during: string;
  reason: string | null;
}

export interface InterviewsTable {
  id: Generated<string>;
  companyId: string;
  applicationId: string;
  candidateId: string;
  interviewerId: string;
  during: string;
  status: Generated<InterviewStatus>;
  meetingUrl: string | null;
  notes: string | null;
  candidateTimezone: string | null;
  createdBy: string;
  createdAt: Generated<Date>;
}

export interface InterviewOffersTable {
  id: Generated<string>;
  companyId: string;
  applicationId: string;
  interviewerId: string;
  durationMin: number;
  slots: ColumnType<Date[], string[], string[]>;
  meetingUrl: string | null;
  notes: string | null;
  expiresAt: Date;
  withdrawnAt: Date | null;
  interviewId: string | null;
  createdBy: string;
  createdAt: Generated<Date>;
}

export interface FeedSourcesTable {
  id: Generated<string>;
  name: string;
  kind: string;
  config: ColumnType<unknown, string | undefined, string>;
  enabled: Generated<boolean>;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
}

export interface FeedJobsTable {
  id: Generated<string>;
  sourceId: string;
  externalId: string;
  title: string;
  companyName: string;
  location: string | null;
  remote: Generated<boolean>;
  url: string;
  description: string | null;
  skills: Generated<string[]>;
  postedAt: Date | null;
  jobHash: string;
  lastSeenAt: Generated<Date>;
  matchedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface JobAlertsTable {
  id: Generated<string>;
  userId: string;
  name: string;
  keywords: string[];
  locations: Generated<string[]>;
  remoteOnly: Generated<boolean>;
  channel: Generated<string>;
  frequency: Generated<AlertFrequency>;
  active: Generated<boolean>;
  lastSentAt: Date | null;
  createdAt: Generated<Date>;
}

export interface AlertDeliveriesTable {
  alertId: string;
  feedJobId: string;
  deliveredAt: Date | null;
}

export interface ResumesTable {
  id: Generated<string>;
  userId: string;
  fileId: string;
  label: string;
  status: Generated<ResumeStatus>;
  parseError: string | null;
  parsedText: string | null;
  parsedSkills: Generated<string[]>;
  createdAt: Generated<Date>;
}

export interface ResumeMatchesTable {
  id: Generated<string>;
  resumeId: string;
  trackedApplicationId: string | null;
  jobRef: string | null;
  score: ColumnType<string, number, number>;
  matched: string[];
  missing: string[];
  sectionsFound: Generated<string[]>;
  suggestions: Generated<string[]>;
  breakdown: ColumnType<MatchBreakdown, string, string>;
  createdAt: Generated<Date>;
}

export interface PracticeSessionsTable {
  id: Generated<string>;
  userId: string;
  topic: string;
  kind: PracticeKind;
  difficulty: number | null;
  durationMin: number | null;
  outcome: PracticeOutcome | null;
  notes: string | null;
  createdAt: Generated<Date>;
}

export interface ReviewItemsTable {
  id: Generated<string>;
  userId: string;
  topic: string;
  easeFactor: ColumnType<string, number | undefined, number>;
  intervalDays: Generated<number>;
  repetitions: Generated<number>;
  /** Read it as text, because pg turns a date into a JS Date at local midnight. */
  dueOn: ColumnType<Date, string | undefined, string>;
  lastReviewedAt: Date | null;
}

export interface DB {
  users: UsersTable;
  companies: CompaniesTable;
  memberships: MembershipsTable;
  refreshTokens: RefreshTokensTable;
  emailTokens: EmailTokensTable;
  auditLogs: AuditLogsTable;
  trackedApplications: TrackedApplicationsTable;
  applicationEvents: ApplicationEventsTable;
  applicationNotes: ApplicationNotesTable;
  reminders: RemindersTable;
  notifications: NotificationsTable;
  files: FilesTable;
  jobs: JobsTable;
  pipelineStages: PipelineStagesTable;
  candidates: CandidatesTable;
  applications: ApplicationsTable;
  applicationStageEvents: ApplicationStageEventsTable;
  scorecards: ScorecardsTable;
  comments: CommentsTable;
  applicationAssignments: ApplicationAssignmentsTable;
  availabilityRules: AvailabilityRulesTable;
  availabilityBlocks: AvailabilityBlocksTable;
  interviews: InterviewsTable;
  interviewOffers: InterviewOffersTable;
  feedSources: FeedSourcesTable;
  feedJobs: FeedJobsTable;
  jobAlerts: JobAlertsTable;
  alertDeliveries: AlertDeliveriesTable;
  resumes: ResumesTable;
  resumeMatches: ResumeMatchesTable;
  practiceSessions: PracticeSessionsTable;
  reviewItems: ReviewItemsTable;
}

export type NewAuditLog = Insertable<AuditLogsTable>;
