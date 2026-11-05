import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { uuidSchema } from '@hireflow/shared';
import { MembershipsRepository } from '../companies/memberships.repository.js';
import { ACCESS_KEY, type AccessPolicy, type AppRequest } from './access.js';
import { DomainError, notFound, unauthenticated } from './domain-error.js';

function policyOf(reflector: Reflector, context: ExecutionContext): AccessPolicy | undefined {
  return reflector.getAllAndOverride<AccessPolicy>(ACCESS_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
}

/** Checks the login token on every route that is not marked as public. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (policyOf(this.reflector, context)?.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthenticated();

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      request.user = { id: payload.sub };
      return true;
    } catch {
      throw unauthenticated('Please sign in again.');
    }
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
