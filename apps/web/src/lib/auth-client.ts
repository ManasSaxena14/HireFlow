'use client';

import type { ErrorCode } from '@hireflow/shared';
import { createAuthClient } from '@neon/auth/next';
import { ApiError } from './api';

/** Talks to Neon Auth through this site's /api/auth routes. */
export const authClient: ReturnType<typeof createAuthClient> = createAuthClient();

interface AuthFailure {
  message?: string;
  status?: number;
  code?: string;
}

/** Easy words for the answers Neon Auth gives most often. */
const MESSAGES: Record<string, [ErrorCode, string]> = {
  INVALID_EMAIL_OR_PASSWORD: ['UNAUTHENTICATED', 'Wrong email or password.'],
  USER_ALREADY_EXISTS: ['CONFLICT', 'An account with this email already exists.'],
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: ['CONFLICT', 'An account with this email already exists.'],
  EMAIL_NOT_VERIFIED: ['FORBIDDEN', 'Please confirm your email first.'],
  PASSWORD_TOO_SHORT: ['VALIDATION_ERROR', 'Use at least 10 characters.'],
  PASSWORD_TOO_LONG: ['VALIDATION_ERROR', 'Use at most 200 characters.'],
  INVALID_OTP: ['VALIDATION_ERROR', 'This code is not right. Please check the email.'],
  OTP_EXPIRED: ['VALIDATION_ERROR', 'This code is too old. Ask for a new one.'],
  TOO_MANY_ATTEMPTS: ['RATE_LIMITED', 'Too many tries. Ask for a new code.'],
  INVALID_TOKEN: ['VALIDATION_ERROR', 'This link does not work any more. Ask for a new one.'],
};

/** Turns a Neon Auth error into the same error type the rest of the site shows. */
export function authError(failure: AuthFailure | null | undefined): ApiError {
  const known = failure?.code ? MESSAGES[failure.code] : undefined;
  if (known) return new ApiError(failure?.status ?? 400, known[0], known[1]);
  if (failure?.status === 429) {
    return new ApiError(429, 'RATE_LIMITED', 'Too many tries. Please wait a minute.');
  }
  return new ApiError(
    failure?.status ?? 500,
    'INTERNAL',
    failure?.message || 'Something went wrong. Please try again.',
  );
}

/**
 * Runs one Neon Auth call. A failed call can come back as an error or be thrown, so both turn
 * into the same easy message.
 */
export async function callAuth<T>(
  call: () => Promise<{ data: T; error: AuthFailure | null }>,
): Promise<T> {
  let result: { data: T; error: AuthFailure | null };
  try {
    result = await call();
  } catch (thrown) {
    const failure = thrown as AuthFailure & { error?: AuthFailure };
    throw authError({ ...failure, ...failure.error });
  }
  if (result.error) throw authError(result.error);
  return result.data;
}

/** Seconds since 1970 when a token runs out, read from its middle part. */
function expiresAt(token: string): number {
  try {
    const part = token.split('.')[1] ?? '';
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return Number((JSON.parse(json) as { exp?: number }).exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

let kept: { token: string; until: number } | null = null;
let asking: Promise<string | null> | null = null;

/**
 * The short-lived signed token the API checks. Empty when nobody is signed in.
 *
 * It comes from the /token route, which always asks Neon Auth. The session answer can come
 * from the site's own cookie copy, which holds only the session id and not this token. The
 * token is kept in memory until a minute before it runs out.
 */
export function sessionToken(fresh = false): Promise<string | null> {
  if (!fresh && kept && kept.until - 60_000 > Date.now()) return Promise.resolve(kept.token);
  asking ??= (async () => {
    try {
      // Nobody signed in is an answer, not a failure.
      const { data } = await authClient.token().catch(() => ({ data: null }));
      const token = data?.token ?? null;
      kept = token ? { token, until: expiresAt(token) } : null;
      return token;
    } finally {
      asking = null;
    }
  })();
  return asking;
}

/** Forgets the kept token, for sign-out. */
export function forgetSessionToken(): void {
  kept = null;
}
