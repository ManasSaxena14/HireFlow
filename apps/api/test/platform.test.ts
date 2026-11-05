import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCESS_KEY } from '../src/common/access.js';
import { parseEnv } from '../src/config/config.service.js';
import { createTestApp, type TestContext } from './helpers/app.js';

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
