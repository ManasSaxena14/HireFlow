import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCompany,
  createTestApp,
  signUp,
  type TestContext,
  type TestUser,
} from './helpers/app.js';

const PDF = Buffer.from('%PDF-1.7\nA small test resume\n');

interface Stage {
  id: string;
  kind: string;
}

describe('the job board follows the hiring process', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let companyId: string;
  let companySlug: string;
  let companyName: string;
  const api = () => `/api/v1/companies/${companyId}`;

  const verified = () => signUp(ctx, { emailVerified: true });

  const openJob = async (title = 'Backend Developer', location = 'Pune') => {
    const { body } = await ctx
      .http()
      .post(`${api()}/jobs`)
      .set(admin.auth)
      .send({
        title,
        location,
        description: 'Build and run the services that power our product.',
        skills: ['Node.js'],
      })
      .expect(201);
    await ctx.http().post(`${api()}/jobs/${body.id}/publish`).set(admin.auth).expect(200);
    return body as { id: string; slug: string; stages: Stage[] };
  };

  const applyAs = (job: { slug: string }, email: string, who?: TestUser) => {
    const request = ctx
      .http()
      .post(`/api/v1/public/companies/${companySlug}/jobs/${job.slug}/apply`)
      .field('fullName', 'Asha Rao')
      .field('email', email)
      .attach('resume', PDF, 'resume.pdf');
    return who ? request.set(who.auth) : request;
  };

  const board = async (who: TestUser) =>
    (await ctx.http().get('/api/v1/tracker/applications?limit=100').set(who.auth).expect(200)).body
      .items as {
      id: string;
      title: string;
      companyName: string;
      status: string;
      source: string | null;
      linked: boolean;
    }[];

  const applicationOf = async (job: { id: string }, email: string) => {
    const { body } = await ctx
      .http()
      .get(`${api()}/applications?jobId=${job.id}&limit=100`)
      .set(admin.auth)
      .expect(200);
    return body.items.find(
      (item: { candidate: { email: string } }) => item.candidate.email === email,
    ) as {
      id: string;
    };
  };

  const moveTo = (job: { stages: Stage[] }, applicationId: string, kind: string, reason?: string) =>
    ctx
      .http()
      .post(`${api()}/applications/${applicationId}/move`)
      .set(admin.auth)
      .send({ toStageId: job.stages.find((stage) => stage.kind === kind)?.id, reason })
      .expect(200);

  const notifications = async (who: TestUser) =>
    (await ctx.http().get('/api/v1/notifications').set(who.auth).expect(200)).body.items as {
      type: string;
      payload: { message: string; trackedApplicationId?: string; link?: string };
    }[];

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await signUp(ctx);
    companyId = await createCompany(ctx, admin);
    const company = await ctx.http().get(api()).set(admin.auth).expect(200);
    companySlug = company.body.slug;
    companyName = company.body.name;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('puts the application on the job board when someone applies while signed in', async () => {
    const user = await verified();
    const job = await openJob();
    await applyAs(job, user.email, user).expect(201);

    const cards = await board(user);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: 'Backend Developer',
      companyName,
      status: 'applied',
      source: 'HireFlow',
      linked: true,
    });
    const events = await ctx
      .http()
      .get(`/api/v1/tracker/applications/${cards[0]?.id}/events`)
      .set(user.auth)
      .expect(200);
    expect(events.body[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'applied',
      note: `${companyName}: Application received`,
    });
    const first = (await notifications(user))[0];
    expect(first?.type).toBe('application-update');
    expect(first?.payload.link).toBe(`/app/tracker/${cards[0]?.id}`);

    const stats = await ctx.http().get('/api/v1/tracker/stats').set(user.auth).expect(200);
    expect(stats.body.byStatus.applied).toBe(1);
  });

  it('follows every move the company makes, in the same moment', async () => {
    const user = await verified();
    const job = await openJob('Data Analyst');
    await applyAs(job, user.email, user).expect(201);
    const application = await applicationOf(job, user.email);
    const status = async () => (await board(user))[0]?.status;

    for (const [kind, expected, words] of [
      ['screening', 'screening', 'to the first round'],
      ['interview', 'interview', 'to the interview step'],
      ['offer', 'offer', 'to the offer step'],
      ['hired', 'offer', 'as hired'],
    ] as const) {
      await moveTo(job, application.id, kind);
      expect(await status()).toBe(expected);
      expect((await notifications(user))[0]?.payload.message).toContain(words);
    }

    const card = (await board(user))[0];
    const events = await ctx
      .http()
      .get(`/api/v1/tracker/applications/${card?.id}/events`)
      .set(user.auth)
      .expect(200);
    expect(events.body.map((event: { toStatus: string }) => event.toStatus)).toEqual([
      'applied',
      'screening',
      'interview',
      'offer',
      'offer',
    ]);
    expect(events.body.at(-1).note).toBe(`${companyName}: You got the job`);

    await moveTo(job, application.id, 'rejected', 'Not the right skills');
    expect(await status()).toBe('rejected');
    const message = (await notifications(user))[0]?.payload.message;
    expect(message).toContain('did not select');
    // The reason is for the company. It never reaches the candidate.
    expect(JSON.stringify(await notifications(user))).not.toContain('Not the right skills');
    const history = await ctx
      .http()
      .get(`/api/v1/tracker/applications/${card?.id}/events`)
      .set(user.auth);
    expect(JSON.stringify(history.body)).not.toContain('Not the right skills');

    const reminders = await ctx
      .http()
      .get(`/api/v1/tracker/applications/${card?.id}`)
      .set(user.auth)
      .expect(200);
    expect(
      reminders.body.reminders.filter((r: { kind: string }) => r.kind === 'follow_up'),
    ).toEqual([]);
  });

  it('shows the move in the board numbers right away', async () => {
    const user = await verified();
    const job = await openJob('Designer');
    await applyAs(job, user.email, user).expect(201);
    await moveTo(job, (await applicationOf(job, user.email)).id, 'interview');
    const stats = await ctx.http().get('/api/v1/tracker/stats').set(user.auth).expect(200);
    expect(stats.body.byStatus).toMatchObject({ applied: 0, interview: 1 });
  });

  it('does not link anyone who cannot prove the email is theirs', async () => {
    const job = await openJob('Support Lead');
    const owner = await verified();

    // Not signed in: anyone can type any email.
    await applyAs(job, owner.email).expect(201);
    expect(await board(owner)).toEqual([]);

    // Signed in, but with a different email on the form.
    const other = await verified();
    await applyAs(job, `someone-${randomUUID()}@example.com`, other).expect(201);
    expect(await board(other)).toEqual([]);

    // Signed in with the same email, but it was never confirmed.
    const unconfirmed = await signUp(ctx);
    await applyAs(job, unconfirmed.email, unconfirmed).expect(201);
    expect(await board(unconfirmed)).toEqual([]);

    const linked = await ctx.db
      .selectFrom('candidates')
      .select('userId')
      .where('companyId', '=', companyId)
      .where('email', 'in', [owner.email, unconfirmed.email])
      .execute();
    expect(linked).toHaveLength(2);
    expect(linked.filter((row) => row.userId !== null)).toEqual([]);
  });

  it('makes a card only for an application made while signed in, even if the email is known', async () => {
    const user = await verified();
    const job = await openJob('Ops Manager');
    await applyAs(job, user.email, user).expect(201);
    const second = await openJob('Ops Lead');
    await applyAs(second, user.email).expect(201);
    expect((await board(user)).map((card) => card.title)).toEqual(['Ops Manager']);
    // A move by the company does not make a card either.
    await moveTo(second, (await applicationOf(second, user.email)).id, 'interview');
    expect((await board(user)).map((card) => card.title)).toEqual(['Ops Manager']);
    expect((await notifications(user)).some((n) => n.payload.message.includes('Ops Lead'))).toBe(
      false,
    );
  });

  it('joins a card the person made by hand, instead of adding a second one', async () => {
    const user = await verified();
    const job = await openJob('Platform Engineer', 'Remote');
    await ctx
      .http()
      .post('/api/v1/tracker/applications')
      .set(user.auth)
      .send({
        title: 'platform engineer',
        companyName: companyName.toUpperCase(),
        location: 'remote',
      })
      .expect(201);
    await applyAs(job, user.email, user).expect(201);
    const cards = await board(user);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ status: 'applied', linked: true });

    await moveTo(job, (await applicationOf(job, user.email)).id, 'screening');
    expect((await board(user))[0]?.status).toBe('screening');
  });

  it('lets the company win if the person moves a linked card by hand', async () => {
    const user = await verified();
    const job = await openJob('QA Engineer');
    await applyAs(job, user.email, user).expect(201);
    const card = (await board(user))[0];
    await ctx
      .http()
      .post(`/api/v1/tracker/applications/${card?.id}/move`)
      .set(user.auth)
      .send({ toStatus: 'withdrawn' })
      .expect(200);
    await moveTo(job, (await applicationOf(job, user.email)).id, 'interview');
    expect((await board(user))[0]?.status).toBe('interview');
  });

  it('stays quiet for a card the person archived', async () => {
    const user = await verified();
    const job = await openJob('Archive Test');
    await applyAs(job, user.email, user).expect(201);
    const card = (await board(user))[0];
    await ctx.http().delete(`/api/v1/tracker/applications/${card?.id}`).set(user.auth).expect(204);
    const before = (await notifications(user)).length;
    await moveTo(job, (await applicationOf(job, user.email)).id, 'screening');
    expect((await notifications(user)).length).toBe(before);
  });

  it('keeps the card, but no longer linked, when the company deletes the candidate', async () => {
    const user = await verified();
    const job = await openJob('Delete Test');
    await applyAs(job, user.email, user).expect(201);
    const application = await ctx
      .http()
      .get(`${api()}/applications/${(await applicationOf(job, user.email)).id}`)
      .set(admin.auth)
      .expect(200);
    await ctx
      .http()
      .delete(`${api()}/candidates/${application.body.candidate.id}`)
      .set(admin.auth)
      .expect(204);
    const cards = await board(user);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.linked).toBe(false);
  });

  it('keeps other people’s boards apart', async () => {
    const first = await verified();
    const second = await verified();
    const job = await openJob('Privacy Test');
    await applyAs(job, first.email, first).expect(201);
    await moveTo(job, (await applicationOf(job, first.email)).id, 'interview');
    expect(await board(second)).toEqual([]);
    expect(await notifications(second)).toEqual([]);
  });

  it('tells a candidate with an account about their interview', async () => {
    const user = await verified();
    const job = await openJob('Interview Test');
    await applyAs(job, user.email, user).expect(201);
    const application = await applicationOf(job, user.email);
    const start = new Date(Date.now() + 3 * 24 * 3_600_000);
    start.setMinutes(0, 0, 0);
    await ctx
      .http()
      .post(`${api()}/interviews`)
      .set(admin.auth)
      .send({
        applicationId: application.id,
        interviewerId: admin.id,
        start: start.toISOString(),
        durationMin: 45,
      })
      .expect(201);
    const message = (await notifications(user))[0];
    expect(message?.type).toBe('interview');
    expect(message?.payload.message).toContain('New interview: Interview Test');
    expect(message?.payload.link).toBe('/app/interviews');
    const mine = await ctx.http().get('/api/v1/me/interviews').set(user.auth).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].role).toBe('candidate');
  });
});
