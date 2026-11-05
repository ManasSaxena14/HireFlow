import { type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestUser } from './access.js';

export const AUTH_LIMIT_KEY = 'hireflow:auth-limit';

/** Adds the stricter limit used on sign-in and similar routes. */
export const AuthRateLimit = () => SetMetadata(AUTH_LIMIT_KEY, true);

export function isAuthLimited(context: ExecutionContext): boolean {
  return Reflect.getMetadata(AUTH_LIMIT_KEY, context.getHandler()) === true;
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(request: Record<string, unknown>): Promise<string> {
    const user = request.user as RequestUser | undefined;
    return user?.id ?? String(request.ip ?? 'unknown');
  }
}
