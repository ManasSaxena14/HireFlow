import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { uuidSchema } from '@hireflow/shared';
import { Accounts } from '../auth/accounts.service.js';
import { AuthTokens } from '../auth/auth-tokens.js';
import { MembershipsRepository } from '../companies/memberships.repository.js';
import { ACCESS_KEY, type AccessPolicy, type AppRequest } from './access.js';
import { DomainError, notFound, unauthenticated } from './domain-error.js';
import { bearerToken } from './optional-user.js';

function policyOf(reflector: Reflector, context: ExecutionContext): AccessPolicy | undefined {
  return reflector.getAllAndOverride<AccessPolicy>(ACCESS_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
}

/** Checks the Neon Auth token on every route that is not marked as public. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AuthTokens,
    private readonly accounts: Accounts,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (policyOf(this.reflector, context)?.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw unauthenticated();

    const claims = await this.tokens.verify(token).catch(() => null);
    if (!claims) throw unauthenticated('Please sign in again.');
    request.user = { id: await this.accounts.idFor(claims) };
    return true;
  }
}

/**
 * Finds the user's role in the company named by :cid. Someone who is not a member
 * gets a 404, not a 403, so they cannot find out if the company exists.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly memberships: MembershipsRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const companyId = request.params?.cid;
    if (typeof companyId !== 'string' || !request.user) return true;

    if (!uuidSchema.safeParse(companyId).success) throw notFound('Company');
    const membership = await this.memberships.find(companyId, request.user.id);
    if (!membership) throw notFound('Company');

    request.tenant = { companyId, role: membership.role };
    return true;
  }
}

/** Blocks by default: nobody can reach a route that does not say who may use it. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = policyOf(this.reflector, context);
    if (!policy) throw new DomainError('FORBIDDEN', 'This page is not available.');
    if (policy.kind !== 'roles') return true;

    const { tenant } = context.switchToHttp().getRequest<AppRequest>();
    if (!tenant || !policy.roles.includes(tenant.role)) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
    }
    return true;
  }
}
