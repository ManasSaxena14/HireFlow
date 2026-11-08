import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCompany,
  createTestApp,
  signUp,
  type TestContext,
  type TestUser,
} from './helpers/app.js';

const KINDS = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;
type Kind = (typeof KINDS)[number];

describe('hiring numbers', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let companyId: string;
  let jobs: { id: string; stages: Record<Kind, string> }[];

  const path = (name: string, cid = companyId) => `/api/v1/companies/${cid}/analytics/${name}`;

  const addJob = async (cid: string, title: string) => {
    const job = await ctx.db
      .insertInto('jobs')
      .values({
        companyId: cid,
        title,
        slug: `${title.toLowerCase().replaceAll(' ', '-')}-${randomUUID().slice(0, 6)}`,
        description: 'A job',
        createdBy: admin.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const stages = {} as Record<Kind, string>;
    for (const [position, kind] of KINDS.entries()) {
      const stage = await ctx.db
        .insertInto('pipelineStages')
        .values({ companyId: cid, jobId: job.id, name: kind, position, kind })
        .returning('id')
        .executeTakeFirstOrThrow();
      stages[kind] = stage.id;
    }
    return { id: job.id, stages };
  };

  /** A person who moved through the given steps, applying and deciding on the given days. */
  const addPerson = async (
    job: { id: string; stages: Record<Kind, string> },
    path: Kind[],
    options: { source?: string | null; applied?: string; decided?: string; cid?: string } = {},
  ) => {
    const cid = options.cid ?? companyId;
    const candidate = await ctx.db
      .insertInto('candidates')
      .values({
        companyId: cid,
        fullName: 'Person',
        email: `${randomUUID()}@example.com`,
        source: options.source ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const last = path.at(-1) as Kind;
    const application = await ctx.db
      .insertInto('applications')
      .values({
        companyId: cid,
        jobId: job.id,
        candidateId: candidate.id,
        stageId: job.stages[last],
        appliedAt: new Date(options.applied ?? '2026-10-01T10:00:00Z'),
        decidedAt: options.decided ? new Date(options.decided) : null,
        score: null,
        rejectionReason: last === 'rejected' ? 'Not a fit' : null,
        resumeFileId: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    let from: string | null = null;
    for (const kind of path) {
      await ctx.db
        .insertInto('applicationStageEvents')
        .values({
          companyId: cid,
          applicationId: application.id,
          fromStageId: from,
          toStageId: job.stages[kind],
          actorId: null,
        })
        .execute();
      from = job.stages[kind];
    }
  };

  const range = { from: '2026-09-01', to: '2026-10-31' };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await signUp(ctx);
    companyId = await createCompany(ctx, admin);
    jobs = [await addJob(companyId, 'Backend'), await addJob(companyId, 'Designer')];
    const [backend, designer] = jobs as [(typeof jobs)[0], (typeof jobs)[0]];

    await addPerson(backend, ['applied'], { source: 'LinkedIn' });
    await addPerson(backend, ['applied', 'screening', 'rejected'], { source: 'LinkedIn' });
    await addPerson(backend, ['applied', 'screening', 'interview', 'rejected'], {
      source: 'Referral',
    });
    await addPerson(backend, ['applied', 'screening', 'interview', 'offer', 'hired'], {
      source: 'Referral',
      applied: '2026-10-01T10:00:00Z',
      decided: '2026-10-11T10:00:00Z',
    });
    await addPerson(designer, ['applied', 'screening', 'interview', 'offer', 'hired'], {
      source: ' ',
      applied: '2026-10-01T10:00:00Z',
      decided: '2026-10-21T10:00:00Z',
    });
    // Outside the date range.
    await addPerson(backend, ['applied', 'hired'], {
      applied: '2025-01-01T10:00:00Z',
      decided: '2025-02-01T10:00:00Z',
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('counts the furthest step each person reached', async () => {
    const { body } = await ctx.http().get(path('funnel')).set(admin.auth).query(range).expect(200);
    expect(body).toEqual({
      range,
      total: 5,
      rejected: 2,
      steps: [
        { step: 'applied', count: 5 },
        { step: 'screening', count: 4 },
        { step: 'interview', count: 3 },
        { step: 'offer', count: 2 },
        { step: 'hired', count: 2 },
      ],
    });
  });

  it('filters by job', async () => {
    const { body } = await ctx
      .http()
      .get(path('funnel'))
      .set(admin.auth)
      .query({ ...range, jobId: jobs[1]?.id })
      .expect(200);
    expect(body.total).toBe(1);
  });

  it('works out the time to hire', async () => {
    const { body } = await ctx
      .http()
      .get(path('time-to-hire'))
      .set(admin.auth)
      .query(range)
      .expect(200);
    expect(body).toMatchObject({
      hires: 2,
      medianDays: 15,
      averageDays: 15,
      fastestDays: 10,
      slowestDays: 20,
    });
    expect(body.byJob).toEqual([
      { jobId: jobs[0]?.id, title: 'Backend', hires: 1, medianDays: 10 },
      { jobId: jobs[1]?.id, title: 'Designer', hires: 1, medianDays: 20 },
    ]);
  });

  it('groups by source, with a blank source as not given', async () => {
    const { body } = await ctx.http().get(path('sources')).set(admin.auth).query(range).expect(200);
    expect(body.sources).toEqual([
      { source: 'LinkedIn', applications: 2, hires: 0 },
      { source: 'Referral', applications: 2, hires: 1 },
      { source: 'Not given', applications: 1, hires: 1 },
    ]);
  });

  it('gives empty numbers, not errors, when there is nothing yet', async () => {
    const owner = await signUp(ctx);
    const empty = await createCompany(ctx, owner);
    const funnel = await ctx.http().get(path('funnel', empty)).set(owner.auth).expect(200);
    expect(funnel.body.total).toBe(0);
    const time = await ctx.http().get(path('time-to-hire', empty)).set(owner.auth).expect(200);
    expect(time.body).toMatchObject({ hires: 0, medianDays: null, byJob: [] });
    expect(time.body.range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('shows only this company’s numbers', async () => {
    const owner = await signUp(ctx);
    const other = await createCompany(ctx, owner);
    const job = await addJob(other, 'Other');
    await addPerson(job, ['applied'], { cid: other });
    const { body } = await ctx.http().get(path('funnel')).set(admin.auth).query(range).expect(200);
    expect(body.total).toBe(5);
    // A job id from another company finds nothing here.
    const crossed = await ctx
      .http()
      .get(path('funnel'))
      .set(admin.auth)
      .query({ ...range, jobId: job.id })
      .expect(200);
    expect(crossed.body.total).toBe(0);
    // Someone outside a company is told it does not exist.
    await ctx.http().get(path('funnel', other)).set(admin.auth).expect(404);
  });

  it('is for the hiring team only', async () => {
    const member = async (role: string) => {
      const user = await signUp(ctx);
      await ctx
        .http()
        .post(`/api/v1/companies/${companyId}/members`)
        .set(admin.auth)
        .send({ email: user.email, role })
        .expect(201);
      return user;
    };
    for (const role of ['recruiter', 'hiring_manager']) {
      const user = await member(role);
      await ctx.http().get(path('sources')).set(user.auth).expect(200);
    }
    const interviewer = await member('interviewer');
    await ctx.http().get(path('sources')).set(interviewer.auth).expect(403);
    await ctx.http().get(path('sources')).expect(401);
  });

  it('refuses bad dates', async () => {
    for (const query of [
      { from: '2026-13-01' },
      { from: 'yesterday' },
      { from: '2026-10-02', to: '2026-10-01' },
      { jobId: 'nope' },
    ]) {
      await ctx.http().get(path('funnel')).set(admin.auth).query(query).expect(400);
    }
  });
});
