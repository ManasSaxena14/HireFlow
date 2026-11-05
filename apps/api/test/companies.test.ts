import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCompany,
  createTestApp,
  signUp,
  type TestContext,
  type TestUser,
} from './helpers/app.js';

describe('companies and memberships', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let companyId: string;

  const addMember = async (role: string) => {
    const member = await signUp(ctx);
    await ctx
      .http()
      .post(`/api/v1/companies/${companyId}/members`)
      .set(owner.auth)
      .send({ email: member.email, role })
      .expect(201);
    return member;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    owner = await signUp(ctx);
    companyId = await createCompany(ctx, owner);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('makes the creator an admin and shows the company on their profile', async () => {
    const me = await ctx.http().get('/api/v1/me').set(owner.auth).expect(200);
    expect(me.body.memberships).toEqual([expect.objectContaining({ companyId, role: 'admin' })]);
  });

  it('generates a slug and handles a clash', async () => {
    const first = await ctx
      .http()
      .post('/api/v1/companies')
      .set(owner.auth)
      .send({ name: 'Acme Robotics Ltd.' })
      .expect(201);
    expect(first.body.slug).toBe('acme-robotics-ltd');

    const second = await ctx
      .http()
      .post('/api/v1/companies')
      .set(owner.auth)
      .send({ name: 'Acme Robotics Ltd.' })
      .expect(201);
    expect(second.body.slug).toMatch(/^acme-robotics-ltd-/);
  });

  it('refuses a chosen slug that is taken', async () => {
    await ctx
      .http()
      .post('/api/v1/companies')
      .set(owner.auth)
      .send({ name: 'Taken', slug: 'taken-slug' })
      .expect(201);
    await ctx
      .http()
      .post('/api/v1/companies')
      .set(owner.auth)
      .send({ name: 'Taken again', slug: 'taken-slug' })
      .expect(409);
  });

  describe('role checks', () => {
    it.each(['recruiter', 'hiring_manager', 'interviewer'])(
      '%s can read the company but not change it',
      async (role) => {
        const member = await addMember(role);
        await ctx.http().get(`/api/v1/companies/${companyId}`).set(member.auth).expect(200);
        const denied = await ctx
          .http()
          .patch(`/api/v1/companies/${companyId}`)
          .set(member.auth)
          .send({ name: 'Renamed' })
          .expect(403);
        expect(denied.body.error.code).toBe('FORBIDDEN');
      },
    );

    it('only an admin can manage members', async () => {
      const recruiter = await addMember('recruiter');
      const stranger = await signUp(ctx);
      await ctx
        .http()
        .post(`/api/v1/companies/${companyId}/members`)
        .set(recruiter.auth)
        .send({ email: stranger.email, role: 'admin' })
        .expect(403);
      await ctx
        .http()
        .delete(`/api/v1/companies/${companyId}/members/${owner.id}`)
        .set(recruiter.auth)
        .expect(403);
    });

    it('an admin can update the company', async () => {
      const response = await ctx
        .http()
        .patch(`/api/v1/companies/${companyId}`)
        .set(owner.auth)
        .send({ careersEnabled: false })
        .expect(200);
      expect(response.body.careersEnabled).toBe(false);
    });
  });

  describe('tenant isolation', () => {
    it('company A cannot read or change company B', async () => {
      const rival = await signUp(ctx);
      const rivalCompany = await createCompany(ctx, rival);

      const read = await ctx
        .http()
        .get(`/api/v1/companies/${rivalCompany}`)
        .set(owner.auth)
        .expect(404);
      expect(read.body.error.code).toBe('NOT_FOUND');
      await ctx
        .http()
        .patch(`/api/v1/companies/${rivalCompany}`)
        .set(owner.auth)
        .send({ name: 'Hijacked' })
        .expect(404);
      await ctx
        .http()
        .post(`/api/v1/companies/${rivalCompany}/members`)
        .set(owner.auth)
        .send({ email: owner.email, role: 'admin' })
        .expect(404);
      await ctx
        .http()
        .delete(`/api/v1/companies/${rivalCompany}/members/${rival.id}`)
        .set(owner.auth)
        .expect(404);
    });

    it('an admin of A cannot change a member of B through the A path', async () => {
      const rival = await signUp(ctx);
      await createCompany(ctx, rival);
      await ctx
        .http()
        .patch(`/api/v1/companies/${companyId}/members/${rival.id}`)
        .set(owner.auth)
        .send({ role: 'interviewer' })
        .expect(404);
    });

    it('a malformed company id is a plain 404', async () => {
      await ctx.http().get('/api/v1/companies/not-a-uuid').set(owner.auth).expect(404);
    });
  });

  describe('managing members', () => {
    it('adding someone twice conflicts; an unknown email is not found', async () => {
      const member = await addMember('interviewer');
      await ctx
        .http()
        .post(`/api/v1/companies/${companyId}/members`)
        .set(owner.auth)
        .send({ email: member.email, role: 'recruiter' })
        .expect(409);
      await ctx
        .http()
        .post(`/api/v1/companies/${companyId}/members`)
        .set(owner.auth)
        .send({ email: 'no-account@example.com', role: 'recruiter' })
        .expect(404);
    });

    it('audits role changes and removals', async () => {
      const member = await addMember('interviewer');
      await ctx
        .http()
        .patch(`/api/v1/companies/${companyId}/members/${member.id}`)
        .set(owner.auth)
        .send({ role: 'recruiter' })
        .expect(200);
      await ctx
        .http()
        .delete(`/api/v1/companies/${companyId}/members/${member.id}`)
        .set(owner.auth)
        .expect(204);

      const actions = await ctx.db
        .selectFrom('auditLogs')
        .select('action')
        .where('companyId', '=', companyId)
        .where('entityId', '=', member.id)
        .orderBy('id')
        .execute();
      expect(actions.map((a) => a.action)).toEqual([
        'member.added',
        'member.role_changed',
        'member.removed',
      ]);
    });

    it('the last admin cannot be demoted or removed', async () => {
      const founder = await signUp(ctx);
      const company = await createCompany(ctx, founder);
      await ctx
        .http()
        .patch(`/api/v1/companies/${company}/members/${founder.id}`)
        .set(founder.auth)
        .send({ role: 'recruiter' })
        .expect(409);
      await ctx
        .http()
        .delete(`/api/v1/companies/${company}/members/${founder.id}`)
        .set(founder.auth)
        .expect(409);
    });
  });

  it('audit logs refuse updates and deletes at the database level', async () => {
    await expect(
      ctx.db.deleteFrom('auditLogs').where('companyId', '=', companyId).execute(),
    ).rejects.toThrow(/append only/);
    await expect(
      ctx.db
        .updateTable('auditLogs')
        .set({ action: 'x' })
        .where('companyId', '=', companyId)
        .execute(),
    ).rejects.toThrow(/append only/);
  });
});
