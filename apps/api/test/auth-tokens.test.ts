import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Accounts } from '../src/auth/accounts.service.js';
import { AuthTokens, remoteAuthKeys } from '../src/auth/auth-tokens.js';
import { optionalUserId } from '../src/common/optional-user.js';
import type { ConfigService } from '../src/config/config.service.js';

describe('Neon Auth public keys fetched over the network', () => {
  let server: Server;
  let origin: string;
  let tokens: AuthTokens;
  let privateKey: CryptoKey;
  let jwksCalls = 0;

  const sign = (claims: Record<string, unknown>, issuer = origin) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA', kid: 'live' })
      .setSubject(randomUUID())
      .setIssuer(issuer)
      .setAudience(issuer)
      .setExpirationTime('5m')
      .sign(privateKey);

  beforeAll(async () => {
    const keys = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    privateKey = keys.privateKey;
    const jwks = JSON.stringify({
      keys: [{ ...(await exportJWK(keys.publicKey)), alg: 'EdDSA', kid: 'live' }],
    });
    server = createServer((request, response) => {
      if (request.url === '/neondb/auth/.well-known/jwks.json') {
        jwksCalls += 1;
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(jwks);
      } else {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const config = { env: { NEON_AUTH_BASE_URL: `${origin}/neondb/auth` } } as ConfigService;
    tokens = new AuthTokens(config, remoteAuthKeys(config));
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('checks a real token with the keys from the jwks address', async () => {
    const claims = await tokens.verify(
      await sign({ email: 'Riya@Example.com', name: ' Riya ', emailVerified: true }),
    );
    expect(claims).toMatchObject({ email: 'riya@example.com', name: 'Riya', emailVerified: true });
    expect(jwksCalls).toBeGreaterThan(0);
  });

  it('refuses a token with no email', async () => {
    await expect(tokens.verify(await sign({ name: 'No Email' }))).rejects.toThrow(
      'The token has no user.',
    );
  });

  it('treats a bad token on a public route as signed out', async () => {
    const accounts = { idFor: () => Promise.resolve('never') } as unknown as Accounts;
    expect(await optionalUserId(tokens, accounts, 'Bearer not-a-token')).toBeNull();
    expect(await optionalUserId(tokens, accounts, undefined)).toBeNull();
    const good = await sign({ email: 'a@example.com', emailVerified: true });
    expect(await optionalUserId(tokens, accounts, `Bearer ${good}`)).toBe('never');
  });
});
