import { Injectable } from '@nestjs/common';
import {
  type AnalyticsQuery,
  type AnalyticsRange,
  FUNNEL_STEPS,
  type FunnelReport,
  type SourcesReport,
  type TimeToHireReport,
} from '@hireflow/shared';
import { DateTime } from 'luxon';
import { sql } from 'kysely';
import { Database } from '../database/database.js';

const DEFAULT_DAYS = 90;
const roundDays = (value: number | string | null) =>
  value === null ? null : Math.round(Number(value) * 10) / 10;

/**
 * Hiring numbers for one company. Every query filters on the company id that the tenant guard
 * checked, never one from the request body. Dates are whole UTC days, both ends included.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly db: Database) {}

  private range(query: AnalyticsQuery): AnalyticsRange {
    const to = query.to ?? (DateTime.utc().toISODate() as string);
    const from =
      query.from ??
      (DateTime.fromISO(to)
        .minus({ days: DEFAULT_DAYS - 1 })
        .toISODate() as string);
    return { from, to };
  }

  private within(column: string, range: AnalyticsRange) {
    return sql<boolean>`${sql.ref(column)} >= ${range.from}::date
      AND ${sql.ref(column)} < ${range.to}::date + 1`;
  }

  /** Counts people by the furthest step they reached, so a person rejected after an interview still counts as interviewed. */
  async funnel(companyId: string, query: AnalyticsQuery): Promise<FunnelReport> {
    const range = this.range(query);
    const steps = sql.raw(
      `ARRAY[${FUNNEL_STEPS.map((step) => `'${step}'`).join(',')}]::stage_kind[]`,
    );
    const { rows } = await sql<{ level: number | null; rejected: boolean; count: number }>`
      WITH reached AS (
        SELECT a.id,
               max(array_position(${steps}, s.kind)) AS level,
               bool_or(cur.kind = 'rejected') AS rejected
          FROM applications a
          JOIN pipeline_stages cur ON cur.id = a.stage_id
          LEFT JOIN application_stage_events e ON e.application_id = a.id
          LEFT JOIN pipeline_stages s ON s.id = coalesce(e.to_stage_id, a.stage_id)
         WHERE a.company_id = ${companyId}
           AND ${this.within('a.applied_at', range)}
           ${query.jobId ? sql`AND a.job_id = ${query.jobId}` : sql``}
         GROUP BY a.id
      )
      SELECT coalesce(level, 1) AS level, rejected, count(*)::int AS count
        FROM reached GROUP BY 1, 2`.execute(this.db);

    const atLeast = (step: number) =>
      rows.filter((row) => (row.level ?? 1) >= step).reduce((sum, row) => sum + row.count, 0);
    return {
      range,
      total: rows.reduce((sum, row) => sum + row.count, 0),
      steps: FUNNEL_STEPS.map((step, index) => ({ step, count: atLeast(index + 1) })),
      rejected: rows.filter((row) => row.rejected).reduce((sum, row) => sum + row.count, 0),
    };
  }

  /** From applying to being moved to a hired step, for people hired in the date range. */
  async timeToHire(companyId: string, query: AnalyticsQuery): Promise<TimeToHireReport> {
    const range = this.range(query);
    const hired = this.db
      .selectFrom('applications as a')
      .innerJoin('pipelineStages as s', 's.id', 'a.stageId')
      .innerJoin('jobs as j', 'j.id', 'a.jobId')
      .where('a.companyId', '=', companyId)
      .where('s.kind', '=', 'hired')
      .where('a.decidedAt', 'is not', null)
      .where(this.within('a.decided_at', range))
      .$if(Boolean(query.jobId), (builder) => builder.where('a.jobId', '=', query.jobId as string));
    const days = sql<number>`extract(epoch FROM a.decided_at - a.applied_at) / 86400`;

    const totals = await hired
      .select(sql<number>`count(*)::int`.as('hires'))
      .select(sql<string | null>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${days})`.as('median'))
      .select(sql<string | null>`avg(${days})`.as('average'))
      .select(sql<string | null>`min(${days})`.as('fastest'))
      .select(sql<string | null>`max(${days})`.as('slowest'))
      .executeTakeFirstOrThrow();
    const byJob = await hired
      .select(['j.id as jobId', 'j.title'])
      .select(sql<number>`count(*)::int`.as('hires'))
      .select(sql<string>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${days})`.as('median'))
      .groupBy(['j.id', 'j.title'])
      .orderBy(sql`count(*)`, 'desc')
      .orderBy('j.title')
      .execute();

    return {
      range,
      hires: totals.hires,
      medianDays: roundDays(totals.median),
      averageDays: roundDays(totals.average),
      fastestDays: roundDays(totals.fastest),
      slowestDays: roundDays(totals.slowest),
      byJob: byJob.map(({ median, ...row }) => ({ ...row, medianDays: roundDays(median) ?? 0 })),
    };
  }

  /** Where people heard about the job, as they told us when applying. */
  async sources(companyId: string, query: AnalyticsQuery): Promise<SourcesReport> {
    const range = this.range(query);
    const source = sql<string>`coalesce(nullif(trim(c.source), ''), 'Not given')`;
    const rows = await this.db
      .selectFrom('applications as a')
      .innerJoin('candidates as c', 'c.id', 'a.candidateId')
      .innerJoin('pipelineStages as s', 's.id', 'a.stageId')
      .select(source.as('source'))
      .select(sql<number>`count(*)::int`.as('applications'))
      .select(sql<number>`count(*) FILTER (WHERE s.kind = 'hired')::int`.as('hires'))
      .where('a.companyId', '=', companyId)
      .where(this.within('a.applied_at', range))
      .$if(Boolean(query.jobId), (builder) => builder.where('a.jobId', '=', query.jobId as string))
      .groupBy(source)
      .orderBy(sql`count(*)`, 'desc')
      .orderBy(source)
      .execute();
    return { range, sources: rows };
  }
}
