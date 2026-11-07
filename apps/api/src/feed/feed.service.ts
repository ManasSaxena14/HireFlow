import { Injectable } from '@nestjs/common';
import type { FeedJob, FeedJobDetail, ListFeedJobs, Page } from '@hireflow/shared';
import { sql } from 'kysely';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { notFound } from '../common/domain-error.js';
import { Database } from '../database/database.js';
import { TrackerService } from '../tracker/tracker.service.js';

const SUMMARY_LENGTH = 240;

const sortTime = sql`coalesce(j.posted_at, j.created_at)`;

@Injectable()
export class FeedService {
  constructor(
    private readonly db: Database,
    private readonly tracker: TrackerService,
  ) {}

  /** Jobs not seen at their source for a week have most likely closed, so we hide them. */
  private visibleJobs(userId: string) {
    return this.db
      .selectFrom('feedJobs as j')
      .innerJoin('feedSources as s', 's.id', 'j.sourceId')
      .leftJoin('trackedApplications as t', (join) =>
        join.onRef('t.jobHash', '=', 'j.jobHash').on('t.userId', '=', userId),
      )
      .select([
        'j.id',
        'j.title',
        'j.companyName',
        'j.location',
        'j.remote',
        'j.url',
        'j.skills',
        'j.postedAt',
        'j.createdAt',
        's.name as sourceName',
        't.id as savedApplicationId',
      ])
      .select(sql<string | null>`left(j.description, ${SUMMARY_LENGTH})`.as('summary'))
      .where('s.enabled', '=', true)
      .where(sql<boolean>`j.last_seen_at > now() - interval '7 days'`);
  }

  async list(userId: string, query: ListFeedJobs): Promise<Page<FeedJob>> {
    let builder = this.visibleJobs(userId).select(sql<string>`${sortTime}::text`.as('cursorAt'));
    if (query.q) {
      builder = builder.where(
        sql<boolean>`j.search @@ websearch_to_tsquery('english', ${query.q})`,
      );
    }
    if (query.location) {
      const pattern = `%${query.location.replace(/[\\%_]/g, '\\$&')}%`;
      builder = builder.where('j.location', 'ilike', pattern);
    }
    if (query.remote) builder = builder.where('j.remote', '=', true);
    if (query.cursor) {
      const { at, id } = decodeCursor(query.cursor);
      builder = builder.where(
        sql<boolean>`(${sortTime}, j.id) < (${at}::timestamptz, ${id}::uuid)`,
      );
    }

    const rows = await builder
      .orderBy(sql`${sortTime} desc`)
      .orderBy('j.id', 'desc')
      .limit(query.limit + 1)
      .execute();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(({ cursorAt: _cursorAt, ...row }) => row) as unknown as FeedJob[],
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ at: last.cursorAt, id: last.id }) : null,
    };
  }

  async get(userId: string, id: string): Promise<FeedJobDetail> {
    const row = await this.visibleJobs(userId)
      .select('j.description')
      .where('j.id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('Job');
    return row as unknown as FeedJobDetail;
  }

  /** The same rules as adding a job by hand, so a job already on the board gives DUPLICATE_JOB. */
  async save(userId: string, id: string) {
    const job = await this.get(userId, id);
    return this.tracker.create(userId, {
      title: job.title,
      companyName: job.companyName,
      jobUrl: job.url,
      location: job.location,
      source: job.sourceName,
      skills: job.skills,
      description: job.description,
      status: 'saved',
    });
  }
}
