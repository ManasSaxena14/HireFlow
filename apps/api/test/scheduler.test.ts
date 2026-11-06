import { randomUUID } from 'node:crypto';
import type { MailMessage } from '@hireflow/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCompany,
  createTestApp,
  signUp,
  type TestContext,
  type TestUser,
} from './helpers/app.js';

const PDF = Buffer.from('%PDF-1.7\nA small test resume\n');
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** A time on the quarter hour, some days from now. Every test uses its own day. */
let nextDay = 3;
function freshDay(): Date {
  const day = new Date(Date.now() + nextDay++ * DAY);
  day.setUTCHours(9, 0, 0, 0);
  return day;
}
const plus = (date: Date, ms: number) => new Date(date.getTime() + ms);
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

describe('scheduler', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let recruiter: TestUser;
  let interviewer: TestUser;
  let second: TestUser;
  let outsider: TestUser;
  let companyId: string;
  let slug: string;
  let job: { id: string; slug: string };

  const api = (cid = companyId) => `/api/v1/companies/${cid}`;

  const join = async (role: string) => {
    const member = await signUp(ctx);
    await ctx
      .http()
      .post(`${api()}/members`)
      .set(admin.auth)
      .send({ email: member.email, role })
      .expect(201);
    return member;
  };

  const apply = async (name = 'Asha Menon') => {
    const email = `candidate-${randomUUID()}@example.com`;
    await ctx
      .http()
      .post(`/api/v1/public/companies/${slug}/jobs/${job.slug}/apply`)
      .field('fullName', name)
      .field('email', email)
      .attach('resume', PDF, { filename: 'resume.pdf', contentType: 'application/pdf' })
      .expect(201);
    const row = await ctx.db
      .selectFrom('applications as a')
      .innerJoin('candidates as c', 'c.id', 'a.candidateId')
      .select(['a.id', 'a.candidateId'])
      .where('c.email', '=', email)
      .executeTakeFirstOrThrow();
    return { id: row.id, candidateId: row.candidateId, email };
  };

  const setHours = (user: TestUser, startTime = '09:00', endTime = '17:00', timezone = 'UTC') =>
    ctx
      .http()
      .put(`/api/v1/me/availability?companyId=${companyId}`)
      .set(user.auth)
      .send({
        timezone,
        rules: ALL_DAYS.map((weekday) => ({ weekday, startTime, endTime })),
        blocks: [],
      })
      .expect(200);

  const book = (
    applicationId: string,
    start: Date,
    by = recruiter,
    who = interviewer,
    length = 60,
  ) =>
    ctx.http().post(`${api()}/interviews`).set(by.auth).send({
      applicationId,
      interviewerId: who.id,
      start: start.toISOString(),
      durationMin: length,
      meetingUrl: 'https://meet.example.com/room',
      notes: 'Ask about the last project',
    });

  const suggest = (
    applicationId: string,
    day: Date,
    who: TestUser[] = [interviewer],
    extra: Record<string, unknown> = {},
    by = recruiter,
  ) =>
    ctx
      .http()
      .post(`${api()}/interviews/suggest-slots`)
      .set(by.auth)
      .send({
        applicationId,
        interviewerIds: who.map((user) => user.id),
        durationMin: 60,
        from: new Date(day.getTime() - 9 * HOUR).toISOString(),
        to: new Date(day.getTime() + 15 * HOUR).toISOString(),
        ...extra,
      });

  const remindersOf = (interviewId: string) =>
    ctx.db
      .selectFrom('reminders')
      .selectAll()
      .where('interviewId', '=', interviewId)
      .orderBy('remindAt')
      .execute();

  const mailsTo = (to: string) => ctx.mail.sent.filter((mail) => mail.to === to);
  const lastInterviewMail = (to: string) =>
    mailsTo(to).findLast((mail) => mail.template === 'interview') as
      Extract<MailMessage, { template: 'interview' }> | undefined;

  const offer = async (
    applicationId: string,
    slots: Date[],
    extra: Record<string, unknown> = {},
    who = interviewer,
  ) => {
    const { body } = await ctx
      .http()
      .post(`${api()}/interview-offers`)
      .set(recruiter.auth)
      .send({
        applicationId,
        interviewerId: who.id,
        durationMin: 60,
        slots: slots.map((slot) => slot.toISOString()),
        meetingUrl: 'https://meet.example.com/room',
        notes: 'Private team note',
        ...extra,
      })
      .expect(201);
    return {
      id: body.id as string,
      token: (body.bookingUrl as string).split('/book/')[1] as string,
      body,
    };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await signUp(ctx);
    companyId = await createCompany(ctx, admin);
    const company = await ctx.db
      .selectFrom('companies')
      .select('slug')
      .where('id', '=', companyId)
      .executeTakeFirstOrThrow();
    slug = company.slug;
    recruiter = await join('recruiter');
    interviewer = await join('interviewer');
    second = await join('interviewer');
    outsider = await signUp(ctx);

    const created = await ctx
      .http()
      .post(`${api()}/jobs`)
      .set(recruiter.auth)
      .send({ title: 'Backend Developer', description: 'Build and run the services we sell.' })
      .expect(201);
    job = created.body;
    await ctx.http().post(`${api()}/jobs/${job.id}/publish`).set(recruiter.auth).expect(200);
    await setHours(interviewer);
    await setHours(second);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('availability', () => {
    it('saves and reads back weekly hours and days off', async () => {
      const user = await join('interviewer');
      const start = freshDay();
      const { body } = await ctx
        .http()
        .put(`/api/v1/me/availability?companyId=${companyId}`)
        .set(user.auth)
        .send({
          timezone: 'Asia/Kolkata',
          rules: [
            { weekday: 1, startTime: '09:30', endTime: '13:00' },
            { weekday: 1, startTime: '14:00', endTime: '18:00', validTo: '2030-01-01' },
          ],
          blocks: [
            {
              start: start.toISOString(),
              end: plus(start, DAY).toISOString(),
              reason: 'On holiday',
            },
          ],
        })
        .expect(200);
      expect(body.timezone).toBe('Asia/Kolkata');
      expect(body.rules).toMatchObject([
        { weekday: 1, startTime: '09:30', endTime: '13:00', validTo: null },
        { weekday: 1, startTime: '14:00', endTime: '18:00', validTo: '2030-01-01' },
      ]);
      expect(body.blocks).toMatchObject([{ start: start.toISOString(), reason: 'On holiday' }]);

      const read = await ctx
        .http()
        .get(`/api/v1/me/availability?companyId=${companyId}`)
        .set(user.auth)
        .expect(200);
      expect(read.body).toEqual(body);
    });

    it('starts empty, using the time zone of the person', async () => {
      const user = await join('recruiter');
      const { body } = await ctx
        .http()
        .get(`/api/v1/me/availability?companyId=${companyId}`)
        .set(user.auth)
        .expect(200);
      expect(body.rules).toEqual([]);
      expect(body.timezone).toBeTruthy();
    });

    it('replaces the old list when saved again', async () => {
      const user = await join('interviewer');
      await setHours(user);
      const { body } = await ctx
        .http()
        .put(`/api/v1/me/availability?companyId=${companyId}`)
        .set(user.auth)
        .send({ timezone: 'UTC', rules: [], blocks: [] })
        .expect(200);
      expect(body.rules).toEqual([]);
    });

    it('refuses bad hours, unknown zones and other companies', async () => {
      const put = (user: TestUser, body: object, cid = companyId) =>
        ctx.http().put(`/api/v1/me/availability?companyId=${cid}`).set(user.auth).send(body);
      await put(interviewer, {
        timezone: 'UTC',
        rules: [{ weekday: 1, startTime: '10:00', endTime: '09:00' }],
        blocks: [],
      }).expect(400);
      await put(interviewer, {
        timezone: 'UTC',
        rules: [{ weekday: 9, startTime: '09:00', endTime: '10:00' }],
        blocks: [],
      }).expect(400);
      await put(interviewer, { timezone: 'Not/AZone', rules: [], blocks: [] }).expect(400);
      await put(outsider, { timezone: 'UTC', rules: [], blocks: [] }).expect(403);
      await ctx
        .http()
        .get(`/api/v1/me/availability?companyId=${companyId}`)
        .set(outsider.auth)
        .expect(403);
      await ctx.http().get(`/api/v1/me/availability?companyId=${companyId}`).expect(401);
      await ctx.http().get('/api/v1/me/availability').set(interviewer.auth).expect(400);
    });
  });

  describe('suggesting times', () => {
    it('offers the hours of the interviewer', async () => {
      const { id } = await apply();
      const day = freshDay();
      const { body } = await suggest(id, day).expect(200);
      expect(body.slots[0]).toEqual({
        start: day.toISOString(),
        end: plus(day, HOUR).toISOString(),
      });
      expect(Date.parse(body.slots[1].start) - Date.parse(body.slots[0].start)).toBe(15 * MINUTE);
      expect(Date.parse(body.slots.at(-1).end)).toBe(day.getTime() + 8 * HOUR);
    });

    it('never gives more than 50 times', async () => {
      const user = await join('interviewer');
      await setHours(user, '00:00', '23:59');
      const { id } = await apply();
      const { body } = await suggest(id, freshDay(), [user]).expect(200);
      expect(body.slots).toHaveLength(50);
    });

    it('leaves out days off and other interviews of the interviewer', async () => {
      const user = await join('interviewer');
      const day = freshDay();
      await ctx
        .http()
        .put(`/api/v1/me/availability?companyId=${companyId}`)
        .set(user.auth)
        .send({
          timezone: 'UTC',
          rules: ALL_DAYS.map((weekday) => ({ weekday, startTime: '09:00', endTime: '13:00' })),
          blocks: [{ start: day.toISOString(), end: plus(day, HOUR).toISOString() }],
        })
        .expect(200);
      const first = await apply();
      await book(first.id, plus(day, 2 * HOUR), recruiter, user).expect(201);

      const other = await apply();
      const { body } = await suggest(other.id, day, [user]).expect(200);
      expect(body.slots.map((slot: { start: string }) => slot.start)).toEqual([
        plus(day, HOUR).toISOString(),
        plus(day, 3 * HOUR).toISOString(),
      ]);
    });

    it('leaves out times when the candidate is already busy', async () => {
      const { id } = await apply();
      const day = freshDay();
      await book(id, day, recruiter, second).expect(201);
      const { body } = await suggest(id, day).expect(200);
      expect(body.slots.map((slot: { start: string }) => slot.start)).not.toContain(
        day.toISOString(),
      );
      expect(body.slots[0].start).toBe(plus(day, HOUR).toISOString());
    });

    it('finds time that suits all interviewers', async () => {
      const early = await join('interviewer');
      const late = await join('interviewer');
      await setHours(early, '09:00', '12:00');
      await setHours(late, '11:00', '15:00');
      const { id } = await apply();
      const day = freshDay();
      const { body } = await suggest(id, day, [early, late]).expect(200);
      expect(body.slots).toEqual([
        { start: plus(day, 2 * HOUR).toISOString(), end: plus(day, 3 * HOUR).toISOString() },
      ]);
    });

    it('can ignore the old time when moving an interview', async () => {
      const { id } = await apply();
      const day = freshDay();
      const { body: interview } = await book(id, day).expect(201);
      const { body } = await suggest(id, day, [interviewer], {
        ignoreInterviewId: interview.id,
      }).expect(200);
      expect(body.slots[0].start).toBe(day.toISOString());
    });

    it('gives nothing for a time in the past and for someone with no hours', async () => {
      const { id } = await apply();
      const noHours = await join('interviewer');
      const { body } = await suggest(id, freshDay(), [noHours]).expect(200);
      expect(body.slots).toEqual([]);
      const past = plus(new Date(), -5 * DAY);
      const { body: old } = await suggest(id, past).expect(200);
      expect(old.slots).toEqual([]);
    });

    it('works across a real clock change', async () => {
      const user = await join('interviewer');
      await ctx
        .http()
        .put(`/api/v1/me/availability?companyId=${companyId}`)
        .set(user.auth)
        .send({
          timezone: 'America/New_York',
          rules: [{ weekday: 0, startTime: '01:00', endTime: '04:00' }],
          blocks: [],
        })
        .expect(200);
      const { id } = await apply();
      const { body } = await ctx
        .http()
        .post(`${api()}/interviews/suggest-slots`)
        .set(recruiter.auth)
        .send({
          applicationId: id,
          interviewerIds: [user.id],
          durationMin: 120,
          from: '2027-03-14T00:00:00Z',
          to: '2027-03-15T00:00:00Z',
        })
        .expect(200);
      // Only two real hours exist between 01:00 and 04:00 that night.
      expect(body.slots).toEqual([
        { start: '2027-03-14T06:00:00.000Z', end: '2027-03-14T08:00:00.000Z' },
      ]);
    });

    it('checks the input and who is asking', async () => {
      const { id } = await apply();
      const day = freshDay();
      await suggest(id, day, [interviewer], {}, interviewer).expect(403);
      await suggest(id, day, [outsider]).expect(404);
      await suggest(randomUUID(), day).expect(404);
      await suggest(id, day, []).expect(400);
      await suggest(id, day, [interviewer], { durationMin: 5 }).expect(400);
      await suggest(id, day, [interviewer], {
        from: day.toISOString(),
        to: plus(day, 40 * DAY).toISOString(),
      }).expect(400);
      await suggest(id, day, [interviewer], {
        from: day.toISOString(),
        to: plus(day, -DAY).toISOString(),
      }).expect(400);
    });
  });

  describe('booking', () => {
    it('books, gives the interviewer access and tells everyone', async () => {
      const { id, email } = await apply('Kabir Singh');
      await ctx.http().get(`${api()}/applications/${id}`).set(interviewer.auth).expect(404);

      const start = freshDay();
      const { body } = await book(id, start).expect(201);
      expect(body).toMatchObject({
        status: 'scheduled',
        start: start.toISOString(),
        end: plus(start, HOUR).toISOString(),
        candidate: { fullName: 'Kabir Singh' },
        interviewer: { id: interviewer.id },
      });

      await ctx.http().get(`${api()}/applications/${id}`).set(interviewer.auth).expect(200);

      const reminders = await remindersOf(body.id);
      expect(reminders.map((item) => item.remindAt.getTime())).toEqual([
        start.getTime() - 24 * HOUR,
        start.getTime() - HOUR,
      ]);
      expect(reminders.every((item) => item.userId === interviewer.id)).toBe(true);
      expect(reminders.every((item) => item.kind === 'interview')).toBe(true);

      expect(lastInterviewMail(email)).toMatchObject({
        kind: 'booked',
        withName: 'Test User',
        meetingUrl: 'https://meet.example.com/room',
        linkLabel: 'Add to calendar',
      });
      expect(lastInterviewMail(email)?.when).toContain('(');
      expect(lastInterviewMail(interviewer.email)).toMatchObject({
        kind: 'booked',
        withName: 'Kabir Singh',
      });

      const notifications = await ctx
        .http()
        .get('/api/v1/notifications')
        .set(interviewer.auth)
        .expect(200);
      expect(notifications.body.items[0].payload.message).toContain('Kabir Singh');
      expect(notifications.body.items[0].payload.link).toBe(
        `/company/${companyId}/candidates/${id}`,
      );

      const audit = await ctx.db
        .selectFrom('auditLogs')
        .select('action')
        .where('entityId', '=', body.id)
        .execute();
      expect(audit.map((item) => item.action)).toEqual(['interview.created']);
    });

    it('skips reminders whose time has already gone', async () => {
      const { id } = await apply();
      const soon = new Date(Math.ceil((Date.now() + 2 * HOUR) / (15 * MINUTE)) * (15 * MINUTE));
      const { body } = await book(id, soon, recruiter, await join('interviewer')).expect(201);
      const reminders = await remindersOf(body.id);
      expect(reminders.map((item) => item.remindAt.getTime())).toEqual([soon.getTime() - HOUR]);
    });

    it('refuses a time that overlaps for the interviewer', async () => {
      const first = await apply();
      const other = await apply();
      const start = freshDay();
      await book(first.id, start).expect(201);
      const { body } = await book(other.id, plus(start, 30 * MINUTE)).expect(409);
      expect(body.error.code).toBe('SLOT_TAKEN');
      expect(body.error.message).toContain('just taken');
    });

    it('refuses a candidate who would be in two interviews at once', async () => {
      const { id } = await apply();
      const start = freshDay();
      await book(id, start, recruiter, interviewer).expect(201);
      const { body } = await book(id, plus(start, 15 * MINUTE), recruiter, second).expect(409);
      expect(body.error.code).toBe('SLOT_TAKEN');
      expect(body.error.message).toContain('already has an interview');
    });

    it('allows one interview to start the moment another ends', async () => {
      const first = await apply();
      const other = await apply();
      const start = freshDay();
      await book(first.id, start).expect(201);
      await book(other.id, plus(start, HOUR)).expect(201);
    });

    it('checks every interviewer across companies', async () => {
      const owner = await signUp(ctx);
      const otherCompany = await createCompany(ctx, owner);
      await ctx
        .http()
        .post(`${api(otherCompany)}/members`)
        .set(owner.auth)
        .send({ email: interviewer.email, role: 'interviewer' })
        .expect(201);
      const createdJob = await ctx
        .http()
        .post(`${api(otherCompany)}/jobs`)
        .set(owner.auth)
        .send({ title: 'Designer', description: 'Design the whole product with the team.' })
        .expect(201);
      await ctx
        .http()
        .post(`${api(otherCompany)}/jobs/${createdJob.body.id}/publish`)
        .set(owner.auth)
        .expect(200);
      const { slug: otherSlug } = await ctx.db
        .selectFrom('companies')
        .select('slug')
        .where('id', '=', otherCompany)
        .executeTakeFirstOrThrow();
      const email = `candidate-${randomUUID()}@example.com`;
      await ctx
        .http()
        .post(`/api/v1/public/companies/${otherSlug}/jobs/${createdJob.body.slug}/apply`)
        .field('fullName', 'Other Person')
        .field('email', email)
        .attach('resume', PDF, { filename: 'resume.pdf', contentType: 'application/pdf' })
        .expect(201);
      const otherApplication = await ctx.db
        .selectFrom('applications as a')
        .innerJoin('candidates as c', 'c.id', 'a.candidateId')
        .select('a.id')
        .where('c.email', '=', email)
        .executeTakeFirstOrThrow();

      const start = freshDay();
      const mine = await apply();
      await book(mine.id, start).expect(201);
      await ctx
        .http()
        .post(`${api(otherCompany)}/interviews`)
        .set(owner.auth)
        .send({
          applicationId: otherApplication.id,
          interviewerId: interviewer.id,
          start: start.toISOString(),
          durationMin: 30,
        })
        .expect(409);

      // The busy time counts, but the other company learns nothing else.
      const { body } = await ctx
        .http()
        .post(`${api(otherCompany)}/interviews/suggest-slots`)
        .set(owner.auth)
        .send({
          applicationId: otherApplication.id,
          interviewerIds: [interviewer.id],
          durationMin: 60,
          from: plus(start, -HOUR).toISOString(),
          to: plus(start, 2 * HOUR).toISOString(),
        })
        .expect(200);
      expect(body.slots).toEqual([]);

      // And a candidate from one company can never be used from another.
      await book(otherApplication.id, plus(start, DAY)).expect(404);
    });

    it('checks the input, the role and the state of the candidate', async () => {
      const { id } = await apply();
      const start = freshDay();
      await book(id, start, interviewer).expect(403);
      await book(id, start, outsider).expect(404);
      await book(id, start, recruiter, outsider).expect(404);
      await book(randomUUID(), start).expect(404);
      await book(id, plus(new Date(), -HOUR)).expect(400);
      await book(id, start, recruiter, interviewer, 5).expect(400);
      await ctx
        .http()
        .post(`${api()}/interviews`)
        .set(recruiter.auth)
        .send({
          applicationId: id,
          interviewerId: interviewer.id,
          start: start.toISOString(),
          durationMin: 30,
          meetingUrl: 'javascript:alert(1)',
        })
        .expect(400);

      const stages = await ctx.db
        .selectFrom('pipelineStages')
        .select(['id', 'kind'])
        .where('jobId', '=', job.id)
        .execute();
      const rejected = stages.find((stage) => stage.kind === 'rejected') as { id: string };
      await ctx
        .http()
        .post(`${api()}/applications/${id}/move`)
        .set(recruiter.auth)
        .send({ toStageId: rejected.id, reason: 'Not enough experience' })
        .expect(200);
      await book(id, start).expect(409);
    });

    it('keeps one winner when 20 requests race for one time', async () => {
      const people = [];
      for (let index = 0; index < 20; index++) people.push(await apply(`Racer ${index}`));
      const start = freshDay();
      const responses = await Promise.all(people.map(({ id }) => book(id, start)));

      expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
      const losers = responses.filter((response) => response.status !== 201);
      expect(losers).toHaveLength(19);
      for (const loser of losers) {
        expect(loser.status).toBe(409);
        expect(loser.body.error.code).toBe('SLOT_TAKEN');
      }
      const { count } = await ctx.db
        .selectFrom('interviews')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('interviewerId', '=', interviewer.id)
        .where('status', '=', 'scheduled')
        .where(sql<boolean>`lower(during) = ${start.toISOString()}::timestamptz`)
        .executeTakeFirstOrThrow();
      expect(Number(count)).toBe(1);
    }, 60_000);

    it('keeps one winner when 20 candidates race through their own links', async () => {
      const start = freshDay();
      const links = [];
      for (let index = 0; index < 20; index++) {
        const { id } = await apply(`Link racer ${index}`);
        links.push(await offer(id, [start]));
      }
      const responses = await Promise.all(
        links.map(({ token }) =>
          ctx
            .http()
            .post(`/api/v1/interview-offers/${token}/book`)
            .send({ start: start.toISOString() }),
        ),
      );
      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      const losers = responses.filter((response) => response.status !== 200);
      expect(losers.every((loser) => loser.status === 409)).toBe(true);
      expect(losers.every((loser) => loser.body.error.code === 'SLOT_TAKEN')).toBe(true);
    }, 60_000);

    it('keeps one winner when 20 clicks race on the same link', async () => {
      const { id } = await apply();
      const start = freshDay();
      const { token } = await offer(id, [start]);
      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          ctx
            .http()
            .post(`/api/v1/interview-offers/${token}/book`)
            .send({ start: start.toISOString() }),
        ),
      );
      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      const losers = responses.filter((response) => response.status !== 200);
      expect(losers.every((loser) => loser.body.error.code === 'SLOT_TAKEN')).toBe(true);
    }, 60_000);
  });

  describe('changing the time', () => {
    it('moves the interview, its reminders and tells everyone', async () => {
      const { id, email } = await apply();
      const start = freshDay();
      const { body: interview } = await book(id, start).expect(201);
      const later = plus(start, 3 * HOUR);

      const { body } = await ctx
        .http()
        .post(`${api()}/interviews/${interview.id}/reschedule`)
        .set(recruiter.auth)
        .send({ start: later.toISOString() })
        .expect(200);
      expect(body.start).toBe(later.toISOString());
      expect(body.end).toBe(plus(later, HOUR).toISOString());

      const reminders = await remindersOf(interview.id);
      expect(reminders.map((item) => item.remindAt.getTime())).toEqual([
        later.getTime() - 24 * HOUR,
        later.getTime() - HOUR,
      ]);
      expect(lastInterviewMail(email)?.kind).toBe('moved');
      expect(lastInterviewMail(interviewer.email)?.kind).toBe('moved');
    });

    it('keeps reminders that were already sent', async () => {
      const { id } = await apply();
      const start = freshDay();
      const { body: interview } = await book(id, start).expect(201);
      const [first] = await remindersOf(interview.id);
      await ctx.db
        .updateTable('reminders')
        .set({ sentAt: new Date() })
        .where('id', '=', (first as { id: string }).id)
        .execute();
      await ctx
        .http()
        .post(`${api()}/interviews/${interview.id}/reschedule`)
        .set(recruiter.auth)
        .send({ start: plus(start, 2 * HOUR).toISOString() })
        .expect(200);
      const reminders = await remindersOf(interview.id);
      expect(reminders).toHaveLength(3);
      expect(reminders.filter((item) => item.sentAt)).toHaveLength(1);
    });

    it('can change the length and can overlap its own old time', async () => {
      const { id } = await apply();
      const start = freshDay();
      const { body: interview } = await book(id, start).expect(201);
      const { body } = await ctx
        .http()
        .post(`${api()}/interviews/${interview.id}/reschedule`)
        .set(recruiter.auth)
        .send({ start: plus(start, 30 * MINUTE).toISOString(), durationMin: 45 })
        .expect(200);
      expect(body.end).toBe(plus(start, 75 * MINUTE).toISOString());
    });

    it('refuses a time that is taken and leaves everything as it was', async () => {
      const first = await apply();
      const other = await apply();
      const start = freshDay();
      await book(first.id, start).expect(201);
      const { body: interview } = await book(other.id, plus(start, 2 * HOUR)).expect(201);
      const before = await remindersOf(interview.id);
      const { body } = await ctx
        .http()
        .post(`${api()}/interviews/${interview.id}/reschedule`)
        .set(recruiter.auth)
        .send({ start: start.toISOString() })
        .expect(409);
      expect(body.error.code).toBe('SLOT_TAKEN');
      expect((await remindersOf(interview.id)).map((item) => item.id)).toEqual(
        before.map((item) => item.id),
      );
    });

    it('checks the role, the company and the time', async () => {
      const { id } = await apply();
      const start = freshDay();
      const { body: interview } = await book(id, start).expect(201);
      const url = `${api()}/interviews/${interview.id}/reschedule`;
      const send = { start: plus(start, HOUR).toISOString() };
      await ctx.http().post(url).set(interviewer.auth).send(send).expect(403);
      await ctx.http().post(url).set(outsider.auth).send(send).expect(404);
      await ctx
        .http()
        .post(url)
        .set(recruiter.auth)
        .send({ start: plus(new Date(), -HOUR).toISOString() })
        .expect(400);
      await ctx
        .http()
        .post(`${api()}/interviews/${randomUUID()}/reschedule`)
        .set(recruiter.auth)
        .send(send)
        .expect(404);
    });
  });

  describe('cancelling', () => {
    it('removes pending reminders, frees the time and tells everyone', async () => {
      const { id, email } = await apply();
      const start = freshDay();
      const { body: interview } = await book(id, start).expect(201);
      expect(await remindersOf(interview.id)).toHaveLength(2);

      const { body } = await ctx
        .http()
        .post(`${api()}/interviews/${interview.id}/cancel`)
        .set(recruiter.auth)
        .expect(200);
      expect(body.status).toBe('cancelled');
      expect(await remindersOf(interview.id)).toHaveLength(0);
      expect(lastInterviewMail(email)?.kind).toBe('cancelled');
      expect(lastInterviewMail(interviewer.email)?.kind).toBe('cancelled');

      const other = await apply();
      await book(other.id, start).expect(201);
    });

    it('can happen only once, and a cancelled interview cannot move', async () => {
      const { id, email } = await apply();
      const { body: interview } = await book(id, freshDay()).expect(201);
      const url = `${api()}/interviews/${interview.id}`;
      await ctx.http().post(`${url}/cancel`).set(interviewer.auth).expect(403);
      await ctx.http().post(`${url}/cancel`).set(recruiter.auth).expect(200);
      const sent = mailsTo(email).length;
      await ctx.http().post(`${url}/cancel`).set(recruiter.auth).expect(409);
      expect(mailsTo(email)).toHaveLength(sent);
      await ctx
        .http()
        .post(`${url}/reschedule`)
        .set(recruiter.auth)
        .send({ start: freshDay().toISOString() })
        .expect(409);
    });
  });

  describe('seeing interviews', () => {
    it('lists upcoming and past interviews in page order', async () => {
      const user = await signUp(ctx);
      const company = await createCompany(ctx, user);
      const createdJob = await ctx
        .http()
        .post(`${api(company)}/jobs`)
        .set(user.auth)
        .send({ title: 'Analyst', description: 'Look at the numbers and explain them well.' })
        .expect(201);
      await ctx
        .http()
        .post(`${api(company)}/jobs/${createdJob.body.id}/publish`)
        .set(user.auth)
        .expect(200);
      const { slug: companySlug } = await ctx.db
        .selectFrom('companies')
        .select('slug')
        .where('id', '=', company)
        .executeTakeFirstOrThrow();
      const ids: string[] = [];
      const base = freshDay();
      for (let index = 0; index < 3; index++) {
        const email = `candidate-${randomUUID()}@example.com`;
        await ctx
          .http()
          .post(`/api/v1/public/companies/${companySlug}/jobs/${createdJob.body.slug}/apply`)
          .field('fullName', `Person ${index}`)
          .field('email', email)
          .attach('resume', PDF, { filename: 'resume.pdf', contentType: 'application/pdf' })
          .expect(201);
        const row = await ctx.db
          .selectFrom('applications as a')
          .innerJoin('candidates as c', 'c.id', 'a.candidateId')
          .select('a.id')
          .where('c.email', '=', email)
          .executeTakeFirstOrThrow();
        const { body } = await ctx
          .http()
          .post(`${api(company)}/interviews`)
          .set(user.auth)
          .send({
            applicationId: row.id,
            interviewerId: user.id,
            start: plus(base, (2 - index) * HOUR).toISOString(),
            durationMin: 30,
          })
          .expect(201);
        ids.unshift(body.id);
      }

      const pageOne = await ctx
        .http()
        .get(`${api(company)}/interviews?limit=2`)
        .set(user.auth)
        .expect(200);
      expect(pageOne.body.items.map((item: { id: string }) => item.id)).toEqual(ids.slice(0, 2));
      const pageTwo = await ctx
        .http()
        .get(`${api(company)}/interviews?limit=2&cursor=${pageOne.body.nextCursor}`)
        .set(user.auth)
        .expect(200);
      expect(pageTwo.body.items.map((item: { id: string }) => item.id)).toEqual(ids.slice(2));
      expect(pageTwo.body.nextCursor).toBeNull();

      await ctx
        .http()
        .post(`${api(company)}/interviews/${ids[0]}/cancel`)
        .set(user.auth)
        .expect(200);
      const past = await ctx
        .http()
        .get(`${api(company)}/interviews?scope=past`)
        .set(user.auth)
        .expect(200);
      expect(past.body.items.map((item: { id: string }) => item.id)).toEqual([ids[0]]);
    });

    it('shows interviewers only their own interviews', async () => {
      const mine = await apply('Mine');
      const notMine = await apply('Not mine');
      const person = await join('interviewer');
      const start = freshDay();
      const { body: own } = await book(mine.id, start, recruiter, person).expect(201);
      const { body: other } = await book(notMine.id, start, recruiter, second).expect(201);

      const { body } = await ctx.http().get(`${api()}/interviews`).set(person.auth).expect(200);
      expect(body.items.map((item: { id: string }) => item.id)).toEqual([own.id]);

      const everyone = await ctx
        .http()
        .get(`${api()}/interviews?limit=100`)
        .set(recruiter.auth)
        .expect(200);
      expect(everyone.body.items.map((item: { id: string }) => item.id)).toEqual(
        expect.arrayContaining([own.id, other.id]),
      );
      await ctx.http().get(`${api()}/interviews`).set(outsider.auth).expect(404);
    });

    it('lists interviews and offers for one candidate, hiding offers from interviewers', async () => {
      const { id } = await apply();
      const person = await join('interviewer');
      const start = freshDay();
      await book(id, start, recruiter, person).expect(201);
      await offer(id, [plus(start, DAY)], {}, person);

      const url = `${api()}/applications/${id}/interviews`;
      const team = await ctx.http().get(url).set(recruiter.auth).expect(200);
      expect(team.body.interviews).toHaveLength(1);
      expect(team.body.offers).toHaveLength(1);
      expect(team.body.offers[0].bookingUrl).toContain('/book/');

      const interviewerView = await ctx.http().get(url).set(person.auth).expect(200);
      expect(interviewerView.body.interviews).toHaveLength(1);
      expect(interviewerView.body.offers).toEqual([]);

      await ctx.http().get(url).set(second.auth).expect(404);
      await ctx.http().get(url).set(outsider.auth).expect(404);
    });

    it('lists my upcoming interviews in all my companies', async () => {
      const person = await join('interviewer');
      const { id } = await apply('Upcoming Person');
      const { body: interview } = await book(id, freshDay(), recruiter, person).expect(201);
      const { body } = await ctx.http().get('/api/v1/me/interviews').set(person.auth).expect(200);
      expect(body).toMatchObject([
        {
          id: interview.id,
          role: 'interviewer',
          otherPerson: 'Upcoming Person',
          jobTitle: 'Backend Developer',
          companyId,
        },
      ]);
      await ctx.http().get('/api/v1/me/interviews').expect(401);
    });

    it('also shows a candidate whose account is linked', async () => {
      const person = await signUp(ctx);
      const { id, candidateId } = await apply();
      await ctx.db
        .updateTable('candidates')
        .set({ userId: person.id })
        .where('id', '=', candidateId)
        .execute();
      const { body: interview } = await book(id, freshDay()).expect(201);
      const { body } = await ctx.http().get('/api/v1/me/interviews').set(person.auth).expect(200);
      expect(body).toMatchObject([{ id: interview.id, role: 'candidate' }]);
      await ctx.http().get(`/api/v1/interviews/${interview.id}/ics`).set(person.auth).expect(200);
    });
  });

  describe('calendar files', () => {
    it('gives the file to the interviewer and hides it from everyone else', async () => {
      const { id } = await apply();
      const start = freshDay();
      const { body: interview } = await book(id, start).expect(201);
      const url = `/api/v1/interviews/${interview.id}/ics`;

      const response = await ctx.http().get(url).set(interviewer.auth).expect(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.headers['content-disposition']).toContain('interview.ics');
      expect(response.text).toContain('BEGIN:VEVENT');
      expect(response.text).toContain('LOCATION:https://meet.example.com/room');
      expect(response.text).not.toContain('Ask about');

      await ctx.http().get(url).set(recruiter.auth).expect(404);
      await ctx.http().get(url).set(outsider.auth).expect(404);
      await ctx.http().get(url).expect(401);
      await ctx
        .http()
        .get(`/api/v1/interviews/${randomUUID()}/ics`)
        .set(interviewer.auth)
        .expect(404);
    });

    it('works from the link in the email of the candidate, and only with the right signature', async () => {
      const { id, email } = await apply();
      const { body: interview } = await book(id, freshDay()).expect(201);
      const link = new URL((lastInterviewMail(email) as { link: string }).link);

      const response = await ctx.http().get(`${link.pathname}${link.search}`).expect(200);
      expect(response.text).toContain(`UID:${interview.id}@hireflow`);
      expect(response.text).not.toContain('Ask about');

      await ctx.http().get(`${link.pathname}?signature=wrong`).expect(404);
      await ctx.http().get(link.pathname).expect(404);
      const other = await book((await apply()).id, freshDay()).expect(201);
      await ctx
        .http()
        .get(`/api/v1/public/interviews/${other.body.id}/calendar${link.search}`)
        .expect(404);
    });

    it('marks a cancelled interview in the file', async () => {
      const { id } = await apply();
      const { body: interview } = await book(id, freshDay()).expect(201);
      await ctx
        .http()
        .post(`${api()}/interviews/${interview.id}/cancel`)
        .set(recruiter.auth)
        .expect(200);
      const { text } = await ctx
        .http()
        .get(`/api/v1/interviews/${interview.id}/ics`)
        .set(interviewer.auth)
        .expect(200);
      expect(text).toContain('STATUS:CANCELLED');
    });
  });

  describe('letting the candidate choose', () => {
    const publicUrl = (token: string) => `/api/v1/interview-offers/${token}`;
    const bookOffer = (token: string, start: Date, timezone?: string) =>
      ctx
        .http()
        .post(`${publicUrl(token)}/book`)
        .send({ start: start.toISOString(), timezone });

    it('emails a link and shows the page without any private details', async () => {
      const { id, email } = await apply('Asha Menon');
      const start = freshDay();
      const { token } = await offer(id, [start, plus(start, 2 * HOUR)]);

      const mail = mailsTo(email).findLast((item) => item.template === 'interview-offer');
      expect(mail?.link).toContain(`/book/${token}`);

      const { body } = await ctx.http().get(publicUrl(token)).expect(200);
      expect(body).toMatchObject({
        status: 'open',
        candidateName: 'Asha Menon',
        jobTitle: 'Backend Developer',
        durationMin: 60,
        booked: null,
      });
      expect(body.slots).toEqual([
        { start: start.toISOString(), end: plus(start, HOUR).toISOString() },
        { start: plus(start, 2 * HOUR).toISOString(), end: plus(start, 3 * HOUR).toISOString() },
      ]);
      expect(JSON.stringify(body)).not.toContain('Private team note');
      expect(JSON.stringify(body)).not.toContain(email);
    });

    it('books one of the times and uses the time zone of the candidate', async () => {
      const { id, email } = await apply();
      const start = freshDay();
      const person = await join('interviewer');
      const { token } = await offer(id, [start], {}, person);

      const { body } = await bookOffer(token, start, 'Asia/Tokyo').expect(200);
      expect(body.status).toBe('booked');
      expect(body.booked.start).toBe(start.toISOString());
      expect(body.booked.calendarUrl).toContain('/calendar?signature=');

      const mail = lastInterviewMail(email);
      expect(mail?.kind).toBe('booked');
      expect(mail?.when).toContain('Asia/Tokyo');
      expect(lastInterviewMail(person.email)?.when).not.toContain('Asia/Tokyo');

      // The interviewer can now see this person, and the reminders are set.
      await ctx.http().get(`${api()}/applications/${id}`).set(person.auth).expect(200);
      const team = await ctx
        .http()
        .get(`${api()}/applications/${id}/interviews`)
        .set(recruiter.auth)
        .expect(200);
      expect(team.body.offers[0].status).toBe('booked');
      expect(team.body.interviews[0].notes).toBe('Private team note');
      expect(await remindersOf(team.body.interviews[0].id)).toHaveLength(2);

      const again = await ctx.http().get(publicUrl(token)).expect(200);
      expect(again.body.status).toBe('booked');
    });

    it('works only once', async () => {
      const { id } = await apply();
      const start = freshDay();
      const { token } = await offer(id, [start, plus(start, 2 * HOUR)]);
      await bookOffer(token, start).expect(200);
      const { body } = await bookOffer(token, plus(start, 2 * HOUR)).expect(409);
      expect(body.error.code).toBe('SLOT_TAKEN');
    });

    it('accepts only the times that were offered', async () => {
      const { id } = await apply();
      const start = freshDay();
      const { token } = await offer(id, [start]);
      await bookOffer(token, plus(start, 15 * MINUTE)).expect(400);
      await ctx
        .http()
        .post(`${publicUrl(token)}/book`)
        .send({ start: 'soon' })
        .expect(400);
      await ctx
        .http()
        .post(`${publicUrl(token)}/book`)
        .send({ start: start.toISOString(), timezone: 'Not/AZone' })
        .expect(400);
    });

    it('hides a time that someone else has taken, and refuses it too', async () => {
      const first = await apply();
      const other = await apply();
      const start = freshDay();
      const { token } = await offer(first.id, [start, plus(start, 2 * HOUR)]);
      await book(other.id, start).expect(201);

      const { body } = await ctx.http().get(publicUrl(token)).expect(200);
      expect(body.slots.map((slot: { start: string }) => slot.start)).toEqual([
        plus(start, 2 * HOUR).toISOString(),
      ]);
      const refused = await bookOffer(token, start).expect(409);
      expect(refused.body.error.code).toBe('SLOT_TAKEN');
    });

    it('refuses made-up and changed links', async () => {
      const { id } = await apply();
      const { token, id: offerId } = await offer(id, [freshDay()]);
      const other = (await offer((await apply()).id, [freshDay()])).token;
      const [, signature] = other.split('.');
      await ctx.http().get(publicUrl('nonsense')).expect(404);
      await ctx.http().get(publicUrl(offerId)).expect(404);
      await ctx
        .http()
        .get(publicUrl(`${offerId}.${signature}`))
        .expect(404);
      await ctx
        .http()
        .get(publicUrl(`${randomUUID()}.${signature}`))
        .expect(404);
      await ctx
        .http()
        .get(publicUrl(`${token}.more`))
        .expect(404);
      await ctx
        .http()
        .post(`${publicUrl('nonsense')}/book`)
        .send({ start: new Date(Date.now() + DAY).toISOString() })
        .expect(404);
    });

    it('stops working when the time runs out', async () => {
      const { id } = await apply();
      const start = freshDay();
      const { token, id: offerId } = await offer(id, [start]);
      await ctx.db
        .updateTable('interviewOffers')
        .set({ expiresAt: new Date(Date.now() - MINUTE) })
        .where('id', '=', offerId)
        .execute();
      const { body } = await ctx.http().get(publicUrl(token)).expect(200);
      expect(body).toMatchObject({ status: 'expired', slots: [] });
      await bookOffer(token, start).expect(409);
    });

    it('stops working when withdrawn or replaced', async () => {
      const { id } = await apply();
      const start = freshDay();
      const firstOffer = await offer(id, [start]);
      const secondOffer = await offer(id, [plus(start, HOUR)]);

      const replaced = await ctx.http().get(publicUrl(firstOffer.token)).expect(200);
      expect(replaced.body.status).toBe('withdrawn');
      await bookOffer(firstOffer.token, start).expect(409);

      const url = `${api()}/interview-offers/${secondOffer.id}/withdraw`;
      await ctx.http().post(url).set(interviewer.auth).expect(403);
      await ctx.http().post(url).set(recruiter.auth).expect(204);
      await ctx.http().post(url).set(recruiter.auth).expect(404);
      await bookOffer(secondOffer.token, plus(start, HOUR)).expect(409);
    });

    it('stops working when the person is no longer in the running', async () => {
      const { id } = await apply();
      const start = freshDay();
      const { token } = await offer(id, [start]);
      const stages = await ctx.db
        .selectFrom('pipelineStages')
        .select(['id', 'kind'])
        .where('jobId', '=', job.id)
        .execute();
      const rejected = stages.find((stage) => stage.kind === 'rejected') as { id: string };
      await ctx
        .http()
        .post(`${api()}/applications/${id}/move`)
        .set(recruiter.auth)
        .send({ toStageId: rejected.id, reason: 'Role is closed' })
        .expect(200);
      const { body } = await ctx.http().get(publicUrl(token)).expect(200);
      expect(body.status).toBe('withdrawn');
      await bookOffer(token, start).expect(409);
    });

    it('shows the page as ended after the booked interview is cancelled', async () => {
      const { id } = await apply();
      const start = freshDay();
      const { token } = await offer(id, [start]);
      await bookOffer(token, start).expect(200);
      const team = await ctx
        .http()
        .get(`${api()}/applications/${id}/interviews`)
        .set(recruiter.auth)
        .expect(200);
      await ctx
        .http()
        .post(`${api()}/interviews/${team.body.interviews[0].id}/cancel`)
        .set(recruiter.auth)
        .expect(200);
      const { body } = await ctx.http().get(publicUrl(token)).expect(200);
      expect(body).toMatchObject({ status: 'withdrawn', booked: null });
    });

    it('checks the input and the role when making an offer', async () => {
      const { id } = await apply();
      const send = (user: TestUser, body: object) =>
        ctx.http().post(`${api()}/interview-offers`).set(user.auth).send(body);
      const good = {
        applicationId: id,
        interviewerId: interviewer.id,
        durationMin: 60,
        slots: [freshDay().toISOString()],
      };
      await send(interviewer, good).expect(403);
      await send(outsider, good).expect(404);
      await send(recruiter, { ...good, slots: [] }).expect(400);
      await send(recruiter, {
        ...good,
        slots: [plus(new Date(), -HOUR).toISOString()],
      }).expect(400);
      await send(recruiter, {
        ...good,
        slots: Array.from({ length: 11 }, (_, index) => plus(freshDay(), index).toISOString()),
      }).expect(400);
      await send(recruiter, { ...good, interviewerId: outsider.id }).expect(404);
    });
  });

  describe('when things around an interview change', () => {
    it('will not remove a team member with interviews coming up', async () => {
      const person = await join('interviewer');
      const { id } = await apply();
      const { body: interview } = await book(id, freshDay(), recruiter, person).expect(201);
      const url = `${api()}/members/${person.id}`;
      const { body } = await ctx.http().delete(url).set(admin.auth).expect(409);
      expect(body.error.message).toContain('interviews coming up');

      await ctx
        .http()
        .post(`${api()}/interviews/${interview.id}/cancel`)
        .set(recruiter.auth)
        .expect(200);
      await setHours(person);
      await ctx.http().delete(url).set(admin.auth).expect(204);
      const rules = await ctx.db
        .selectFrom('availabilityRules')
        .select('id')
        .where('userId', '=', person.id)
        .execute();
      expect(rules).toEqual([]);
    });

    it('removes interviews and reminders when candidate data is deleted', async () => {
      const { id, candidateId } = await apply();
      const start = freshDay();
      const { body: interview } = await book(id, start).expect(201);
      await offer(id, [plus(start, DAY)]);
      await ctx.http().delete(`${api()}/candidates/${candidateId}`).set(admin.auth).expect(204);
      expect(await remindersOf(interview.id)).toEqual([]);
      const left = await ctx.db
        .selectFrom('interviews')
        .select('id')
        .where('id', '=', interview.id)
        .execute();
      expect(left).toEqual([]);
    });
  });
});
