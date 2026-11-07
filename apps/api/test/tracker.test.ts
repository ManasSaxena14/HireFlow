import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jobHash } from '@hireflow/shared/node';
import { createTestApp, signUp, type TestContext, type TestUser } from './helpers/app.js';

const BASE = '/api/v1/tracker/applications';
let sequence = 0;

const job = (overrides: Record<string, unknown> = {}) => ({
  title: `Engineer ${++sequence}`,
  companyName: 'Northwind',
  location: 'Remote',
  ...overrides,
});

describe('tracker', () => {
  let ctx: TestContext;
  let user: TestUser;

  const add = async (owner: TestUser, overrides: Record<string, unknown> = {}) => {
    const response = await ctx.http().post(BASE).set(owner.auth).send(job(overrides)).expect(201);
    return response.body;
  };
  const move = (owner: TestUser, id: string, toStatus: string, note?: string) =>
    ctx.http().post(`${BASE}/${id}/move`).set(owner.auth).send({ toStatus, note });
  const remindersOf = (id: string) =>
    ctx.db.selectFrom('reminders').selectAll().where('trackedApplicationId', '=', id).execute();

  beforeAll(async () => {
    ctx = await createTestApp();
    user = await signUp(ctx);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('creating', () => {
    it('saves a job, records the first event and hides internal columns', async () => {
      const created = await add(user);
      expect(created.status).toBe('saved');
      expect(created.jobHash).toBeUndefined();
      expect(created.userId).toBeUndefined();

      const events = await ctx
        .http()
        .get(`${BASE}/${created.id}/events`)
        .set(user.auth)
        .expect(200);
      expect(events.body).toEqual([
        expect.objectContaining({ fromStatus: null, toStatus: 'saved' }),
      ]);
    });

    it('returns 409 DUPLICATE_JOB and points at the existing card', async () => {
      const created = await add(user, { title: 'Staff Engineer', companyName: 'Acme' });
      const response = await ctx
        .http()
        .post(BASE)
        .set(user.auth)
        .send(job({ title: '  staff engineer ', companyName: 'ACME' }))
        .expect(409);
      expect(response.body.error.code).toBe('DUPLICATE_JOB');
      expect(response.body.error.details[0].existingId).toBe(created.id);
    });

    it('lets two different users track the same job', async () => {
      const other = await signUp(ctx);
      const shared = { title: 'Shared Role', companyName: 'Tessera' };
      await add(user, shared);
      await add(other, shared);
    });

    it('rejects bad input with field errors', async () => {
      const response = await ctx
        .http()
        .post(BASE)
        .set(user.auth)
        .send({
          title: '',
          companyName: 'x',
          jobUrl: 'javascript:alert(1)',
          salaryMin: 10,
          salaryMax: 5,
        })
        .expect(400);
      const paths = response.body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['title', 'jobUrl']));
    });

    it('requires a login', async () => {
      await ctx.http().get(BASE).expect(401);
      await ctx.http().post(BASE).send(job()).expect(401);
    });
  });

  describe('job hash', () => {
    it('ignores case, spacing and location punctuation', () => {
      expect(jobHash(' Engineer ', 'ACME', 'New York, NY')).toBe(
        jobHash('engineer', 'acme', 'new york ny'),
      );
    });
    it('treats a different location as a different job', () => {
      expect(jobHash('Engineer', 'Acme', 'London')).not.toBe(jobHash('Engineer', 'Acme', 'Paris'));
    });
  });

  describe('moving', () => {
    it('writes an event with the note for every move', async () => {
      const { id } = await add(user);
      await move(user, id, 'applied', 'Sent through the referral').expect(200);
      await move(user, id, 'interview').expect(200);

      const events = await ctx.http().get(`${BASE}/${id}/events`).set(user.auth).expect(200);
      expect(events.body.map((e: { toStatus: string }) => e.toStatus)).toEqual([
        'saved',
        'applied',
        'interview',
      ]);
      expect(events.body[1]).toMatchObject({
        fromStatus: 'saved',
        note: 'Sent through the referral',
      });
    });

    it('moving to the same status changes nothing', async () => {
      const { id } = await add(user);
      await move(user, id, 'saved').expect(200);
      const events = await ctx.http().get(`${BASE}/${id}/events`).set(user.auth).expect(200);
      expect(events.body).toHaveLength(1);
    });

    it('rejects an unknown status', async () => {
      const { id } = await add(user);
      await move(user, id, 'hired').expect(400);
    });

    it('first move to applied sets applied_at and one follow-up seven days out', async () => {
      const { id } = await add(user);
      const before = Date.now();
      const moved = await move(user, id, 'applied').expect(200);
      expect(moved.body.appliedAt).not.toBeNull();

      const reminders = await remindersOf(id);
      expect(reminders).toHaveLength(1);
      expect(reminders[0]?.kind).toBe('follow_up');
      const days = ((reminders[0]?.remindAt.getTime() as number) - before) / 86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThan(7.01);
    });

    it('moving away and back keeps applied_at and does not add a second follow-up', async () => {
      const { id } = await add(user);
      const first = await move(user, id, 'applied').expect(200);
      await move(user, id, 'screening').expect(200);
      const again = await move(user, id, 'applied').expect(200);

      expect(again.body.appliedAt).toBe(first.body.appliedAt);
      expect(await remindersOf(id)).toHaveLength(1);
    });

    it('creating directly as applied also schedules the follow-up', async () => {
      const created = await add(user, { status: 'applied' });
      expect(created.appliedAt).not.toBeNull();
      expect(await remindersOf(created.id)).toHaveLength(1);
    });

    it.each(['rejected', 'withdrawn', 'offer'])(
      'moving to %s cancels the pending follow-up but keeps custom reminders',
      async (status) => {
        const { id } = await add(user);
        await move(user, id, 'applied').expect(200);
        await ctx
          .http()
          .post(`${BASE}/${id}/reminders`)
          .set(user.auth)
          .send({
            remindAt: new Date(Date.now() + 86_400_000).toISOString(),
            message: 'Prepare questions',
          })
          .expect(201);

        await move(user, id, status).expect(200);

        const reminders = await remindersOf(id);
        expect(reminders.map((r) => r.kind)).toEqual(['custom']);
      },
    );

    it('does not cancel a follow-up that has already been sent', async () => {
      const { id } = await add(user);
      await move(user, id, 'applied').expect(200);
      await ctx.db
        .updateTable('reminders')
        .set({ sentAt: new Date() })
        .where('trackedApplicationId', '=', id)
        .execute();
      await move(user, id, 'rejected').expect(200);
      expect(await remindersOf(id)).toHaveLength(1);
    });
  });

  describe('reading and editing', () => {
    it('detail includes reminders', async () => {
      const { id } = await add(user);
      await move(user, id, 'applied').expect(200);
      const detail = await ctx.http().get(`${BASE}/${id}`).set(user.auth).expect(200);
      expect(detail.body.reminders).toEqual([
        expect.objectContaining({ kind: 'follow_up', sentAt: null }),
      ]);
    });

    it('edits fields and clears optional ones', async () => {
      const { id } = await add(user, { source: 'LinkedIn' });
      const response = await ctx
        .http()
        .patch(`${BASE}/${id}`)
        .set(user.auth)
        .send({ source: '', tags: ['remote'], salaryMin: 100, currency: 'inr' })
        .expect(200);
      expect(response.body).toMatchObject({
        source: null,
        tags: ['remote'],
        salaryMin: 100,
        currency: 'INR',
      });
    });

    it('an edit that collides with another card returns DUPLICATE_JOB', async () => {
      const first = await add(user, { title: 'Collision A', companyName: 'Meridian' });
      const second = await add(user, { title: 'Collision B', companyName: 'Meridian' });
      const response = await ctx
        .http()
        .patch(`${BASE}/${second.id}`)
        .set(user.auth)
        .send({ title: 'Collision A' })
        .expect(409);
      expect(response.body.error.details[0].existingId).toBe(first.id);
    });

    it('notes are listed newest first', async () => {
      const { id } = await add(user);
      await ctx
        .http()
        .post(`${BASE}/${id}/notes`)
        .set(user.auth)
        .send({ body: 'first' })
        .expect(201);
      await ctx
        .http()
        .post(`${BASE}/${id}/notes`)
        .set(user.auth)
        .send({ body: 'second' })
        .expect(201);
      await ctx.http().post(`${BASE}/${id}/notes`).set(user.auth).send({ body: '   ' }).expect(400);
      const notes = await ctx.http().get(`${BASE}/${id}/notes`).set(user.auth).expect(200);
      expect(notes.body.map((n: { body: string }) => n.body)).toEqual(['second', 'first']);
    });

    it('refuses a reminder in the past', async () => {
      const { id } = await add(user);
      await ctx
        .http()
        .post(`${BASE}/${id}/reminders`)
        .set(user.auth)
        .send({ remindAt: '2020-01-01T00:00:00Z', message: 'Too late' })
        .expect(400);
    });
  });

  describe('archiving', () => {
    it('hides the card, cancels reminders and can be undone', async () => {
      const { id } = await add(user);
      await move(user, id, 'applied').expect(200);
      await ctx.http().delete(`${BASE}/${id}`).set(user.auth).expect(204);

      expect(await remindersOf(id)).toHaveLength(0);
      const active = await ctx.http().get(`${BASE}?limit=100`).set(user.auth).expect(200);
      expect(active.body.items.map((a: { id: string }) => a.id)).not.toContain(id);
      const archived = await ctx.http().get(`${BASE}?archived=true`).set(user.auth).expect(200);
      expect(archived.body.items.map((a: { id: string }) => a.id)).toContain(id);

      await ctx.http().patch(`${BASE}/${id}`).set(user.auth).send({ archived: false }).expect(200);
      const restored = await ctx.http().get(`${BASE}/${id}`).set(user.auth).expect(200);
      expect(restored.body.archivedAt).toBeNull();
    });
  });

  describe('listing', () => {
    let owner: TestUser;

    beforeAll(async () => {
      owner = await signUp(ctx);
      await add(owner, { title: 'Alpha Engineer', companyName: 'Halcyon', tags: ['remote'] });
      await add(owner, { title: 'Beta Analyst', companyName: 'Meridian 100%', status: 'applied' });
      await add(owner, {
        title: 'Gamma Designer',
        companyName: 'Tessera',
        tags: ['remote', 'senior'],
      });
    });

    const titles = (body: { items: { title: string }[] }) => body.items.map((i) => i.title);

    it('filters by status, tag and search text', async () => {
      const byStatus = await ctx.http().get(`${BASE}?status=applied`).set(owner.auth).expect(200);
      expect(titles(byStatus.body)).toEqual(['Beta Analyst']);

      const byTag = await ctx.http().get(`${BASE}?tag=senior`).set(owner.auth).expect(200);
      expect(titles(byTag.body)).toEqual(['Gamma Designer']);

      const byTitle = await ctx.http().get(`${BASE}?q=alpha`).set(owner.auth).expect(200);
      expect(titles(byTitle.body)).toEqual(['Alpha Engineer']);

      const byCompany = await ctx.http().get(`${BASE}?q=tessera`).set(owner.auth).expect(200);
      expect(titles(byCompany.body)).toEqual(['Gamma Designer']);
    });

    it('treats % in a search as plain text', async () => {
      const response = await ctx
        .http()
        .get(`${BASE}?q=${encodeURIComponent('100%')}`)
        .set(owner.auth)
        .expect(200);
      expect(titles(response.body)).toEqual(['Beta Analyst']);
      const wildcard = await ctx
        .http()
        .get(`${BASE}?q=${encodeURIComponent('%')}`)
        .set(owner.auth)
        .expect(200);
      expect(titles(wildcard.body)).toEqual(['Beta Analyst']);
    });

    it('pages through everything exactly once with a cursor', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `&cursor=${cursor}` : '';
        const response = await ctx
          .http()
          .get(`${BASE}?limit=2${query}`)
          .set(owner.auth)
          .expect(200);
        seen.push(...titles(response.body));
        cursor = response.body.nextCursor;
      } while (cursor);
      expect(seen).toEqual(['Gamma Designer', 'Beta Analyst', 'Alpha Engineer']);
    });

    it('rejects a broken cursor and an oversized limit', async () => {
      await ctx.http().get(`${BASE}?cursor=not-a-cursor`).set(owner.auth).expect(400);
      await ctx.http().get(`${BASE}?limit=1000`).set(owner.auth).expect(400);
    });
  });

  describe('ownership', () => {
    it('another user gets 404 on every route for my application', async () => {
      const { id } = await add(user);
      const stranger = await signUp(ctx);
      const url = `${BASE}/${id}`;
      const remindAt = new Date(Date.now() + 86_400_000).toISOString();

      await ctx.http().get(url).set(stranger.auth).expect(404);
      await ctx.http().patch(url).set(stranger.auth).send({ title: 'Mine now' }).expect(404);
      await ctx.http().delete(url).set(stranger.auth).expect(404);
      await ctx
        .http()
        .post(`${url}/move`)
        .set(stranger.auth)
        .send({ toStatus: 'offer' })
        .expect(404);
      await ctx.http().post(`${url}/notes`).set(stranger.auth).send({ body: 'x' }).expect(404);
      await ctx.http().get(`${url}/notes`).set(stranger.auth).expect(404);
      await ctx.http().get(`${url}/events`).set(stranger.auth).expect(404);
      await ctx
        .http()
        .post(`${url}/reminders`)
        .set(stranger.auth)
        .send({ remindAt, message: 'x' })
        .expect(404);

      const untouched = await ctx.http().get(url).set(user.auth).expect(200);
      expect(untouched.body.status).toBe('saved');
    });

    it('lists only my own cards', async () => {
      const stranger = await signUp(ctx);
      const response = await ctx.http().get(BASE).set(stranger.auth).expect(200);
      expect(response.body.items).toEqual([]);
    });
  });

  describe('stats', () => {
    it('matches seeded data', async () => {
      const owner = await signUp(ctx);
      const addAndWalk = async (statuses: string[]) => {
        const { id } = await add(owner);
        for (const status of statuses) await move(owner, id, status).expect(200);
        return id;
      };

      await addAndWalk([]); // saved only
      await addAndWalk(['applied']);
      await addAndWalk(['applied', 'screening']);
      await addAndWalk(['applied', 'screening', 'interview']);
      await addAndWalk(['interview', 'offer']); // skipped straight past applied
      await addAndWalk(['applied', 'rejected']);
      await addAndWalk(['applied', 'withdrawn']);
      const archived = await addAndWalk(['applied', 'offer']);
      await ctx.http().delete(`${BASE}/${archived}`).set(owner.auth).expect(204);

      const { body } = await ctx.http().get('/api/v1/tracker/stats').set(owner.auth).expect(200);

      expect(body.byStatus).toEqual({
        saved: 1,
        applied: 1,
        screening: 1,
        interview: 1,
        offer: 1,
        rejected: 1,
        withdrawn: 1,
      });
      expect(body.funnel).toEqual({ applied: 6, screening: 3, interview: 2, offer: 1 });
      // Of those six, four heard back (screening, interview, offer, rejected). One is still
      // waiting and one withdrew. The archived card is excluded from everything.
      expect(body.responseRate).toBe(0.667);
      // Five cards have applied_at this week; the one that skipped "applied" has none.
      expect(body.perWeek).toHaveLength(8);
      expect(body.perWeek.at(-1).count).toBe(5);
    });

    it('is empty rather than dividing by zero for a new user', async () => {
      const fresh = await signUp(ctx);
      const { body } = await ctx.http().get('/api/v1/tracker/stats').set(fresh.auth).expect(200);
      expect(body.responseRate).toBeNull();
      expect(body.funnel).toEqual({ applied: 0, screening: 0, interview: 0, offer: 0 });
    });
  });

  describe('notifications', () => {
    it('lists, counts unread, marks read and stays private', async () => {
      const owner = await signUp(ctx);
      const stranger = await signUp(ctx);
      const [first] = await ctx.db
        .insertInto('notifications')
        .values([
          {
            userId: owner.id,
            type: 'reminder',
            payload: JSON.stringify({ message: 'one' }),
            readAt: null,
          },
          {
            userId: owner.id,
            type: 'reminder',
            payload: JSON.stringify({ message: 'two' }),
            readAt: null,
          },
        ])
        .returning('id')
        .execute();

      const listed = await ctx.http().get('/api/v1/notifications').set(owner.auth).expect(200);
      expect(listed.body.items).toHaveLength(2);
      expect(listed.body.unreadCount).toBe(2);

      await ctx
        .http()
        .post(`/api/v1/notifications/${first?.id}/read`)
        .set(stranger.auth)
        .expect(404);
      await ctx.http().post(`/api/v1/notifications/${first?.id}/read`).set(owner.auth).expect(204);
      const afterOne = await ctx.http().get('/api/v1/notifications').set(owner.auth).expect(200);
      expect(afterOne.body.unreadCount).toBe(1);

      await ctx.http().post('/api/v1/notifications/read-all').set(owner.auth).expect(204);
      const afterAll = await ctx.http().get('/api/v1/notifications').set(owner.auth).expect(200);
      expect(afterAll.body.unreadCount).toBe(0);
    });
  });
});
