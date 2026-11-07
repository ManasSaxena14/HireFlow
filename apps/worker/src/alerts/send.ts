import { createHash } from 'node:crypto';
import type { AlertFrequency, JobAlertGroup } from '@hireflow/shared';
import type pg from 'pg';
import type { EnqueueMail } from '../reminders/scan.js';

const MAX_JOBS_IN_EMAIL = 20;

interface WaitingRow {
  alert_id: string;
  feed_job_id: string;
  alert_name: string;
  email: string;
  full_name: string;
  title: string;
  company_name: string;
  location: string | null;
  url: string;
}

/**
 * Which waiting rows can go now. $1 is instant or daily, and $2 is the time now.
 * Daily alerts go in the hour after 08:00 on the person's clock, once a day. If the worker
 * is down for that hour, the rows wait for the next morning and are not lost.
 * We only email addresses that are confirmed, so nobody can sign a stranger up for alerts.
 */
const READY_TO_SEND = `
      d.delivered_at IS NULL AND a.active AND a.frequency = $1
  AND u.is_active AND u.email_verified_at IS NOT NULL
  AND (
    a.frequency = 'instant' OR (
      ($2::timestamptz AT TIME ZONE u.timezone)::time >= '08:00'
      AND ($2::timestamptz AT TIME ZONE u.timezone)::time < '09:00'
      AND (
        a.last_sent_at IS NULL OR
        (a.last_sent_at AT TIME ZONE u.timezone)::date < ($2::timestamptz AT TIME ZONE u.timezone)::date
      )
    )
  )`;

/** Puts jobs under their alert. A job that fits two alerts is listed only once in the email. */
function groupForEmail(rows: WaitingRow[]) {
  const groups = new Map<string, JobAlertGroup>();
  const seen = new Set<string>();
  let shown = 0;
  for (const row of rows) {
    if (seen.has(row.feed_job_id)) continue;
    seen.add(row.feed_job_id);
    if (shown === MAX_JOBS_IN_EMAIL) continue;
    shown += 1;
    const group = groups.get(row.alert_id) ?? { alertName: row.alert_name, jobs: [] };
    group.jobs.push({
      title: row.title,
      companyName: row.company_name,
      location: row.location,
      url: row.url,
    });
    groups.set(row.alert_id, group);
  }
  return { groups: [...groups.values()], total: seen.size, moreCount: seen.size - shown };
}

async function sendForUser(
  client: pg.PoolClient,
  userId: string,
  enqueue: EnqueueMail,
  appUrl: string,
  frequency: AlertFrequency,
  at: Date,
): Promise<boolean> {
  await client.query('BEGIN');
  const { rows } = await client.query<WaitingRow>(
    `SELECT d.alert_id, d.feed_job_id, a.name AS alert_name, u.email, u.full_name,
            j.title, j.company_name, j.location, j.url
       FROM alert_deliveries d
       JOIN job_alerts a ON a.id = d.alert_id
       JOIN users u ON u.id = a.user_id
       JOIN feed_jobs j ON j.id = d.feed_job_id
      WHERE ${READY_TO_SEND} AND a.user_id = $3
      ORDER BY a.created_at, coalesce(j.posted_at, j.created_at) DESC, j.id
        FOR UPDATE OF d SKIP LOCKED`,
    [frequency, at, userId],
  );
  const first = rows[0];
  if (!first) {
    await client.query('COMMIT');
    return false;
  }

  const alertIds = rows.map((row) => row.alert_id);
  const jobIds = rows.map((row) => row.feed_job_id);
  const { groups, total, moreCount } = groupForEmail(rows);
  const pairs = rows.map((row) => `${row.alert_id}:${row.feed_job_id}`).sort();

  await enqueue(
    {
      template: 'job-alert',
      kind: frequency,
      to: first.email,
      dedupeKey: `job-alert:${createHash('sha256').update(pairs.join(',')).digest('hex')}`,
      name: first.full_name,
      groups,
      moreCount,
      link: `${appUrl}/app/feed`,
    },
    client,
  );
  await client.query(
    `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'job-alert', $2)`,
    [
      userId,
      JSON.stringify({
        message:
          total === 1
            ? `A new job matches your alerts: ${groups[0]?.jobs[0]?.title}`
            : `${total} new jobs match your alerts`,
        link: '/app/feed',
      }),
    ],
  );
  await client.query(
    `UPDATE alert_deliveries d SET delivered_at = $3
       FROM unnest($1::uuid[], $2::uuid[]) AS sent (alert_id, feed_job_id)
      WHERE d.alert_id = sent.alert_id AND d.feed_job_id = sent.feed_job_id`,
    [alertIds, jobIds, at],
  );
  await client.query(`UPDATE job_alerts SET last_sent_at = $2 WHERE id = ANY($1::uuid[])`, [
    [...new Set(alertIds)],
    at,
  ]);
  await client.query('COMMIT');
  return true;
}

/**
 * Sends one email per person with everything that is waiting. The email job, the notification
 * and the delivered marks are saved together, so a retry cannot send the same job twice.
 * One person's problem does not stop the others. The job fails at the end, so it retries.
 */
export async function sendAlerts(
  pool: pg.Pool,
  enqueue: EnqueueMail,
  appUrl: string,
  frequency: AlertFrequency,
  at: Date = new Date(),
): Promise<number> {
  const { rows: users } = await pool.query<{ user_id: string }>(
    `SELECT DISTINCT a.user_id
       FROM alert_deliveries d
       JOIN job_alerts a ON a.id = d.alert_id
       JOIN users u ON u.id = a.user_id
      WHERE ${READY_TO_SEND}`,
    [frequency, at],
  );

  let sent = 0;
  let failed = 0;
  for (const { user_id: userId } of users) {
    const client = await pool.connect();
    try {
      if (await sendForUser(client, userId, enqueue, appUrl, frequency, at)) sent += 1;
    } catch {
      await client.query('ROLLBACK');
      failed += 1;
    } finally {
      client.release();
    }
  }
  if (failed > 0) throw new Error(`Job alerts failed for ${failed} of ${users.length} people.`);
  return sent;
}
