import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { MailMessage } from '@hireflow/shared';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
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

  lastTokenFor(email: string, template: MailMessage['template']): string {
    const message = this.sent.findLast((m) => m.to === email && m.template === template);
    if (!message) throw new Error(`no ${template} mail for ${email}`);
    return new URL(message.link).searchParams.get('token') as string;
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
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  return { app, http: () => request(app.getHttpServer()), mail, db: app.get(Database) };
}

export const PASSWORD = 'correct-horse-battery';

export interface TestUser {
  id: string;
  email: string;
  token: string;
  cookie: string;
  auth: { Authorization: string };
}

export function refreshCookieFrom(response: { headers: Record<string, unknown> }): string {
  const cookies = (response.headers['set-cookie'] ?? []) as string[];
  const cookie = cookies.find((c) => c.startsWith('hf_refresh='));
  if (!cookie) throw new Error('no refresh cookie on the response');
  return cookie.split(';')[0] as string;
}

export async function signUp(
  ctx: TestContext,
  overrides: { email?: string } = {},
): Promise<TestUser> {
  const email = overrides.email ?? `user-${randomUUID()}@example.com`;
  await ctx
    .http()
    .post('/api/v1/auth/register')
    .send({ email, password: PASSWORD, fullName: 'Test User' })
    .expect(201);
  const login = await ctx
    .http()
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return {
    id: login.body.user.id,
    email,
    token: login.body.accessToken,
    cookie: refreshCookieFrom(login),
    auth: { Authorization: `Bearer ${login.body.accessToken}` },
  };
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
