import type { Accounts } from '../auth/accounts.service.js';
import type { AuthTokens } from '../auth/auth-tokens.js';

/** Reads the token from an Authorization header, or nothing. */
export function bearerToken(authorization: string | undefined): string | null {
  const [scheme, token] = (authorization ?? '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * Reads who is signed in on a public route, if anyone is. A missing or old token is not an
 * error here. The person is simply treated as signed out.
 */
export async function optionalUserId(
  tokens: AuthTokens,
  accounts: Accounts,
  authorization: string | undefined,
): Promise<string | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  try {
    return await accounts.idFor(await tokens.verify(token));
  } catch {
    return null;
  }
}
