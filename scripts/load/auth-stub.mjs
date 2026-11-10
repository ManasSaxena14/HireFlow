// Stands in for Neon Auth during a load test, so k6 can sign in thousands of times without
// touching the real service. It serves the public key and writes tokens for k6 to use.
// Start the API with NEON_AUTH_BASE_URL=http://127.0.0.1:4199/auth, then run k6 with
// TOKENS_FILE set to the path this prints. Never point a real API at it.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const PORT = 4199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const USERS = Number(process.env.USERS || 20);

const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
const jwks = JSON.stringify({
  keys: [{ ...(await exportJWK(publicKey)), alg: 'EdDSA', kid: 'load' }],
});

const run = Date.now();
const tokens = await Promise.all(
  Array.from({ length: USERS }, (_, index) =>
    new SignJWT({
      email: `load-${run}-${index}@example.com`,
      name: `Load User ${index}`,
      emailVerified: true,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'load' })
      .setSubject(randomUUID())
      .setIssuer(ORIGIN)
      .setAudience(ORIGIN)
      .setIssuedAt()
      .setExpirationTime('3h')
      .sign(privateKey),
  ),
);
const file = join(tmpdir(), `hireflow-load-tokens-${run}.json`);
writeFileSync(file, JSON.stringify(tokens));

createServer((request, response) => {
  if (request.url === '/auth/.well-known/jwks.json') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(jwks);
  } else {
    response.writeHead(404).end();
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Test keys at ${ORIGIN}/auth. Tokens for ${USERS} users in:\n${file}`);
});
