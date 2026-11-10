import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { MailMessage } from '@hireflow/shared';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { matchNewJobs } from '../src/alerts/match.js';
import { sendAlerts } from '../src/alerts/send.js';
import { cleanUp } from '../src/cleanup.js';
import { ADAPTERS } from '../src/feed/adapters.js';
import { fetchSources } from '../src/feed/fetch.js';
import { FeedFetchError, type FeedHttp } from '../src/feed/http.js';
import { renderMail } from '../src/mail/templates.js';
import type { EnqueueMail } from '../src/reminders/scan.js';

const pool = new pg.Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_test',
});
const APP_URL = 'http://localhost:3000';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

/** Answers from recorded files, so these tests never use the network. */
const recordedHttp: FeedHttp = {
  async getJson(url) {
    if (url.includes('greenhouse')) return fixture('greenhouse');
    if (url.includes('/broken'))
      throw new FeedFetchError('The source answered with status 500.', true);
    return fixture('lever');
  },
};

async function addSource(name: string, kind: string, config: object) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO feed_sources (name, kind, config) VALUES ($1, $2, $3) RETURNING id`,
    [name, kind, JSON.stringify(config)],
  );
  return (rows[0] as { id: string }).id;
}

const addGreenhouse = () => addSource('Larkspur board', 'greenhouse', { board: 'larkspur' });
const addLever = () =>
  addSource('Larkspur Lever', 'lever', { site: 'larkspur', companyName: 'Larkspur' });

const fetchNow = (http = recordedHttp) =>
  fetchSources(pool, ADAPTERS, http, () => undefined, { minGapMinutes: 0, pauseMs: 0 });

const count = async (table: string, where = 'true') => {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM ${table} WHERE ${where}`,
  );
  return Number(rows[0]?.count);
};

