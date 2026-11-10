import { randomUUID } from 'node:crypto';
import { MAX_ALERTS_PER_USER } from '@hireflow/shared';
import { jobHash } from '@hireflow/shared/node';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signUp, type TestContext, type TestUser } from './helpers/app.js';

const FEED = '/api/v1/feed/jobs';
const ALERTS = '/api/v1/alerts';

describe('job feed and alerts', () => {
  let ctx: TestContext;
  let user: TestUser;
  let sourceId: string;
  let word: string;

  const addJob = async (fields: {
    title: string;
    location?: string;
    remote?: boolean;
    description?: string;
    postedAt?: Date;
    lastSeenAt?: Date;
    source?: string;
  }) => {
    const company = `Larkspur ${randomUUID().slice(0, 6)}`;
    const row = await ctx.db
      .insertInto('feedJobs')
      .values({
        sourceId: fields.source ?? sourceId,
        externalId: randomUUID(),
        title: fields.title,
        companyName: company,
        location: fields.location ?? null,
        remote: fields.remote ?? false,
        url: 'https://example.com/job',
        description: fields.description ?? `A job about ${word}.`,
        skills: ['Node'],
        postedAt: fields.postedAt ?? new Date(),
        jobHash: jobHash(fields.title, company, fields.location),
        lastSeenAt: fields.lastSeenAt ?? new Date(),
        matchedAt: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  };

  const search = async (query: Record<string, string>, who = user) => {
    const response = await ctx
      .http()
      .get(FEED)
      .set(who.auth)
      .query({ q: word, ...query })
      .expect(200);
    return response.body as { items: Record<string, unknown>[]; nextCursor: string | null };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    user = await signUp(ctx);
    word = `zephyr${randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const source = await ctx.db
      .insertInto('feedSources')
      .values({ name: `Test board ${randomUUID()}`, kind: 'greenhouse' })
      .returning('id')
      .executeTakeFirstOrThrow();
    sourceId = source.id;
  });

  afterAll(async () => {
    await ctx.db.deleteFrom('feedSources').where('id', '=', sourceId).execute();
    await ctx.app.close();
  });

  describe('searching', () => {
    it('needs a signed-in person', async () => {
      await ctx.http().get(FEED).expect(401);
      await ctx.http().get(ALERTS).expect(401);
    });

    it('finds words in the title, company and description', async () => {
      const id = await addJob({ title: 'Engineer', description: `We are building ${word} tools` });
      const { items } = await search({});
      expect(items.map((job) => job.id)).toContain(id);
      expect(items.find((job) => job.id === id)).toMatchObject({
        title: 'Engineer',
        remote: false,
        savedApplicationId: null,
      });
      const none = await ctx
        .http()
        .get(FEED)
        .set(user.auth)
        .query({ q: `${word}nothing` })
        .expect(200);
      expect(none.body.items).toEqual([]);
    });

    it('does not break on search words that look like code', async () => {
      for (const q of [`"${word}`, `${word} & | ! :*`, `' OR 1=1 --`, '<script>', '\\']) {
        await ctx.http().get(FEED).set(user.auth).query({ q }).expect(200);
      }
    });

    it('filters by place and treats % as a normal letter', async () => {
      const id = await addJob({ title: 'Place test', location: 'Berlin, Germany' });
      expect((await search({ location: 'berlin' })).items.map((j) => j.id)).toEqual([id]);
      expect((await search({ location: 'London' })).items).toEqual([]);
      expect((await search({ location: '%' })).items).toEqual([]);
    });

    it('filters by remote', async () => {
      const id = await addJob({ title: 'Remote test', remote: true });
      const { items } = await search({ remote: 'true' });
      expect(items.map((job) => job.id)).toEqual([id]);
    });

    it('hides jobs not seen lately and jobs from a turned-off source', async () => {
      const old = await addJob({
        title: 'Closed job',
        lastSeenAt: new Date(Date.now() - 8 * 24 * 3_600_000),
      });
      const off = await ctx.db
        .insertInto('feedSources')
        .values({ name: `Off ${randomUUID()}`, kind: 'lever', enabled: false })
        .returning('id')
        .executeTakeFirstOrThrow();
      const hidden = await addJob({ title: 'Hidden job', source: off.id });
      const ids = (await search({ limit: '100' })).items.map((job) => job.id);
      expect(ids).not.toContain(old);
      expect(ids).not.toContain(hidden);
      await ctx.http().get(`${FEED}/${old}`).set(user.auth).expect(404);
    });

    it('goes through pages with no job shown twice, even with the same time', async () => {
      const q = `paging${randomUUID().replaceAll('-', '').slice(0, 10)}`;
      const postedAt = new Date('2026-10-01T10:00:00.123456Z');
      const ids = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          addJob({ title: `Page job ${index}`, description: q, postedAt }),
        ),
      );
      const seen: unknown[] = [];
      let cursor: string | null = null;
      do {
        const page: { items: Record<string, unknown>[]; nextCursor: string | null } = await search({
          q,
          limit: '2',
          ...(cursor ? { cursor } : {}),
        });
        seen.push(...page.items.map((job) => job.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(5);
      expect(new Set(seen)).toEqual(new Set(ids));
    });

    it('shows the newest first, and refuses a broken page link', async () => {
      const q = `order${randomUUID().replaceAll('-', '').slice(0, 10)}`;
      const old = await addJob({
        title: 'Old',
        description: q,
        postedAt: new Date('2026-01-01T00:00:00Z'),
      });
      const fresh = await addJob({
        title: 'Fresh',
        description: q,
        postedAt: new Date('2026-10-01T00:00:00Z'),
      });
      expect((await search({ q })).items.map((job) => job.id)).toEqual([fresh, old]);
      await ctx.http().get(FEED).set(user.auth).query({ cursor: 'broken' }).expect(400);
    });

    it('gives the full description for one job, and 404 for an unknown one', async () => {
      const description = `${'long '.repeat(100)}${word}`;
      const id = await addJob({ title: 'Long job', description });
      const list = await search({});
      const summary = list.items.find((job) => job.id === id)?.summary as string;
      // Cut at a whole word, with an ellipsis, and never longer than the limit plus the dot.
      expect(summary.length).toBeLessThanOrEqual(241);
      expect(summary.endsWith('…')).toBe(true);
      expect(summary.endsWith(' …')).toBe(false);
      expect(summary.startsWith('long long')).toBe(true);
      const detail = await ctx.http().get(`${FEED}/${id}`).set(user.auth).expect(200);
      expect(detail.body.description).toBe(description);
      await ctx.http().get(`${FEED}/${randomUUID()}`).set(user.auth).expect(404);
      await ctx.http().get(`${FEED}/nope`).set(user.auth).expect(400);
    });
  });

  describe('saving', () => {
    it('copies the job to the tracker as saved, and only once', async () => {
      const saver = await signUp(ctx);
      const id = await addJob({ title: 'Save me', location: 'Pune' });
      const saved = await ctx.http().post(`${FEED}/${id}/save`).set(saver.auth).expect(201);
      expect(saved.body).toMatchObject({
        title: 'Save me',
        status: 'saved',
        location: 'Pune',
        jobUrl: 'https://example.com/job',
      });
      expect(saved.body.source).toMatch(/^Test board/);

      const again = await ctx.http().post(`${FEED}/${id}/save`).set(saver.auth).expect(409);
      expect(again.body.error.code).toBe('DUPLICATE_JOB');
      expect(again.body.error.details[0].existingId).toBe(saved.body.id);

      const after = await search({ q: 'Save me' }, saver);
      expect(after.items.find((job) => job.id === id)?.savedApplicationId).toBe(saved.body.id);
      // Saving is personal. Someone else still sees the job as not saved.
      const other = await search({ q: 'Save me' });
      expect(other.items.find((job) => job.id === id)?.savedApplicationId).toBeNull();
    });

    it('gives 404 for an unknown job', async () => {
      await ctx.http().post(`${FEED}/${randomUUID()}/save`).set(user.auth).expect(404);
    });
  });

  describe('managing alerts', () => {
    const valid = { name: 'Backend', keywords: ['node', 'Node', ' postgres '] };

    it('creates an alert with sensible defaults and tidy keywords', async () => {
      const owner = await signUp(ctx);
      const created = await ctx.http().post(ALERTS).set(owner.auth).send(valid).expect(201);
      expect(created.body).toMatchObject({
        name: 'Backend',
        keywords: ['node', 'postgres'],
        locations: [],
        remoteOnly: false,
        frequency: 'daily',
        active: true,
        sentCount: 0,
      });
      const list = await ctx.http().get(ALERTS).set(owner.auth).expect(200);
      expect(list.body.map((alert: { id: string }) => alert.id)).toEqual([created.body.id]);
    });

    it('refuses bad input', async () => {
      for (const body of [
        {},
        { name: 'No words', keywords: [] },
        { name: '', keywords: ['node'] },
        { name: 'Blank', keywords: ['   '] },
        { name: 'Odd', keywords: ['node'], frequency: 'hourly' },
        { name: 'Many', keywords: Array.from({ length: 21 }, (_, index) => `word${index}`) },
      ]) {
        await ctx.http().post(ALERTS).set(user.auth).send(body).expect(400);
      }
    });

    it('keeps one person away from another person’s alert', async () => {
      const owner = await signUp(ctx);
      const stranger = await signUp(ctx);
      const { body } = await ctx.http().post(ALERTS).set(owner.auth).send(valid).expect(201);
      await ctx
        .http()
        .patch(`${ALERTS}/${body.id}`)
        .set(stranger.auth)
        .send({ name: 'Mine now' })
        .expect(404);
      await ctx.http().delete(`${ALERTS}/${body.id}`).set(stranger.auth).expect(404);
      const others = await ctx.http().get(ALERTS).set(stranger.auth).expect(200);
      expect(others.body).toEqual([]);
    });

    it('stops at the limit, even with many requests at once', async () => {
      const owner = await signUp(ctx);
      const responses = await Promise.all(
        Array.from({ length: MAX_ALERTS_PER_USER + 3 }, () =>
          ctx.http().post(ALERTS).set(owner.auth).send(valid),
        ),
      );
      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 201)).toHaveLength(MAX_ALERTS_PER_USER);
      expect(statuses.filter((status) => status === 409)).toHaveLength(3);
    });

    it('drops waiting jobs when the search changes or the alert is paused', async () => {
      const owner = await signUp(ctx);
      const { body: alert } = await ctx.http().post(ALERTS).set(owner.auth).send(valid).expect(201);
      const addWaiting = async () => {
        const job = await addJob({ title: `Waiting ${randomUUID()}` });
        await ctx.db
          .insertInto('alertDeliveries')
          .values({ alertId: alert.id, feedJobId: job, deliveredAt: null })
          .execute();
      };
      const waiting = async () => {
        const { rows } = await sql<{ count: number }>`
          SELECT count(*)::int AS count FROM alert_deliveries
           WHERE alert_id = ${alert.id} AND delivered_at IS NULL`.execute(ctx.db);
        return rows[0]?.count;
      };

      await addWaiting();
      await ctx.http().patch(`${ALERTS}/${alert.id}`).set(owner.auth).send({ name: 'New name' });
      await ctx
        .http()
        .patch(`${ALERTS}/${alert.id}`)
        .set(owner.auth)
        .send({ frequency: 'instant' })
        .expect(200);
      expect(await waiting()).toBe(1);

      await ctx
        .http()
        .patch(`${ALERTS}/${alert.id}`)
        .set(owner.auth)
        .send({ keywords: ['python'] })
        .expect(200);
      expect(await waiting()).toBe(0);

      await addWaiting();
      const paused = await ctx
        .http()
        .patch(`${ALERTS}/${alert.id}`)
        .set(owner.auth)
        .send({ active: false })
        .expect(200);
      expect(paused.body.active).toBe(false);
      expect(await waiting()).toBe(0);
    });

    it('counts sent jobs, and deleting an alert removes its rows', async () => {
      const owner = await signUp(ctx);
      const { body: alert } = await ctx.http().post(ALERTS).set(owner.auth).send(valid).expect(201);
      const job = await addJob({ title: `Sent ${randomUUID()}` });
      await ctx.db
        .insertInto('alertDeliveries')
        .values({ alertId: alert.id, feedJobId: job, deliveredAt: new Date() })
        .execute();
      const list = await ctx.http().get(ALERTS).set(owner.auth).expect(200);
      expect(list.body[0].sentCount).toBe(1);

      await ctx.http().delete(`${ALERTS}/${alert.id}`).set(owner.auth).expect(204);
      await ctx.http().delete(`${ALERTS}/${alert.id}`).set(owner.auth).expect(404);
      const rows = await ctx.db
        .selectFrom('alertDeliveries')
        .selectAll()
        .where('alertId', '=', alert.id)
        .execute();
      expect(rows).toEqual([]);
    });
  });
});
