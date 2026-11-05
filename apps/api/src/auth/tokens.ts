import { createHash, createHmac, randomBytes } from 'node:crypto';

export const REFRESH_COOKIE = 'hf_refresh';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const randomToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Refresh tokens are keyed so a leaked table cannot be checked against guesses offline. */
export const hashRefreshToken = (token: string, secret: string) =>
  createHmac('sha256', secret).update(token).digest('hex');
