import { createNeonAuth } from '@neon/auth/next/server';

/**
 * Neon Auth runs sign-up, sign-in and sessions. This site passes the browser's auth requests
 * on to it, so the session cookie belongs to this site and works without cross-site setup.
 */
const baseUrl = process.env.NEON_AUTH_BASE_URL ?? '';
const secret = process.env.NEON_AUTH_COOKIE_SECRET ?? '';
// Stops the build with a clear message, so a site with broken sign-in is never deployed.
if (!baseUrl || secret.length < 32) {
  throw new Error(
    'Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET (32 or more characters) on the web host before building.',
  );
}

export const neonAuth = createNeonAuth({
  baseUrl,
  cookies: {
    secret,
    // The site keeps a signed copy of the session to skip a trip to Neon Auth. One minute, not
    // the default five, so signing out on all devices reaches other browsers sooner.
    sessionDataTtl: 60,
  },
});
