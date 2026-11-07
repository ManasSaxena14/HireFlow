import type pg from 'pg';

export interface MatchableJob {
  title: string;
  description: string | null;
  location: string | null;
  remote: boolean;
}

export interface MatchableAlert {
  keywords: string[];
  locations: string[];
  remote_only: boolean;
}

const BATCH_SIZE = 200;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole words only, so a "java" alert does not send JavaScript jobs. */
const containsWord = (text: string, word: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, 'iu').test(text);

export function matchesAlert(job: MatchableJob, alert: MatchableAlert): boolean {
  if (alert.remote_only && !job.remote) return false;
  if (alert.locations.length > 0) {
    const location = (job.location ?? '').toLowerCase();
    if (!alert.locations.some((place) => location.includes(place.toLowerCase()))) return false;
  }
  const text = `${job.title}\n${job.description ?? ''}`;
  return alert.keywords.some((keyword) => containsWord(text, keyword));
}

/**
 * Compares jobs not looked at yet with every active alert. The job is marked in the same
 * transaction as its delivery rows, so a crash only means the next run does the job again.
 * The primary key on delivery rows means a job can never be queued twice for one alert.
 */
export async function matchNewJobs(pool: pg.Pool): Promise<{ jobs: number; matches: number }> {
  const totals = { jobs: 0, matches: 0 };
  for (;;) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: jobs } = await client.query<MatchableJob & { id: string }>(
        `SELECT id, title, description, location, remote FROM feed_jobs
          WHERE matched_at IS NULL
          ORDER BY created_at
          LIMIT $1
            FOR UPDATE SKIP LOCKED`,
        [BATCH_SIZE],
      );
      if (jobs.length === 0) {
        await client.query('COMMIT');
        return totals;
      }
      const { rows: alerts } = await client.query<MatchableAlert & { id: string }>(
        `SELECT a.id, a.keywords, a.locations, a.remote_only
           FROM job_alerts a JOIN users u ON u.id = a.user_id
          WHERE a.active AND u.is_active`,
      );
      const alertIds: string[] = [];
      const jobIds: string[] = [];
      for (const job of jobs) {
        for (const alert of alerts) {
          if (matchesAlert(job, alert)) {
            alertIds.push(alert.id);
            jobIds.push(job.id);
          }
        }
      }
      if (alertIds.length > 0) {
        await client.query(
          `INSERT INTO alert_deliveries (alert_id, feed_job_id)
           SELECT * FROM unnest($1::uuid[], $2::uuid[])
           ON CONFLICT DO NOTHING`,
          [alertIds, jobIds],
        );
      }
      await client.query(`UPDATE feed_jobs SET matched_at = now() WHERE id = ANY($1::uuid[])`, [
        jobs.map((job) => job.id),
      ]);
      await client.query('COMMIT');
      totals.jobs += jobs.length;
      totals.matches += alertIds.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
