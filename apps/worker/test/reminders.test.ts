import { randomUUID } from 'node:crypto';
import { MAIL_QUEUE, type MailMessage } from '@hireflow/shared';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
});
