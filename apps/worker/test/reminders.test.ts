import { randomUUID } from 'node:crypto';
import { MAIL_QUEUE, type MailMessage } from '@hireflow/shared';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanUp } from '../src/cleanup.js';
import { deliverMail } from '../src/mail/deliver.js';
import type { MailSender } from '../src/mail/sender.js';
import { type EnqueueMail, scanReminders } from '../src/reminders/scan.js';

const connectionString =
  process.env.TEST_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_test';
const pool = new pg.Pool({ connectionString });
const APP_URL = 'http://localhost:3000';

async function seedUser(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name) VALUES ($1, 'x', 'Test User') RETURNING id`,
    [`worker-${randomUUID()}@example.com`],
  );
  return (rows[0] as { id: string }).id;
}

async function seedReminder(userId: string, remindAt = "now() - interval '1 minute'") {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO reminders (user_id, remind_at, message)
     VALUES ($1, ${remindAt}, 'Follow up with the recruiter') RETURNING id`,
    [userId],
  );
  return (rows[0] as { id: string }).id;
}

const sentAt = async (id: string) => {
  const { rows } = await pool.query<{ sent_at: Date | null }>(
    'SELECT sent_at FROM reminders WHERE id = $1',
    [id],
  );
  return rows[0]?.sent_at ?? null;
};

const notificationCount = async (userId: string) => {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*) FROM notifications WHERE user_id = $1',
    [userId],
  );
  return Number(rows[0]?.count);
};

