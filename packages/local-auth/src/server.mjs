// A stand-in for Neon Auth on your own computer. Neon Auth is Better Auth run by Neon, so this
// runs the same Better Auth with the same cookie names, token shape and email codes. Local
// development and the browser tests then work without the internet or a Neon project.
//
// It only starts when NEON_AUTH_BASE_URL points at localhost. With a real Neon Auth address it
// says so and stops, so `pnpm dev` works either way. It refuses to run in production.
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { toNodeHandler } from 'better-auth/node';
import { emailOTP, jwt } from 'better-auth/plugins';
import pg from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const SCHEMA = 'local_auth';

const raw = process.env.NEON_AUTH_BASE_URL;
const address = raw ? new URL(raw.replace(/\/+$/, '')) : null;
if (!address || !LOCAL_HOSTS.has(address.hostname)) {
  console.log('Local sign-in is off: NEON_AUTH_BASE_URL points at Neon Auth.');
  process.exit(0);
}
if (process.env.NODE_ENV === 'production') {
  console.error('The local sign-in stand-in is only for development and tests.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const origin = address.origin;
const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
// Neon Auth leaves this off by default. Turn it on to try the email code like production.
const verifyEmail = process.env.LOCAL_AUTH_VERIFY_EMAIL !== 'false';
const previewDir = fileURLToPath(new URL('../../../.mail-preview', import.meta.url));

// Its tables live in their own schema, so they never mix with HireFlow's tables.
const setup = new pg.Client({ connectionString: process.env.DATABASE_URL });
await setup.connect();
await setup.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
await setup.end();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c search_path=${SCHEMA}`,
  max: 3,
});
pool.on('error', () => undefined);

/** Saves each email as a file, like the worker does, and prints the code for convenience. */
async function saveEmail(kind, to, details) {
  await mkdir(previewDir, { recursive: true });
  const file = join(previewDir, `auth-${Date.now()}-${kind}.json`);
  await writeFile(file, JSON.stringify({ kind, to, ...details }, null, 2));
  console.log(`[local sign-in] ${kind} for ${to}: ${details.code ?? details.link}`);
}

const options = {
  baseURL: origin,
  basePath: address.pathname,
  // Only for this stand-in. The real one is kept by Neon.
  secret: process.env.LOCAL_AUTH_SECRET ?? 'local-auth-secret-for-development-only-0001',
  database: pool,
  trustedOrigins: [appUrl],
  // The same cookie names as Neon Auth, which the Neon Next.js package looks for.
  // Neon Auth gives each user a UUID.
  advanced: {
    cookiePrefix: 'neon-auth',
    useSecureCookies: true,
    database: { generateId: 'uuid' },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: verifyEmail,
    sendResetPassword: ({ user, url }) => saveEmail('reset-password', user.email, { link: url }),
  },
  emailVerification: { autoSignInAfterVerification: true },
  plugins: [
    // Short-lived tokens signed with Ed25519, the same as Neon Auth.
    jwt({
      jwks: { jwksPath: '/.well-known/jwks.json', keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' } },
      jwt: { issuer: origin, audience: origin, expirationTime: '15m' },
    }),
    emailOTP({
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: verifyEmail,
      sendVerificationOTP: ({ email, otp, type }) => saveEmail(type, email, { code: otp }),
    }),
  ],
};

const { runMigrations } = await getMigrations(options);
await runMigrations();

const auth = betterAuth(options);
const handle = toNodeHandler(auth);
createServer((request, response) => {
  if (!request.url?.startsWith(address.pathname)) {
    response.writeHead(404).end();
    return;
  }
  void handle(request, response);
}).listen(Number(address.port || 80), address.hostname, () => {
  console.log(
    `Local sign-in at ${address.href}. Email codes are ${verifyEmail ? 'on' : 'off'}, and emails are saved in .mail-preview/.`,
  );
});
