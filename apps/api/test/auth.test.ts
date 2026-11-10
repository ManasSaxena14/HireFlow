import { randomUUID } from 'node:crypto';
import { generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Accounts } from '../src/auth/accounts.service.js';
import { createTestApp, neonToken, signUp, type TestContext } from './helpers/app.js';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('auth with Neon Auth tokens', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('checking the token', () => {
    it('rejects a missing token', async () => {
      const response = await ctx.http().get('/api/v1/me').expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a tampered token', async () => {
      const user = await signUp(ctx);
      await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(`${user.token}x`))
        .expect(401);
    });

    it('rejects a token signed with another key', async () => {
      const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
      await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ key: privateKey })))
        .expect(401);
    });

    it('rejects a token from another issuer or for another audience', async () => {
      const other = 'https://someone-else.example';
      await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ issuer: other })))
        .expect(401);
      await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ audience: other })))
        .expect(401);
    });

    it('rejects an expired token', async () => {
      const response = await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ expiresIn: '-1m' })))
        .expect(401);
      expect(response.body.error.message).toBe('Please sign in again.');
    });

    it('lets a public route through without a token', async () => {
      await ctx.http().get('/api/v1/health').expect(200);
    });
  });

  describe('the HireFlow account', () => {
    it('is made on the first request, with the name and email from Neon Auth', async () => {
      const email = `first-${randomUUID()}@example.com`;
      const response = await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ email, name: 'Asha Rao' })))
        .expect(200);
      expect(response.body).toMatchObject({
        email,
        fullName: 'Asha Rao',
        timezone: 'UTC',
        emailVerifiedAt: null,
        memberships: [],
      });
    });

    it('is the same account on every later request', async () => {
      const user = await signUp(ctx);
      const again = await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ sub: user.sub, email: user.email })))
        .expect(200);
      expect(again.body.id).toBe(user.id);
    });

    it('makes one account when the first requests arrive together', async () => {
      const token = await neonToken();
      const responses = await Promise.all(
        [1, 2, 3].map(() => ctx.http().get('/api/v1/me').set(bearer(token))),
      );
      const ids = new Set(responses.map((r) => r.body.id));
      expect(responses.every((r) => r.status === 200)).toBe(true);
      expect(ids.size).toBe(1);
    });

    it('follows the confirmed state and email from Neon Auth', async () => {
      const user = await signUp(ctx);
      const email = `changed-${randomUUID()}@example.com`;
      const response = await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ sub: user.sub, email, emailVerified: true })))
        .expect(200);
      expect(response.body.email).toBe(email);
      expect(response.body.emailVerifiedAt).not.toBeNull();
    });

    it('takes over an older account only when the email is confirmed', async () => {
      const email = `older-${randomUUID()}@example.com`;
      const older = await ctx.db
        .insertInto('users')
        .values({ email, fullName: 'Older Account', emailVerifiedAt: new Date() })
        .returning('id')
        .executeTakeFirstOrThrow();

      const unconfirmed = await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ email, emailVerified: false })))
        .expect(409);
      expect(unconfirmed.body.error.code).toBe('CONFLICT');

      const confirmed = await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ email, emailVerified: true })))
        .expect(200);
      expect(confirmed.body).toMatchObject({ id: older.id, fullName: 'Older Account' });
    });

    it('is not taken over twice', async () => {
      const user = await signUp(ctx, { emailVerified: true });
      const response = await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ email: user.email, emailVerified: true })))
        .expect(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('takes over an older account once when first requests arrive together', async () => {
      const email = `together-${randomUUID()}@example.com`;
      const older = await ctx.db
        .insertInto('users')
        .values({ email, fullName: 'Older Account', emailVerifiedAt: new Date() })
        .returning('id')
        .executeTakeFirstOrThrow();
      const token = await neonToken({ email, emailVerified: true });
      const responses = await Promise.all(
        [1, 2, 3, 4].map(() => ctx.http().get('/api/v1/me').set(bearer(token))),
      );
      expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      expect(new Set(responses.map((r) => r.body.id))).toEqual(new Set([older.id]));
    });

    it('refuses an email change to an address another account uses', async () => {
      const first = await signUp(ctx, { emailVerified: true });
      const second = await signUp(ctx, { emailVerified: true });
      const response = await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(await neonToken({ sub: second.sub, email: first.email, emailVerified: true })))
        .expect(409);
      expect(response.body.error.message).toBe('Another account already uses this email.');
    });

    it('stops a turned off account', async () => {
      const user = await signUp(ctx);
      await ctx.db
        .updateTable('users')
        .set({ isActive: false })
        .where('id', '=', user.id)
        .execute();
      ctx.app.get(Accounts).forget();
      const response = await ctx.http().get('/api/v1/me').set(user.auth).expect(401);
      expect(response.body.error.message).toBe('This account is turned off.');
    });
  });

  describe('profile', () => {
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

    it('has no sign-in routes of its own any more', async () => {
      await ctx.http().post('/api/v1/auth/login').send({}).expect(404);
    });
  });
});
