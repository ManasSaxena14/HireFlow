import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { MailMessage } from '@hireflow/shared';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { AUTH_KEYS } from '../../src/auth/auth-tokens.js';
import { configureApp } from '../../src/app.setup.js';
import { Database } from '../../src/database/database.js';
import { MailQueue } from '../../src/queue/mail-queue.js';

export class FakeMailQueue extends MailQueue {
  readonly sent: MailMessage[] = [];
  readonly jobs: { queue: string; data: object }[] = [];

  async enqueueJob(queue: string, data: object): Promise<void> {
    this.jobs.push({ queue, data });
  }

  async enqueue(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export interface TestContext {
  app: NestExpressApplication;
  http: () => ReturnType<typeof request>;
  mail: FakeMailQueue;
  db: Database;
}

export async function createTestApp(): Promise<TestContext> {
  const mail = new FakeMailQueue();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailQueue)
    .useValue(mail)
    .overrideProvider(AUTH_KEYS)
    .useValue(testAuthKeys)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  return { app, http: () => request(app.getHttpServer()), mail, db: app.get(Database) };
}

/** Neon Auth signs with Ed25519. Tests sign with their own key, checked the same way. */
const testKeys = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
export const TEST_AUTH_ORIGIN = new URL(process.env.NEON_AUTH_BASE_URL as string).origin;
export const testAuthKeys = createLocalJWKSet({
  keys: [{ ...(await exportJWK(testKeys.publicKey)), alg: 'EdDSA', kid: 'test' }],
});

export interface TokenOptions {
  sub?: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  key?: CryptoKey;
}

/** A token shaped like the one Neon Auth gives a signed-in browser. */
export async function neonToken(options: TokenOptions = {}): Promise<string> {
  return new SignJWT({
    email: options.email ?? `user-${randomUUID()}@example.com`,
    name: options.name ?? 'Test User',
    emailVerified: options.emailVerified ?? false,
    role: 'authenticated',
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'test' })
    .setSubject(options.sub ?? randomUUID())
    .setIssuer(options.issuer ?? TEST_AUTH_ORIGIN)
    .setAudience(options.audience ?? TEST_AUTH_ORIGIN)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '15m')
    .sign(options.key ?? testKeys.privateKey);
}

export interface TestUser {
  id: string;
  /** The Neon Auth user id. */
  sub: string;
  email: string;
  token: string;
  auth: { Authorization: string };
}

/** Signs a new person up in the way the browser does: the first request makes the account. */
export async function signUp(
  ctx: TestContext,
  overrides: { email?: string; emailVerified?: boolean; name?: string } = {},
): Promise<TestUser> {
  const sub = randomUUID();
  const email = (overrides.email ?? `user-${randomUUID()}@example.com`).toLowerCase();
  const token = await neonToken({ ...overrides, sub, email });
  const auth = { Authorization: `Bearer ${token}` };
  const me = await ctx.http().get('/api/v1/me').set(auth).expect(200);
  return { id: me.body.id, sub, email, token, auth };
}

export async function createCompany(ctx: TestContext, owner: TestUser): Promise<string> {
  const response = await ctx
    .http()
    .post('/api/v1/companies')
    .set(owner.auth)
    .send({ name: `Company ${randomUUID().slice(0, 8)}` })
    .expect(201);
  return response.body.id;
}
