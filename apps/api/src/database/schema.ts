import type { Generated, Insertable } from 'kysely';
import type { MembershipRole, TrackerStatus } from '@hireflow/shared';

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
}

export type NewAuditLog = Insertable<AuditLogsTable>;
