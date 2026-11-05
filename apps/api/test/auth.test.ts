import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  PASSWORD,
  refreshCookieFrom,
  signUp,
  type TestContext,
} from './helpers/app.js';

describe('auth', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('register', () => {
    it('creates the account and queues a verification email', async () => {
      const user = await signUp(ctx);
      expect(ctx.mail.sent.some((m) => m.to === user.email && m.template === 'verify-email')).toBe(
        true,
      );
    });

    it('never returns the password hash', async () => {
      const response = await ctx
        .http()
        .post('/api/v1/auth/register')
        .send({ email: `hash-${Date.now()}@example.com`, password: PASSWORD, fullName: 'A' })
        .expect(201);
      expect(JSON.stringify(response.body)).not.toContain('argon2');
    });

    it('rejects a duplicate email regardless of case', async () => {
      const user = await signUp(ctx);
      const response = await ctx
        .http()
        .post('/api/v1/auth/register')
        .send({ email: user.email.toUpperCase(), password: PASSWORD, fullName: 'B' })
        .expect(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('returns field errors in the standard format', async () => {
      const response = await ctx
        .http()
        .post('/api/v1/auth/register')
        .send({ email: 'nope', password: 'short', fullName: '' })
        .expect(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.requestId).toMatch(/^req_/);
      const paths = response.body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'fullName']));
    });
  });

  describe('login', () => {
    it('rejects a wrong password without saying which field was wrong', async () => {
      const user = await signUp(ctx);
      const response = await ctx
        .http()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'definitely-wrong' })
        .expect(401);
      expect(response.body.error.message).toBe('Incorrect email or password.');
    });

    it('gives an unknown email the same response', async () => {
      const response = await ctx
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@example.com', password: 'definitely-wrong' })
        .expect(401);
      expect(response.body.error.message).toBe('Incorrect email or password.');
    });

    it('sets the refresh token as an httpOnly cookie, not in the body', async () => {
      const user = await signUp(ctx);
      const response = await ctx
        .http()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      const cookie = (response.headers['set-cookie'] as unknown as string[])[0] as string;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(response.body.refreshToken).toBeUndefined();
    });

    it('aggregates repeated failures into one audit entry', async () => {
      const user = await signUp(ctx);
      for (let i = 0; i < 3; i++) {
        await ctx
          .http()
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: 'definitely-wrong' })
          .expect(401);
      }
      const rows = await ctx.db
        .selectFrom('auditLogs')
        .select('id')
        .where('entityId', '=', user.id)
        .where('action', '=', 'auth.login_failed')
        .execute();
      expect(rows).toHaveLength(1);
    });
  });

  describe('protected routes', () => {
    it('rejects a missing token', async () => {
      const response = await ctx.http().get('/api/v1/me').expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a tampered token', async () => {
      const user = await signUp(ctx);
      await ctx.http().get('/api/v1/me').set('Authorization', `Bearer ${user.token}x`).expect(401);
    });

    it('returns the profile for a valid token', async () => {
      const user = await signUp(ctx);
      const response = await ctx.http().get('/api/v1/me').set(user.auth).expect(200);
      expect(response.body).toMatchObject({ email: user.email, memberships: [] });
      expect(response.body.passwordHash).toBeUndefined();
    });

    it('updates the time zone and refuses an unknown one', async () => {
      const user = await signUp(ctx);
      await ctx
        .http()
        .patch('/api/v1/me')
        .set(user.auth)
        .send({ timezone: 'Mars/Olympus' })
        .expect(400);
      const response = await ctx
        .http()
        .patch('/api/v1/me')
        .set(user.auth)
        .send({ timezone: 'Asia/Kolkata' })
        .expect(200);
      expect(response.body.timezone).toBe('Asia/Kolkata');
    });
  });

  describe('refresh rotation', () => {
    it('issues a new token and a new cookie', async () => {
      const user = await signUp(ctx);
      const response = await ctx
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.cookie)
        .expect(200);
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(refreshCookieFrom(response)).not.toBe(user.cookie);
    });

    it('rejects a request with no cookie', async () => {
      await ctx.http().post('/api/v1/auth/refresh').expect(401);
    });

    const ageRotation = (userId: string) =>
      ctx.db
        .updateTable('refreshTokens')
        .set({ revokedAt: new Date(Date.now() - 60_000) })
        .where('userId', '=', userId)
        .where('revokedAt', 'is not', null)
        .execute();

    it('revokes the whole family when an old token is reused', async () => {
      const user = await signUp(ctx);
      const first = await ctx
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.cookie)
        .expect(200);
      const newest = refreshCookieFrom(first);
      await ageRotation(user.id);

      await ctx.http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
      await ctx.http().post('/api/v1/auth/refresh').set('Cookie', newest).expect(401);

      const audit = await ctx.db
        .selectFrom('auditLogs')
        .select('action')
        .where('entityId', '=', user.id)
        .where('action', '=', 'auth.refresh_reuse_detected')
        .execute();
      // The second attempt is itself a replay, because the family is already dead.
      expect(audit.length).toBeGreaterThanOrEqual(1);
    });

    describe('when the browser never received the new cookie', () => {
      it('accepts the old token again and drops the unseen successor', async () => {
        const user = await signUp(ctx);
        const lost = await ctx
          .http()
          .post('/api/v1/auth/refresh')
          .set('Cookie', user.cookie)
          .expect(200);

        const retry = await ctx
          .http()
          .post('/api/v1/auth/refresh')
          .set('Cookie', user.cookie)
          .expect(200);

        const live = await ctx.db
          .selectFrom('refreshTokens')
          .select('id')
          .where('userId', '=', user.id)
          .where('revokedAt', 'is', null)
          .execute();
        expect(live).toHaveLength(1);

        // The session carries on with the token from the retry.
        await ctx
          .http()
          .post('/api/v1/auth/refresh')
          .set('Cookie', refreshCookieFrom(retry))
          .expect(200);
        expect(refreshCookieFrom(lost)).not.toBe(refreshCookieFrom(retry));
      });

      it('does not let repeat attempts extend the window', async () => {
        const user = await signUp(ctx);
        await ctx.http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(200);
        await ctx.http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(200);
        await ageRotation(user.id);
        await ctx.http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
      });

      it('still catches a thief: the real user trips detection on their next refresh', async () => {
        const user = await signUp(ctx);
        const real = await ctx
          .http()
          .post('/api/v1/auth/refresh')
          .set('Cookie', user.cookie)
          .expect(200);
        const stolen = await ctx
          .http()
          .post('/api/v1/auth/refresh')
          .set('Cookie', user.cookie)
          .expect(200);
        await ageRotation(user.id);

        await ctx
          .http()
          .post('/api/v1/auth/refresh')
          .set('Cookie', refreshCookieFrom(real))
          .expect(401);
        await ctx
          .http()
          .post('/api/v1/auth/refresh')
          .set('Cookie', refreshCookieFrom(stolen))
          .expect(401);
      });

      it('never revives a session that was signed out', async () => {
        const user = await signUp(ctx);
        await ctx
          .http()
          .post('/api/v1/auth/logout')
          .set(user.auth)
          .set('Cookie', user.cookie)
          .expect(204);
        await ctx.http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
      });
    });

    it('refuses an expired token', async () => {
      const user = await signUp(ctx);
      await ctx.db
        .updateTable('refreshTokens')
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where('userId', '=', user.id)
        .execute();
      await ctx.http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
    });
  });

  describe('logout', () => {
    it('ends only the current session', async () => {
      const user = await signUp(ctx);
      const other = await ctx
        .http()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);

      await ctx
        .http()
        .post('/api/v1/auth/logout')
        .set(user.auth)
        .set('Cookie', user.cookie)
        .expect(204);

      await ctx.http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
      await ctx
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookieFrom(other))
        .expect(200);
    });

    it('logout-all ends every session', async () => {
      const user = await signUp(ctx);
      const other = await ctx
        .http()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);

      await ctx.http().post('/api/v1/auth/logout-all').set(user.auth).expect(204);

      await ctx.http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
      await ctx
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookieFrom(other))
        .expect(401);
    });
  });

  describe('email verification', () => {
    it('verifies once and refuses to reuse the token', async () => {
      const user = await signUp(ctx);
      const token = ctx.mail.lastTokenFor(user.email, 'verify-email');

      await ctx.http().post('/api/v1/auth/verify-email').send({ token }).expect(200);
      const me = await ctx.http().get('/api/v1/me').set(user.auth).expect(200);
      expect(me.body.emailVerifiedAt).not.toBeNull();

      await ctx.http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
    });

    it('refuses an expired token', async () => {
      const user = await signUp(ctx);
      const token = ctx.mail.lastTokenFor(user.email, 'verify-email');
      await ctx.db
        .updateTable('emailTokens')
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where('userId', '=', user.id)
        .execute();
      await ctx.http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
    });
  });

  describe('password reset', () => {
    it('always answers 200 and only mails known accounts', async () => {
      const before = ctx.mail.sent.length;
      await ctx
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(200);
      expect(ctx.mail.sent.length).toBe(before);
    });

    it('changes the password, ends sessions and works only once', async () => {
      const user = await signUp(ctx);
      await ctx.http().post('/api/v1/auth/forgot-password').send({ email: user.email }).expect(200);
      const token = ctx.mail.lastTokenFor(user.email, 'reset-password');
      const password = 'a-brand-new-password';

      await ctx.http().post('/api/v1/auth/reset-password').send({ token, password }).expect(200);

      await ctx.http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
      await ctx
        .http()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(401);
      await ctx.http().post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
      await ctx.http().post('/api/v1/auth/reset-password').send({ token, password }).expect(400);
    });

    it('a new request invalidates the previous link', async () => {
      const user = await signUp(ctx);
      await ctx.http().post('/api/v1/auth/forgot-password').send({ email: user.email }).expect(200);
      const first = ctx.mail.lastTokenFor(user.email, 'reset-password');
      await ctx.http().post('/api/v1/auth/forgot-password').send({ email: user.email }).expect(200);

      await ctx
        .http()
        .post('/api/v1/auth/reset-password')
        .send({ token: first, password: 'a-brand-new-password' })
        .expect(400);
    });
  });
});
