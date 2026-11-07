import { jobHash } from '@hireflow/shared/node';
import type pg from 'pg';
import type { FeedHttp } from './http.js';
import type { NormalJob, SourceAdapter } from './types.js';

interface SourceRow {
  id: string;
  name: string;
  kind: string;
  config: unknown;
}

export interface FetchOptions {
  /** A source fetched more recently than this is skipped. */
  minGapMinutes?: number;
  /** A short wait between sources, so we are polite when many sit on one host. */
  pauseMs?: number;
}

export type ReportProblem = (problem: { source: string; error: string }) => void;

/**
 * Saves one job. The first try adds it. If that hits a unique rule, the job is either one we
 * have from this source, which gets updated, or the same job from another source, which we
 * keep only once. Either way we note that the job is still listed.
 */
async function saveJob(pool: pg.Pool, sourceId: string, job: NormalJob): Promise<boolean> {
  const hash = jobHash(job.title, job.companyName, job.location);
  const fields = [
    job.title,
    job.companyName,
    job.location,
    job.remote,
    job.url,
    job.description,
    job.skills,
    job.postedAt,
    hash,
  ];
  const added = await pool.query(
    `INSERT INTO feed_jobs (title, company_name, location, remote, url, description, skills,
                            posted_at, job_hash, source_id, external_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT DO NOTHING`,
    [...fields, sourceId, job.externalId],
  );
  if (added.rowCount) return true;

  const updated = await pool.query(
    `UPDATE feed_jobs
        SET title = $1, company_name = $2, location = $3, remote = $4, url = $5, description = $6,
            skills = $7, posted_at = $8, job_hash = $9, last_seen_at = now()
      WHERE source_id = $10 AND external_id = $11
        AND NOT EXISTS (
          SELECT 1 FROM feed_jobs other
           WHERE other.job_hash = $9 AND other.id <> feed_jobs.id
        )`,
    [...fields, sourceId, job.externalId],
  );
  if (!updated.rowCount) {
    await pool.query(`UPDATE feed_jobs SET last_seen_at = now() WHERE job_hash = $1`, [hash]);
  }
  return false;
}

async function fetchOne(
  pool: pg.Pool,
  adapter: SourceAdapter | undefined,
  source: SourceRow,
  http: FeedHttp,
): Promise<number> {
  if (!adapter) throw new Error(`We cannot read sources of kind "${source.kind}" yet.`);
  const jobs = await adapter.fetchJobs(source.config, http);
  let added = 0;
  for (const job of jobs) {
    if (await saveJob(pool, source.id, job)) added += 1;
  }
  return added;
}

/**
 * Fetches each source that is due, one by one. A source that fails is marked as failed and
 * the others still run, so one broken board never stops the feed.
 */
export async function fetchSources(
  pool: pg.Pool,
  adapters: readonly SourceAdapter[],
  http: FeedHttp,
  report: ReportProblem = () => undefined,
  { minGapMinutes = 25, pauseMs = 1000 }: FetchOptions = {},
): Promise<{ ok: number; failed: number; added: number }> {
  const { rows: sources } = await pool.query<SourceRow>(
    `SELECT id, name, kind, config FROM feed_sources
      WHERE enabled AND (last_run_at IS NULL OR last_run_at < now() - $1 * interval '1 minute')
      ORDER BY name`,
    [minGapMinutes],
  );

  const result = { ok: 0, failed: 0, added: 0 };
  for (const [index, source] of sources.entries()) {
    if (index > 0 && pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    const adapter = adapters.find(({ kind }) => kind === source.kind);
    try {
      result.added += await fetchOne(pool, adapter, source, http);
      result.ok += 1;
      await pool.query(
        `UPDATE feed_sources SET last_run_at = now(), last_status = 'ok', last_error = NULL
          WHERE id = $1`,
        [source.id],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown problem';
      result.failed += 1;
      report({ source: source.name, error: message });
      await pool.query(
        `UPDATE feed_sources SET last_run_at = now(), last_status = 'failed', last_error = $2
          WHERE id = $1`,
        [source.id, message],
      );
    }
  }
  return result;
}
