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

/** Verifies the bearer token on every route that is not explicitly public. */
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
      throw unauthenticated('Your session has expired.');
    }
  }
}

/**
 * Resolves :cid to the caller's membership. A non-member gets 404 rather than 403
 * so the response does not reveal whether the company exists.
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

/** Deny by default: a route with no declared policy cannot be reached at all. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = policyOf(this.reflector, context);
    if (!policy) throw new DomainError('FORBIDDEN', 'This route is not available.');
    if (policy.kind !== 'roles') return true;

    const { tenant } = context.switchToHttp().getRequest<AppRequest>();
    if (!tenant || !policy.roles.includes(tenant.role)) {
      throw new DomainError('FORBIDDEN', 'Your role does not allow this action.');
    }
    return true;
  }
}
