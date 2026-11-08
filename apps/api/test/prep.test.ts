import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { streaks } from '../src/prep/prep.service.js';
import { createTestApp, signUp, type TestContext, type TestUser } from './helpers/app.js';

const PREP = '/api/v1/prep';

describe('practice', () => {
  let ctx: TestContext;

  const log = (who: TestUser, body: object) =>
    ctx.http().post(`${PREP}/sessions`).set(who.auth).send(body);

  /** Moves a session back in time, as if it was logged that many days ago. */
  const backdate = async (id: string, daysAgo: number) => {
    await sql`UPDATE practice_sessions SET created_at = now() - ${`${daysAgo} days`}::interval
               WHERE id = ${id}`.execute(ctx.db);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('needs a signed-in person', async () => {
    await ctx.http().get(`${PREP}/stats`).expect(401);
    await ctx.http().post(`${PREP}/sessions`).send({ topic: 'x', kind: 'dsa' }).expect(401);
  });

  it('logs a session and adds the topic to reviews once, due tomorrow', async () => {
    const user = await signUp(ctx);
    const { body } = await log(user, {
      topic: 'Binary search',
      kind: 'dsa',
      difficulty: 3,
      durationMin: 45,
      outcome: 'solved',
      notes: 'Watch the off-by-one',
    }).expect(201);
    expect(body).toMatchObject({ topic: 'Binary search', durationMin: 45, reviewAdded: true });

    const again = await log(user, { topic: 'binary SEARCH', kind: 'dsa' }).expect(201);
    expect(again.body.reviewAdded).toBe(false);

    const reviews = await ctx.http().get(`${PREP}/reviews`).set(user.auth).expect(200);
    expect(reviews.body).toHaveLength(1);
    const tomorrow = DateTime.now().setZone('UTC').plus({ days: 1 }).toISODate();
    expect(reviews.body[0]).toMatchObject({
      topic: 'Binary search',
      dueOn: tomorrow,
      easeFactor: 2.5,
      repetitions: 0,
    });
    const due = await ctx.http().get(`${PREP}/reviews/due`).set(user.auth).expect(200);
    expect(due.body).toEqual([]);
  });

  it('refuses bad input', async () => {
    const user = await signUp(ctx);
    for (const body of [
      {},
      { topic: '', kind: 'dsa' },
      { topic: 'Graphs', kind: 'cooking' },
      { topic: 'Graphs', kind: 'dsa', difficulty: 6 },
      { topic: 'Graphs', kind: 'dsa', durationMin: 0 },
      { topic: 'Graphs', kind: 'dsa', durationMin: 1.5 },
      { topic: 'Graphs', kind: 'dsa', outcome: 'won' },
      { topic: 'x'.repeat(101), kind: 'dsa' },
    ]) {
      await log(user, body).expect(400);
    }
  });

  it('grades a review with SM-2 and moves its date', async () => {
    const user = await signUp(ctx);
    await log(user, { topic: 'Caching', kind: 'system_design' }).expect(201);
    const [item] = (await ctx.http().get(`${PREP}/reviews`).set(user.auth)).body;
    const today = DateTime.now().setZone('UTC');

    const first = await ctx
      .http()
      .post(`${PREP}/reviews/${item.id}/grade`)
      .set(user.auth)
      .send({ quality: 5 })
      .expect(200);
    expect(first.body).toMatchObject({ repetitions: 1, intervalDays: 1, easeFactor: 2.6 });
    expect(first.body.dueOn).toBe(today.plus({ days: 1 }).toISODate());

    const second = await ctx
      .http()
      .post(`${PREP}/reviews/${item.id}/grade`)
      .set(user.auth)
      .send({ quality: 4 })
      .expect(200);
    expect(second.body).toMatchObject({ repetitions: 2, intervalDays: 6 });
    expect(second.body.dueOn).toBe(today.plus({ days: 6 }).toISODate());

    const forgot = await ctx
      .http()
      .post(`${PREP}/reviews/${item.id}/grade`)
      .set(user.auth)
      .send({ quality: 1 })
      .expect(200);
    expect(forgot.body).toMatchObject({ repetitions: 0, intervalDays: 1 });

    for (const quality of [-1, 6, 2.5, 'good']) {
      await ctx
        .http()
        .post(`${PREP}/reviews/${item.id}/grade`)
        .set(user.auth)
        .send({ quality })
        .expect(400);
    }
  });

  it('uses the person’s own date for what is due', async () => {
    const user = await signUp(ctx);
    await ctx
      .http()
      .patch('/api/v1/me')
      .set(user.auth)
      .send({ fullName: 'Test User', timezone: 'Pacific/Kiritimati' })
      .expect(200);
    await log(user, { topic: 'Heaps', kind: 'dsa' }).expect(201);
    const [item] = (await ctx.http().get(`${PREP}/reviews`).set(user.auth)).body;
    const theirToday = DateTime.now().setZone('Pacific/Kiritimati');
    expect(item.dueOn).toBe(theirToday.plus({ days: 1 }).toISODate());

    await sql`UPDATE review_items SET due_on = ${theirToday.toISODate()}::date WHERE id = ${item.id}`.execute(
      ctx.db,
    );
    const due = await ctx.http().get(`${PREP}/reviews/due`).set(user.auth).expect(200);
    expect(due.body.map((row: { id: string }) => row.id)).toEqual([item.id]);
  });

  it('keeps sessions and reviews private', async () => {
    const owner = await signUp(ctx);
    const stranger = await signUp(ctx);
    const { body: session } = await log(owner, { topic: 'Tries', kind: 'dsa' }).expect(201);
    const [item] = (await ctx.http().get(`${PREP}/reviews`).set(owner.auth)).body;

    await ctx.http().delete(`${PREP}/sessions/${session.id}`).set(stranger.auth).expect(404);
    await ctx
      .http()
      .post(`${PREP}/reviews/${item.id}/grade`)
      .set(stranger.auth)
      .send({ quality: 5 })
      .expect(404);
    await ctx.http().delete(`${PREP}/reviews/${item.id}`).set(stranger.auth).expect(404);
    const list = await ctx.http().get(`${PREP}/sessions`).set(stranger.auth).expect(200);
    expect(list.body.items).toEqual([]);

    await ctx.http().delete(`${PREP}/sessions/${session.id}`).set(owner.auth).expect(204);
    await ctx.http().delete(`${PREP}/reviews/${item.id}`).set(owner.auth).expect(204);
    await ctx.http().delete(`${PREP}/reviews/${item.id}`).set(owner.auth).expect(404);
  });

  it('lists sessions newest first, page by page', async () => {
    const user = await signUp(ctx);
    for (let index = 0; index < 5; index++) {
      await log(user, { topic: `Topic ${index}`, kind: 'other' }).expect(201);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { body: { items: { topic: string }[]; nextCursor: string | null } } = await ctx
        .http()
        .get(`${PREP}/sessions`)
        .set(user.auth)
        .query({ limit: 2, ...(cursor ? { cursor } : {}) })
        .expect(200);
      seen.push(...page.body.items.map((item) => item.topic));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(['Topic 4', 'Topic 3', 'Topic 2', 'Topic 1', 'Topic 0']);
  });

  it('counts the streak, minutes, outcomes and top topics', async () => {
    const user = await signUp(ctx);
    const add = async (daysAgo: number, body: object) => {
      const { body: session } = await log(user, body).expect(201);
      await backdate(session.id, daysAgo);
    };
    await add(0, { topic: 'Graphs', kind: 'dsa', durationMin: 30, outcome: 'solved' });
    await add(1, { topic: 'graphs', kind: 'dsa', durationMin: 20, outcome: 'partial' });
    await add(2, { topic: 'STAR stories', kind: 'behavioral', durationMin: 15 });
    await add(5, { topic: 'Queues', kind: 'system_design', outcome: 'failed' });
    await add(6, { topic: 'Queues', kind: 'system_design' });
    await add(7, { topic: 'Queues', kind: 'system_design' });
    await add(8, { topic: 'Queues', kind: 'system_design' });
    await add(40, { topic: 'Old topic', kind: 'mock', durationMin: 60 });

    const { body } = await ctx.http().get(`${PREP}/stats`).set(user.auth).expect(200);
    expect(body.streak).toEqual({ current: 3, best: 4, practisedToday: true });
    expect(body.last30Days.sessions).toBe(7);
    expect(body.last30Days.minutes).toBe(65);
    expect(body.last30Days.outcomes).toEqual({ solved: 1, partial: 1, failed: 1 });
    expect(body.last30Days.byKind).toContainEqual({ kind: 'dsa', sessions: 2, minutes: 50 });
    expect(body.last30Days.byKind).toContainEqual({ kind: 'mock', sessions: 0, minutes: 0 });
    expect(body.last30Days.topTopics[0]).toEqual({ topic: 'Queues', sessions: 4, minutes: 0 });
    expect(body.last30Days.topTopics[1]).toMatchObject({ sessions: 2, minutes: 50 });
  });

  it('works out streaks from a list of days', () => {
    expect(streaks([], '2026-11-08')).toEqual({ current: 0, best: 0, practisedToday: false });
    expect(streaks(['2026-11-07', '2026-11-06'], '2026-11-08')).toEqual({
      current: 2,
      best: 2,
      practisedToday: false,
    });
    expect(streaks(['2026-11-05'], '2026-11-08').current).toBe(0);
    // Across the end of a month and a clock change.
    expect(streaks(['2026-11-01', '2026-10-31', '2026-10-30'], '2026-11-01')).toMatchObject({
      current: 3,
      best: 3,
    });
  });

  it('gives 404 for an unknown id and 400 for a broken one', async () => {
    const user = await signUp(ctx);
    await ctx.http().delete(`${PREP}/sessions/${randomUUID()}`).set(user.auth).expect(404);
    await ctx.http().delete(`${PREP}/sessions/nope`).set(user.auth).expect(400);
  });
});
