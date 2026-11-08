import { randomUUID } from 'node:crypto';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CareersController } from '../src/ats/careers.controller.js';
import { ACCESS_KEY } from '../src/common/access.js';
import { AUTH_LIMIT_KEY } from '../src/common/rate-limit.js';
import { parseEnv } from '../src/config/config.service.js';
import { createPool } from '../src/database/database.js';
import { PublicOffersController } from '../src/scheduler/scheduler.controller.js';
import { createTestApp, signUp, type TestContext, type TestUser } from './helpers/app.js';

describe('platform', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('every route declares an access policy', () => {
    const undeclared: string[] = [];
    for (const module of ctx.app.get(ModulesContainer).values()) {
      for (const { metatype } of module.controllers.values()) {
        if (!metatype) continue;
        const proto = metatype.prototype as Record<string, object>;
        for (const name of Object.getOwnPropertyNames(proto)) {
          const handler = proto[name] as object;
          if (
            name === 'constructor' ||
            Reflect.getMetadata(METHOD_METADATA, handler) === undefined
          ) {
            continue;
          }
          const declared =
            Reflect.getMetadata(ACCESS_KEY, handler) ?? Reflect.getMetadata(ACCESS_KEY, metatype);
          if (!declared) undeclared.push(`${metatype.name}.${name}`);
        }
      }
    }
    expect(undeclared).toEqual([]);
  });

  it('a database link closed while idle does not stop the process', async () => {
    const pool = createPool('postgresql://nobody@localhost:1/none', 1);
    // With no listener, Node would throw this error and stop the whole app.
    expect(() => pool.emit('error', new Error('terminating connection'))).not.toThrow();
    await pool.end();
  });

  it('reads how many proxies to trust', () => {
    const base = {
      APP_URL: 'http://localhost:3000',
      CORS_ORIGINS: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://x',
      JWT_ACCESS_SECRET: 'a'.repeat(40),
      JWT_REFRESH_SECRET: 'b'.repeat(40),
      MAIL_FROM: 'x',
    };
    expect(parseEnv(base).TRUST_PROXY_HOPS).toBe(1);
    expect(parseEnv({ ...base, TRUST_PROXY_HOPS: '2' }).TRUST_PROXY_HOPS).toBe(2);
    expect(() => parseEnv({ ...base, TRUST_PROXY_HOPS: '-1' })).toThrow();
  });

  it('health and readiness are public', async () => {
    await ctx.http().get('/api/v1/health').expect(200, { status: 'ok' });
    await ctx.http().get('/api/v1/ready').expect(200, { status: 'ready' });
  });

  it('an unknown route uses the standard error body', async () => {
    const response = await ctx
      .http()
      .get('/api/v1/nope')
      .set('Authorization', 'Bearer x')
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toMatch(/^req_/);
  });

  it('sets security headers and a request id', async () => {
    const response = await ctx.http().get('/api/v1/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).toMatch(/^req_/);
  });

  it('allows configured origins only', async () => {
    const allowed = await ctx.http().get('/api/v1/health').set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const denied = await ctx.http().get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses to start on missing or weak configuration', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() =>
      parseEnv({
        APP_URL: 'http://localhost:3000',
        CORS_ORIGINS: 'http://localhost:3000',
        DATABASE_URL: 'postgresql://x',
        JWT_ACCESS_SECRET: 'short',
        JWT_REFRESH_SECRET: 'short',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('a stack trace never reaches the client', async () => {
    const spy = ctx.db.selectFrom;
    ctx.db.selectFrom = (() => {
      throw new Error('secret internal detail');
    }) as typeof ctx.db.selectFrom;
    try {
      const response = await ctx
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'x@example.com', password: 'whatever' })
        .expect(500);
      expect(response.body.error.code).toBe('INTERNAL');
      expect(JSON.stringify(response.body)).not.toContain('secret internal detail');
    } finally {
      ctx.db.selectFrom = spy;
    }
  });

  describe('rate limits', () => {
    it('limits credential endpoints per IP', async () => {
      const previous = process.env.RATE_LIMIT_AUTH_PER_MIN;
      process.env.RATE_LIMIT_AUTH_PER_MIN = '3';
      const limited = await createTestApp();
      process.env.RATE_LIMIT_AUTH_PER_MIN = previous;

      const attempt = () =>
        limited.http().post('/api/v1/auth/forgot-password').send({ email: 'someone@example.com' });

      for (let i = 0; i < 3; i++) await attempt().expect(200);
      const blocked = await attempt().expect(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
      await limited.app.close();
    });
  });
});

describe('settings and odd requests', () => {
  const good = {
    APP_URL: 'https://example.com/',
    CORS_ORIGINS: 'https://example.com',
    DATABASE_URL: 'postgresql://x',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
  };
  const production = { ...good, NODE_ENV: 'production', COOKIE_SECURE: 'true' };

  it('accepts good production settings and removes the slash at the end of the address', () => {
    expect(parseEnv(production).APP_URL).toBe('https://example.com');
  });

  it('refuses unsafe production settings', () => {
    expect(() => parseEnv({ ...production, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() =>
      parseEnv({ ...production, JWT_ACCESS_SECRET: `replace-with-${'x'.repeat(40)}` }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => parseEnv({ ...good, JWT_REFRESH_SECRET: good.JWT_ACCESS_SECRET })).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('rate limits the public routes that accept forms', () => {
    const limited = (handler: object) => Reflect.getMetadata(AUTH_LIMIT_KEY, handler);
    expect(limited(CareersController.prototype.apply)).toBe(true);
    expect(limited(PublicOffersController.prototype.book)).toBe(true);
  });

  describe('with a running app', () => {
    let ctx: TestContext;
    let user: TestUser;

    beforeAll(async () => {
      ctx = await createTestApp();
      user = await signUp(ctx);
    });
    afterAll(async () => {
      await ctx.app.close();
    });

    it('gives a 400 for a changed page link, not a server error', async () => {
      const cursors = [
        { at: 'x', id: 'y' },
        { at: '2026-01-01 10:00:00.123456+00', id: 'y' },
        { at: 'x', id: randomUUID() },
      ];
      for (const cursor of cursors) {
        const raw = Buffer.from(JSON.stringify(cursor)).toString('base64url');
        await ctx.http().get(`/api/v1/notifications?cursor=${raw}`).set(user.auth).expect(400);
      }
      const real = Buffer.from(
        JSON.stringify({ at: '2026-01-01 10:00:00.123456+00', id: randomUUID() }),
      ).toString('base64url');
      await ctx.http().get(`/api/v1/notifications?cursor=${real}`).set(user.auth).expect(200);
    });

    it('gives a 400 for text the database cannot store', async () => {
      const { body } = await ctx
        .http()
        .patch('/api/v1/me')
        .set(user.auth)
        .send({ fullName: 'a\u0000b' })
        .expect(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('uses plain words for broken requests', async () => {
      const big = await ctx
        .http()
        .patch('/api/v1/me')
        .set(user.auth)
        .send({ fullName: 'x'.repeat(200_000) })
        .expect(413);
      expect(big.body.error.message).toContain('too long');
      const broken = await ctx
        .http()
        .patch('/api/v1/me')
        .set(user.auth)
        .set('content-type', 'application/json')
        .send('{oops')
        .expect(400);
      expect(broken.body.error.message).toBe('We could not read this request.');
      const missing = await ctx.http().get('/api/v1/nope').set(user.auth).expect(404);
      expect(missing.body.error.message).toBe('This page is not available.');
    });

    it('does not count a job that was never applied for in the reply rate', async () => {
      const add = async (title: string, status: string) =>
        ctx
          .http()
          .post('/api/v1/tracker/applications')
          .set(user.auth)
          .send({ title, companyName: 'Acme', status })
          .expect(201);
      const saved = await add('Only saved', 'saved');
      await ctx
        .http()
        .post(`/api/v1/tracker/applications/${saved.body.id}/move`)
        .set(user.auth)
        .send({ toStatus: 'rejected' });
      await add('Applied one', 'applied');
      const { body } = await ctx.http().get('/api/v1/tracker/stats').set(user.auth).expect(200);
      expect(body.responseRate).toBe(0);
    });
  });
});
