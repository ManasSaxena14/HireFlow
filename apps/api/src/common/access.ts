import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import { MEMBERSHIP_ROLES, type MembershipRole } from '@hireflow/shared';
import type { Request } from 'express';

export type AccessPolicy =
  { kind: 'public' } | { kind: 'user' } | { kind: 'roles'; roles: readonly MembershipRole[] };

export const ACCESS_KEY = 'hireflow:access';

export const Public = () => SetMetadata<string, AccessPolicy>(ACCESS_KEY, { kind: 'public' });
export const Authenticated = () => SetMetadata<string, AccessPolicy>(ACCESS_KEY, { kind: 'user' });
export const Roles = (...roles: MembershipRole[]) =>
  SetMetadata<string, AccessPolicy>(ACCESS_KEY, { kind: 'roles', roles });
export const AnyMember = () => Roles(...MEMBERSHIP_ROLES);

/** The people who run hiring. Interviewers only see the candidates given to them. */
export const HIRING_ROLES = ['admin', 'recruiter', 'hiring_manager'] as const;
export const HiringTeam = () => Roles(...HIRING_ROLES);

export interface RequestUser {
  id: string;
}

export interface RequestTenant {
  companyId: string;
  role: MembershipRole;
}

/** Who is asking, and in which company. Hiring code uses this to decide what to show. */
export interface Viewer extends RequestTenant {
  userId: string;
}

export type AppRequest = Request & {
  id: string;
  user?: RequestUser;
  tenant?: RequestTenant;
};

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().user as RequestUser;
});

export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().tenant as RequestTenant;
});

export const CurrentViewer = createParamDecorator((_: unknown, ctx: ExecutionContext): Viewer => {
  const { user, tenant } = ctx.switchToHttp().getRequest<AppRequest>();
  return { ...(tenant as RequestTenant), userId: (user as RequestUser).id };
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().ip ?? null;
});