describe('reminders scan', () => {
  let queued: MailMessage[];
  const collect: EnqueueMail = async (message) => {
    queued.push(message);
  };

  beforeEach(async () => {
    queued = [];
    await pool.query('DELETE FROM reminders');
  });
  afterAll(async () => {
    await pool.end();
  });

  it('processes a due reminder once across repeated scans', async () => {
    const userId = await seedUser();
    const id = await seedReminder(userId);

    await expect(scanReminders(pool, collect, APP_URL)).resolves.toBe(1);
    await expect(scanReminders(pool, collect, APP_URL)).resolves.toBe(0);

    expect(queued).toHaveLength(1);
    expect(queued[0]?.dedupeKey).toBe(`reminder:${id}`);
    expect(await sentAt(id)).not.toBeNull();
    expect(await notificationCount(userId)).toBe(1);
  });

  it('leaves reminders that are not due yet', async () => {
    const userId = await seedUser();
    const id = await seedReminder(userId, "now() + interval '1 hour'");
    await expect(scanReminders(pool, collect, APP_URL)).resolves.toBe(0);
    expect(await sentAt(id)).toBeNull();
  });

  it('parallel workers never take the same reminder', async () => {
    const userId = await seedUser();
    await Promise.all(Array.from({ length: 20 }, () => seedReminder(userId)));

    const counts = await Promise.all(
      Array.from({ length: 4 }, () => scanReminders(pool, collect, APP_URL)),
    );

    const total = counts.reduce((sum, count) => sum + count, 0);
    expect(total).toBe(20);
    expect(new Set(queued.map((m) => m.dedupeKey)).size).toBe(20);
    expect(await notificationCount(userId)).toBe(20);
  });

  it('a crash mid-scan leaves nothing half done, and the next tick finishes the job', async () => {
    const userId = await seedUser();
    const id = await seedReminder(userId);

    const crashing: EnqueueMail = async () => {
      throw new Error('worker killed');
    };
    await expect(scanReminders(pool, crashing, APP_URL)).rejects.toThrow('worker killed');
    expect(await sentAt(id)).toBeNull();
    expect(await notificationCount(userId)).toBe(0);

    await expect(scanReminders(pool, collect, APP_URL)).resolves.toBe(1);
    expect(queued).toHaveLength(1);
    expect(await notificationCount(userId)).toBe(1);
  });

  describe('through the real queue', () => {
    let boss: PgBoss;

    beforeAll(async () => {
      boss = new PgBoss({ connectionString, schedule: false, supervise: false });
      await boss.start();
      await boss.createQueue(MAIL_QUEUE, { retryLimit: 5 });
    });
    afterAll(async () => {
      await boss.stop({ graceful: false });
    });

    it('emails a due reminder exactly once even if the worker restarts and reruns the job', async () => {
      const userId = await seedUser();
      await seedReminder(userId);

      const enqueue: EnqueueMail = async (message, client) => {
        await boss.send(MAIL_QUEUE, message, {
          db: {
            executeSql: async (text, values) => {
              const { rows } = await client.query(text, values as unknown[]);
              return { rows } as never;
            },
          },
        });
      };
      const sent: string[] = [];
      const sender: MailSender = {
        send: async (to) => {
          sent.push(to);
        },
      };

      await scanReminders(pool, enqueue, APP_URL);
      // A restarted worker scans again before anything else happens.
      await scanReminders(pool, enqueue, APP_URL);

      const jobs = await boss.fetch<MailMessage>(MAIL_QUEUE, { batchSize: 10 });
      expect(jobs).toHaveLength(1);
      const job = jobs[0];
      if (!job) throw new Error('expected a job');

      // The job was claimed but the worker died before acknowledging it, so it runs again.
      await expect(deliverMail(pool, sender, job.data)).resolves.toBe('sent');
      await expect(deliverMail(pool, sender, job.data)).resolves.toBe('duplicate');
      await boss.complete(MAIL_QUEUE, job.id);

      expect(sent).toHaveLength(1);
    });
  });

  describe('interview reminders', () => {
    async function seedInterview(meetingUrl: string | null, candidateTimezone: string | null) {
      const interviewerId = await seedUser();
      const one = async <T>(text: string, values: unknown[]) =>
        (await pool.query(text, values)).rows[0] as T;
      const suffix = randomUUID();
      const { id: companyId } = await one<{ id: string }>(
        `INSERT INTO companies (name, slug) VALUES ('Tessera', $1) RETURNING id`,
        [`tessera-${suffix}`],
      );
      const { id: jobId } = await one<{ id: string }>(
        `INSERT INTO jobs (company_id, title, slug, description, created_by)
         VALUES ($1, 'Backend Developer', 'backend', 'About the job', $2) RETURNING id`,
        [companyId, interviewerId],
      );
      const { id: stageId } = await one<{ id: string }>(
        `INSERT INTO pipeline_stages (company_id, job_id, name, position, kind)
         VALUES ($1, $2, 'Interview', 0, 'interview') RETURNING id`,
        [companyId, jobId],
      );
      const { id: candidateId } = await one<{ id: string }>(
        `INSERT INTO candidates (company_id, full_name, email)
         VALUES ($1, 'Asha Menon', $2) RETURNING id`,
        [companyId, `asha-${suffix}@example.com`],
      );
      const { id: applicationId } = await one<{ id: string }>(
        `INSERT INTO applications (company_id, job_id, candidate_id, stage_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [companyId, jobId, candidateId, stageId],
      );
      const { id: interviewId } = await one<{ id: string }>(
        `INSERT INTO interviews (company_id, application_id, candidate_id, interviewer_id, during,
                                 meeting_url, candidate_timezone, created_by)
         VALUES ($1, $2, $3, $4,
                 tstzrange('2030-01-07T09:00:00Z', '2030-01-07T10:00:00Z', '[)'), $5, $6, $4)
         RETURNING id`,
        [companyId, applicationId, candidateId, interviewerId, meetingUrl, candidateTimezone],
      );
      const { id: reminderId } = await one<{ id: string }>(
        `INSERT INTO reminders (user_id, interview_id, kind, remind_at, message)
         VALUES ($1, $2, 'interview', now() - interval '1 minute', 'Interview with Asha Menon')
         RETURNING id`,
        [interviewerId, interviewId],
      );
      return { interviewerId, companyId, applicationId, reminderId, suffix };
    }

    it('tells the interviewer and emails the candidate in their own zone', async () => {
      const seeded = await seedInterview('https://meet.example.com/room', 'Asia/Tokyo');
      await scanReminders(pool, collect, APP_URL);

      const forCandidate = queued.find((mail) => mail.dedupeKey.endsWith(':candidate'));
      expect(forCandidate).toMatchObject({
        template: 'interview',
        kind: 'reminder',
        to: `asha-${seeded.suffix}@example.com`,
        jobTitle: 'Backend Developer',
        companyName: 'Tessera',
        withName: 'Test User',
        link: 'https://meet.example.com/room',
        linkLabel: 'Join interview',
      });
      expect((forCandidate as { when: string }).when).toContain('6:00 pm (Asia/Tokyo)');

      const forInterviewer = queued.find(
        (mail) => mail.dedupeKey === `reminder:${seeded.reminderId}`,
      );
      expect(forInterviewer?.link).toBe(
        `${APP_URL}/company/${seeded.companyId}/candidates/${seeded.applicationId}`,
      );

      const { rows } = await pool.query<{ payload: { link: string } }>(
        'SELECT payload FROM notifications WHERE user_id = $1',
        [seeded.interviewerId],
      );
      expect(rows[0]?.payload.link).toBe(
        `/company/${seeded.companyId}/candidates/${seeded.applicationId}`,
      );
      expect(await sentAt(seeded.reminderId)).not.toBeNull();
    });

    it('does not remind anyone about an interview that has gone by', async () => {
      const seeded = await seedInterview(null, null);
      await pool.query(
        `UPDATE interviews SET during = tstzrange(now() - interval '2 hours', now() - interval '1 hour', '[)')
          WHERE application_id = $1`,
        [seeded.applicationId],
      );
      await scanReminders(pool, collect, APP_URL);
      expect(queued).toEqual([]);
      expect(await sentAt(seeded.reminderId)).not.toBeNull();
      expect(await notificationCount(seeded.interviewerId)).toBe(0);
    });

    it('sends nothing twice, and links to the company if there is no meeting link', async () => {
      const seeded = await seedInterview(null, null);
      await scanReminders(pool, collect, APP_URL);
      const count = queued.length;
      await scanReminders(pool, collect, APP_URL);
      expect(queued).toHaveLength(count);

      const forCandidate = queued.find((mail) => mail.dedupeKey.endsWith(':candidate'));
      expect(forCandidate?.link).toBe(`${APP_URL}/c/tessera-${seeded.suffix}`);
    });
  });

  describe('clean up', () => {
    it('removes only the rows nobody can use any more', async () => {
      const userId = await seedUser();
      const token = (hash: string, expires: string) =>
        pool.query(
          `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
           VALUES ($1, gen_random_uuid(), $2, ${expires})`,
          [userId, hash],
        );
      const oldHash = randomUUID();
      const liveHash = randomUUID();
      await token(oldHash, "now() - interval '2 days'");
      await token(liveHash, "now() + interval '2 days'");

      await cleanUp(pool);

      const { rows } = await pool.query<{ token_hash: string }>(
        'SELECT token_hash FROM refresh_tokens WHERE user_id = $1',
        [userId],
      );
      expect(rows.map((row) => row.token_hash)).toEqual([liveHash]);
    });
  });
});
