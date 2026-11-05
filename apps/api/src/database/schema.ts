import type { Generated, Insertable } from 'kysely';
import type { MembershipRole } from '@hireflow/shared';

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

export interface DB {
  users: UsersTable;
  companies: CompaniesTable;
  memberships: MembershipsTable;
  refreshTokens: RefreshTokensTable;
  emailTokens: EmailTokensTable;
  auditLogs: AuditLogsTable;
}

export type NewAuditLog = Insertable<AuditLogsTable>;