async function addUser(timezone = 'UTC', verified = true) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, full_name, timezone, email_verified_at)
     VALUES ($1, 'Riya Menon', $2, $3) RETURNING id`,
    [`feed-${randomUUID()}@example.com`, timezone, verified ? new Date() : null],
  );
  return (rows[0] as { id: string }).id;
}

async function addAlert(
  userId: string,
  options: {
    keywords?: string[];
    frequency?: 'instant' | 'daily';
    name?: string;
    active?: boolean;
  } = {},
) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO job_alerts (user_id, name, keywords, frequency, active)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      userId,
      options.name ?? 'Backend jobs',
      options.keywords ?? ['backend'],
      options.frequency ?? 'instant',
      options.active ?? true,
    ],
  );
  return (rows[0] as { id: string }).id;
}

describe('job feed', () => {
  let queued: MailMessage[];
  const collect: EnqueueMail = async (message) => {
    queued.push(message);
  };

  beforeEach(async () => {
    queued = [];
    await pool.query('DELETE FROM feed_sources');
    await pool.query('DELETE FROM job_alerts');
    await pool.query(`DELETE FROM notifications WHERE type = 'job-alert'`);
  });
  afterAll(async () => {
    await pool.end();
  });

  describe('fetching', () => {
    it('stores no duplicates when the fetch runs twice', async () => {
      await addGreenhouse();
      expect((await fetchNow()).added).toBe(2);
      expect((await fetchNow()).added).toBe(0);
      expect(await count('feed_jobs')).toBe(2);
    });

    it('keeps one copy of a job that is on two sources', async () => {
      await addGreenhouse();
      await addLever();
      const result = await fetchNow();
      // Two from the first board, and only the new one from the second.
      expect(result).toEqual({ ok: 2, failed: 0, added: 3 });
      expect(await count('feed_jobs', `title = 'Senior Backend Engineer'`)).toBe(1);
    });

    it('updates a job when the source changes it', async () => {
      await addGreenhouse();
      await fetchNow();
      const changed: FeedHttp = {
        getJson: async () => ({
          jobs: [
            {
              id: 1002,
              title: 'Lead Product Designer',
              company_name: 'Larkspur',
              absolute_url: 'https://job-boards.greenhouse.io/larkspur/jobs/1002',
              location: { name: 'London' },
              content: '',
            },
          ],
        }),
      };
      await fetchNow(changed);
      expect(await count('feed_jobs')).toBe(2);
      expect(await count('feed_jobs', `title = 'Lead Product Designer'`)).toBe(1);
    });

    it('marks a failing source as failed and still runs the others', async () => {
      const broken = await addSource('A broken board', 'lever', {
        site: 'broken',
        companyName: 'Broken',
      });
      const unknown = await addSource('A later kind', 'rss', {});
      const working = await addGreenhouse();

      const result = await fetchNow();
      expect(result).toEqual({ ok: 1, failed: 2, added: 2 });

      const { rows } = await pool.query<{ id: string; last_status: string; last_error: string }>(
        `SELECT id, last_status, last_error FROM feed_sources WHERE last_run_at IS NOT NULL`,
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(broken)).toMatchObject({
        last_status: 'failed',
        last_error: 'The source answered with status 500.',
      });
      expect(byId.get(unknown)?.last_status).toBe('failed');
      expect(byId.get(working)).toMatchObject({ last_status: 'ok', last_error: null });
    });

    it('skips sources fetched a short time ago and turned-off sources', async () => {
      const id = await addGreenhouse();
      await fetchSources(pool, ADAPTERS, recordedHttp);
      const calls: string[] = [];
      const spy: FeedHttp = {
        getJson: async (url) => {
          calls.push(url);
          return { jobs: [] };
        },
      };
      await fetchSources(pool, ADAPTERS, spy);
      await pool.query(
        'UPDATE feed_sources SET enabled = false, last_run_at = NULL WHERE id = $1',
        [id],
      );
      await fetchSources(pool, ADAPTERS, spy);
      expect(calls).toEqual([]);
    });

    it('removes jobs gone from their source for a long time', async () => {
      await addGreenhouse();
      await fetchNow();
      await pool.query(
        `UPDATE feed_jobs SET last_seen_at = now() - interval '31 days'
          WHERE title = 'Product Designer'`,
      );
      await cleanUp(pool);
      expect(await count('feed_jobs')).toBe(1);
    });
  });

  describe('alerts', () => {
    it('delivers a job at most once, however often the jobs run', async () => {
      const user = await addUser();
      const alert = await addAlert(user);
      await addGreenhouse();

      await fetchNow();
      expect(await matchNewJobs(pool)).toEqual({ jobs: 2, matches: 1 });
      expect(await sendAlerts(pool, collect, APP_URL, 'instant')).toBe(1);

      await fetchNow();
      expect(await matchNewJobs(pool)).toEqual({ jobs: 0, matches: 0 });
      expect(await sendAlerts(pool, collect, APP_URL, 'instant')).toBe(0);

      expect(queued).toHaveLength(1);
      expect(await count('alert_deliveries', `alert_id = '${alert}'`)).toBe(1);
      expect(await count('alert_deliveries', 'delivered_at IS NULL')).toBe(0);
      expect(await count('notifications', `user_id = '${user}' AND type = 'job-alert'`)).toBe(1);
    });

    it('does not match a job again if it comes back to be matched', async () => {
      await addAlert(await addUser());
      await addGreenhouse();
      await fetchNow();
      await matchNewJobs(pool);
      await pool.query('UPDATE feed_jobs SET matched_at = NULL');
      await matchNewJobs(pool);
      expect(await count('alert_deliveries')).toBe(1);
    });

    it('undoes the delivered marks if the email cannot be added', async () => {
      await addAlert(await addUser());
      await addGreenhouse();
      await fetchNow();
      await matchNewJobs(pool);
      const failing: EnqueueMail = async () => {
        throw new Error('queue is down');
      };
      await expect(sendAlerts(pool, failing, APP_URL, 'instant')).rejects.toThrow();
      expect(await count('alert_deliveries', 'delivered_at IS NULL')).toBe(1);
      expect(await sendAlerts(pool, collect, APP_URL, 'instant')).toBe(1);
    });

    it('ignores paused alerts and emails nobody without a confirmed address', async () => {
      await addAlert(await addUser(), { active: false });
      const unconfirmed = await addAlert(await addUser('UTC', false));
      await addGreenhouse();
      await fetchNow();
      await matchNewJobs(pool);
      expect(await sendAlerts(pool, collect, APP_URL, 'instant')).toBe(0);
      expect(queued).toEqual([]);
      expect(await count('alert_deliveries')).toBe(1);
      expect(await count('alert_deliveries', `alert_id = '${unconfirmed}'`)).toBe(1);
    });

    it('groups jobs by alert and lists a job only once in the email', async () => {
      const user = await addUser();
      await addAlert(user, { name: 'Backend', keywords: ['backend'] });
      await addAlert(user, { name: 'Node', keywords: ['node'] });
      await addAlert(user, { name: 'Design', keywords: ['designer'] });
      await addGreenhouse();
      await fetchNow();
      await matchNewJobs(pool);
      await sendAlerts(pool, collect, APP_URL, 'instant');

      expect(queued).toHaveLength(1);
      const mail = queued[0] as Extract<MailMessage, { template: 'job-alert' }>;
      expect(mail.link).toBe(`${APP_URL}/app/feed`);
      expect(mail.groups.map((group) => group.alertName).sort()).toEqual(['Backend', 'Design']);
      expect(await count('alert_deliveries', 'delivered_at IS NOT NULL')).toBe(3);
    });

    it('keeps the email short when many jobs wait', async () => {
      const user = await addUser();
      const alert = await addAlert(user);
      const source = await addGreenhouse();
      for (let index = 0; index < 25; index++) {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO feed_jobs (source_id, external_id, title, company_name, url, job_hash)
           VALUES ($1, $2, $3, 'Larkspur', 'https://example.com/job', $2) RETURNING id`,
          [source, String(index), `Backend ${index}`],
        );
        await pool.query(`INSERT INTO alert_deliveries (alert_id, feed_job_id) VALUES ($1, $2)`, [
          alert,
          rows[0]?.id,
        ]);
      }
      await sendAlerts(pool, collect, APP_URL, 'instant');
      const mail = queued[0] as Extract<MailMessage, { template: 'job-alert' }>;
      expect(mail.groups[0]?.jobs).toHaveLength(20);
      expect(mail.moreCount).toBe(5);
      expect(await count('alert_deliveries', 'delivered_at IS NULL')).toBe(0);
    });

    describe('daily email', () => {
      // 08:15 in Kolkata is 02:45 in UTC.
      const morning = new Date('2026-11-10T02:45:00Z');
      const afternoon = new Date('2026-11-10T09:00:00Z');
      const nextMorning = new Date('2026-11-11T02:45:00Z');

      const prepare = async (timezone: string) => {
        await addAlert(await addUser(timezone), { frequency: 'daily' });
        await addGreenhouse();
        await fetchNow();
        await matchNewJobs(pool);
      };

      it('goes at 8 am on the person’s own clock, and not before', async () => {
        await prepare('Asia/Kolkata');
        expect(await sendAlerts(pool, collect, APP_URL, 'daily', afternoon)).toBe(0);
        expect(await sendAlerts(pool, collect, APP_URL, 'instant', morning)).toBe(0);
        expect(await sendAlerts(pool, collect, APP_URL, 'daily', morning)).toBe(1);
        expect(queued[0]).toMatchObject({ template: 'job-alert', kind: 'daily' });
      });

      it('is sent once a day', async () => {
        await prepare('Asia/Kolkata');
        await sendAlerts(pool, collect, APP_URL, 'daily', morning);

        await pool.query(`UPDATE feed_jobs SET title = 'Backend Lead', matched_at = NULL
                           WHERE title = 'Product Designer'`);
        await matchNewJobs(pool);
        const laterToday = new Date(morning.getTime() + 15 * 60_000);
        expect(await sendAlerts(pool, collect, APP_URL, 'daily', laterToday)).toBe(0);
        expect(await sendAlerts(pool, collect, APP_URL, 'daily', nextMorning)).toBe(1);
        expect(queued).toHaveLength(2);
      });

      it('uses a time zone that is not on the hour', async () => {
        await prepare('Asia/Kathmandu');
        // 08:00 in Kathmandu, which is 5 hours and 45 minutes ahead of UTC.
        expect(
          await sendAlerts(pool, collect, APP_URL, 'daily', new Date('2026-11-10T02:15:00Z')),
        ).toBe(1);
      });
    });
  });

  describe('job alert email', () => {
    const message: Extract<MailMessage, { template: 'job-alert' }> = {
      template: 'job-alert',
      kind: 'daily',
      to: 'riya@example.com',
      dedupeKey: 'x',
      name: 'Riya',
      groups: [
        {
          alertName: 'Backend <jobs>',
          jobs: [
            {
              title: 'Engineer <b>',
              companyName: 'Larkspur',
              location: 'London',
              url: 'https://example.com/1?a=1&b=2',
            },
          ],
        },
      ],
      moreCount: 2,
      link: 'http://localhost:3000/app/feed',
    };

    it('escapes what came from outside and lists the links', () => {
      const mail = renderMail(message);
      expect(mail.subject).toBe('Your daily jobs: 3 new jobs');
      expect(mail.html).toContain('Engineer &lt;b&gt;');
      expect(mail.html).toContain('Backend &lt;jobs&gt;');
      expect(mail.html).not.toContain('<b>');
      expect(mail.html).toContain('https://example.com/1?a=1&amp;b=2');
      expect(mail.text).toContain(
        '- Engineer <b> (Larkspur, London): https://example.com/1?a=1&b=2',
      );
      expect(mail.text).toContain('And 2 more on HireFlow.');
    });

    it('uses the right words for one job', () => {
      const mail = renderMail({ ...message, kind: 'instant', moreCount: 0 });
      expect(mail.subject).toBe('1 new job for your alerts');
      expect(mail.text).toContain('We found 1 new job that matches your alerts.');
    });
  });
});
