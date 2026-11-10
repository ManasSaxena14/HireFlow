import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import { ConfigService } from '../config/config.service.js';

/** Where the API finds the public keys that Neon Auth signs its tokens with. */
export const AUTH_KEYS = Symbol('AUTH_KEYS');

/** What the API reads from a Neon Auth token. */
export interface AuthClaims {
  /** The Neon Auth user id. */
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export function remoteAuthKeys(config: ConfigService): JWTVerifyGetKey {
  const keys = createRemoteJWKSet(
    new URL(`${config.env.NEON_AUTH_BASE_URL}/.well-known/jwks.json`),
    // A slow answer must not hold every request, and the keys are fetched again at most once
    // every 30 seconds when a token comes with a key the API has not seen.
    { timeoutDuration: 5000, cooldownDuration: 30_000 },
  );
  // Fetched in the background at start, so the first visitor after a wake does not wait.
  setTimeout(() => void keys.reload().catch(() => undefined), 0).unref();
  return keys;
}

/**
 * Checks the short-lived token that Neon Auth gives a signed-in browser. The token is signed
 * with Ed25519, and both the issuer and the audience are the Neon Auth address.
 */
@Injectable()
export class AuthTokens {
  private readonly origin: string;

  constructor(
    config: ConfigService,
    @Inject(AUTH_KEYS) private readonly keys: JWTVerifyGetKey,
  ) {
    this.origin = new URL(config.env.NEON_AUTH_BASE_URL).origin;
  }

  /** Throws if the token is missing, changed, made for another site or out of date. */
  async verify(token: string): Promise<AuthClaims> {
    const { payload } = await jwtVerify(token, this.keys, {
      algorithms: ['EdDSA'],
      issuer: this.origin,
      audience: this.origin,
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new Error('The token has no user.');
    }
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      name: typeof payload.name === 'string' ? payload.name.trim() : '',
      emailVerified: payload.emailVerified === true,
    };
  }
}
