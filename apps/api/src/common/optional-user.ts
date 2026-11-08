import type { JwtService } from '@nestjs/jwt';

/**
 * Reads who is signed in on a public route, if anyone is. A missing or old token is not an
 * error here. The person is simply treated as signed out.
 */
export async function optionalUserId(
  jwt: JwtService,
  authorization: string | undefined,
): Promise<string | null> {
  const [scheme, token] = (authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const payload = await jwt.verifyAsync<{ sub: string }>(token);
    return payload.sub;
  } catch {
    return null;
  }
}
