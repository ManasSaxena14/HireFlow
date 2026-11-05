import { headers } from 'next/headers';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Reads public data while the page is built on the server. It passes on the visitor's
 * address, so one busy visitor cannot use up the rate limit for everyone else.
 */
export async function fetchPublic<T>(path: string): Promise<T | null> {
  const forwardedFor = (await headers()).get('x-forwarded-for');
  const response = await fetch(`${apiUrl}/api/v1/public${path}`, {
    cache: 'no-store',
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The careers data could not load: ${response.status}`);
  return (await response.json()) as T;
}
