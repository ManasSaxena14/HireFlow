import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCompany,
  createTestApp,
  signUp,
  type TestContext,
  type TestUser,
} from './helpers/app.js';

describe('activity log', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let companyId: string;
  const path = (cid = companyId) => `/api/v1/companies/${cid}/audit-logs`;

  const addMember = async (role: string) => {
    const user = await signUp(ctx);
    await ctx
      .http()
      .post(`/api/v1/companies/${companyId}/members`)
      .set(admin.auth)
      .send({ email: user.email, role })
      .expect(201);
    return user;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await signUp(ctx);
    companyId = await createCompany(ctx, admin);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('shows what happened, newest first, with who did it', async () => {
    const recruiter = await addMember('recruiter');
    const { body } = await ctx.http().get(path()).set(admin.auth).expect(200);
    expect(body.items[0]).toMatchObject({
      entityType: 'user',
      entityId: recruiter.id,
      actor: { id: admin.id, email: admin.email },
    });
    expect(body.items.at(-1).action).toBe('company.created');
    expect(typeof body.items[0].id).toBe('string');
  });

  it('filters and goes page by page', async () => {
    for (let index = 0; index < 3; index++) await addMember('interviewer');
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: {
        body: { items: { id: string; entityType: string }[]; nextCursor: string | null };
      } = await ctx
        .http()
        .get(path())
        .set(admin.auth)
        .query({ entityType: 'user', limit: 2, ...(cursor ? { cursor } : {}) })
        .expect(200);
      expect(page.body.items.every((item) => item.entityType === 'user')).toBe(true);
      seen.push(...page.body.items.map((item) => item.id));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(4);

    const byActor = await ctx
      .http()
      .get(path())
      .set(admin.auth)
      .query({ actorId: randomUUID() })
      .expect(200);
    expect(byActor.body.items).toEqual([]);
  });

  it('is for admins only, and only for their own company', async () => {
    const recruiter = await addMember('recruiter');
    await ctx.http().get(path()).set(recruiter.auth).expect(403);
    await ctx.http().get(path()).expect(401);
    const owner = await signUp(ctx);
    const other = await createCompany(ctx, owner);
    await ctx.http().get(path(other)).set(admin.auth).expect(404);
  });

  it('refuses a broken page link and bad filters', async () => {
    for (const query of [
      { cursor: 'broken' },
      { actorId: 'nope' },
      { from: '2026-02-30' },
      { limit: 500 },
    ]) {
      await ctx.http().get(path()).set(admin.auth).query(query).expect(400);
    }
  });
});
