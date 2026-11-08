import { Injectable } from '@nestjs/common';
import {
  type CreatePracticeSession,
  type Page,
  type PracticeSession,
  PRACTICE_KINDS,
  PRACTICE_OUTCOMES,
  type PrepStats,
  type ReviewItem,
  sm2,
} from '@hireflow/shared';
import { DateTime } from 'luxon';
import { sql } from 'kysely';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { notFound } from '../common/domain-error.js';
import { Database, type Executor } from '../database/database.js';

const SESSION_COLUMNS = [
  'id',
  'topic',
  'kind',
  'difficulty',
  'durationMin',
  'outcome',
  'notes',
  'createdAt',
] as const;
const TOP_TOPICS = 8;
const STREAK_DAYS = 1000;

/** The longest run of days in a row, and the run that is still going. Days are newest first. */
export function streaks(days: string[], today: string) {
  let best = 0;
  let run = 0;
  let previous: DateTime | null = null;
  for (const day of days) {
    const date = DateTime.fromISO(day);
    run = previous && previous.minus({ days: 1 }).hasSame(date, 'day') ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  let current = 0;
  const start = DateTime.fromISO(today);
  // A streak is still going if the last day practised is today or yesterday.
  let expected = days[0] === today ? start : start.minus({ days: 1 });
  for (const day of days) {
    if (day !== expected.toISODate()) break;
    current += 1;
    expected = expected.minus({ days: 1 });
  }
  return { current, best, practisedToday: days[0] === today };
}

@Injectable()
export class PrepService {
  constructor(private readonly db: Database) {}

  private async timezone(userId: string): Promise<string> {
    const user = await this.db
      .selectFrom('users')
      .select('timezone')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    return user.timezone;
  }

  private today = (timezone: string) => DateTime.now().setZone(timezone).toISODate() as string;

  /** Logging a topic for the first time also adds it to the review list, due tomorrow. */
  async logSession(userId: string, input: CreatePracticeSession) {
    const tomorrow = DateTime.fromISO(this.today(await this.timezone(userId)))
      .plus({ days: 1 })
      .toISODate() as string;
    return this.db.transaction().execute(async (tx) => {
      const session = await tx
        .insertInto('practiceSessions')
        .values({
          userId,
          topic: input.topic,
          kind: input.kind,
          difficulty: input.difficulty ?? null,
          durationMin: input.durationMin ?? null,
          outcome: input.outcome ?? null,
          notes: input.notes ?? null,
        })
        .returning(SESSION_COLUMNS)
        .executeTakeFirstOrThrow();
      const { rows } = await sql<{ id: string }>`
        INSERT INTO review_items (user_id, topic, due_on) VALUES (${userId}, ${input.topic}, ${tomorrow})
        ON CONFLICT (user_id, lower(topic)) DO NOTHING
        RETURNING id`.execute(tx);
      return { ...session, reviewAdded: rows.length > 0 };
    });
  }

  async listSessions(
    userId: string,
    limit: number,
    cursor: string | undefined,
  ): Promise<Page<PracticeSession>> {
    let builder = this.db
      .selectFrom('practiceSessions')
      .select(SESSION_COLUMNS)
      .select(sql<string>`created_at::text`.as('cursorAt'))
      .where('userId', '=', userId);
    if (cursor) {
      const { at, id } = decodeCursor(cursor);
      builder = builder.where(sql<boolean>`(created_at, id) < (${at}::timestamptz, ${id}::uuid)`);
    }
    const rows = await builder
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .execute();
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(({ cursorAt: _cursorAt, ...row }) => row) as unknown as PracticeSession[],
      nextCursor:
        rows.length > limit && last ? encodeCursor({ at: last.cursorAt, id: last.id }) : null,
    };
  }

  async removeSession(userId: string, id: string): Promise<void> {
    const result = await this.db
      .deleteFrom('practiceSessions')
      .where('id', '=', id)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) throw notFound('Practice session');
  }

  async stats(userId: string): Promise<PrepStats> {
    const timezone = await this.timezone(userId);
    const today = this.today(timezone);
    const local = sql`(created_at AT TIME ZONE ${timezone})::date`;

    const days = await this.db
      .selectFrom('practiceSessions')
      .select(sql<string>`${local}::text`.as('day'))
      .where('userId', '=', userId)
      // By position, because the same expression with a new parameter counts as a different one.
      .groupBy(sql`1`)
      .orderBy(sql`1`, 'desc')
      .limit(STREAK_DAYS)
      .execute();

    const recent = () =>
      this.db
        .selectFrom('practiceSessions')
        .where('userId', '=', userId)
        .where(sql<boolean>`${local} > ${today}::date - 30`);

    const byKind = await recent()
      .select(['kind'])
      .select(sql<number>`count(*)::int`.as('sessions'))
      .select(sql<number>`coalesce(sum(duration_min), 0)::int`.as('minutes'))
      .groupBy('kind')
      .execute();
    const outcomes = await recent()
      .select(['outcome'])
      .select(sql<number>`count(*)::int`.as('count'))
      .where('outcome', 'is not', null)
      .groupBy('outcome')
      .execute();
    const topTopics = await recent()
      .select(sql<string>`min(topic)`.as('topic'))
      .select(sql<number>`count(*)::int`.as('sessions'))
      .select(sql<number>`coalesce(sum(duration_min), 0)::int`.as('minutes'))
      .groupBy(sql`lower(topic)`)
      .orderBy(sql`count(*)`, 'desc')
      .orderBy(sql`lower(topic)`)
      .limit(TOP_TOPICS)
      .execute();
    const due = await this.db
      .selectFrom('reviewItems')
      .select(sql<number>`count(*)::int`.as('count'))
      .where('userId', '=', userId)
      .where(sql<boolean>`due_on <= ${today}::date`)
      .executeTakeFirstOrThrow();

    const kindRows = new Map(byKind.map((row) => [row.kind, row]));
    return {
      streak: streaks(
        days.map((row) => row.day),
        today,
      ),
      last30Days: {
        sessions: byKind.reduce((sum, row) => sum + row.sessions, 0),
        minutes: byKind.reduce((sum, row) => sum + row.minutes, 0),
        byKind: PRACTICE_KINDS.map((kind) => ({
          kind,
          sessions: kindRows.get(kind)?.sessions ?? 0,
          minutes: kindRows.get(kind)?.minutes ?? 0,
        })),
        outcomes: Object.fromEntries(
          PRACTICE_OUTCOMES.map((outcome) => [
            outcome,
            outcomes.find((row) => row.outcome === outcome)?.count ?? 0,
          ]),
        ) as PrepStats['last30Days']['outcomes'],
        topTopics,
      },
      reviewsDue: due.count,
    };
  }

  private reviewRows(userId: string, executor: Executor = this.db) {
    return executor
      .selectFrom('reviewItems')
      .select(['id', 'topic', 'intervalDays', 'repetitions', 'lastReviewedAt'])
      .select(sql<string>`ease_factor::float8`.as('easeFactor'))
      .select(sql<string>`due_on::text`.as('dueOn'))
      .where('userId', '=', userId);
  }

  /** All topics, the ones due first. `due` tells the screen which can be reviewed today. */
  async listReviews(userId: string, onlyDue: boolean): Promise<ReviewItem[]> {
    const today = this.today(await this.timezone(userId));
    let builder = this.reviewRows(userId);
    if (onlyDue) builder = builder.where(sql<boolean>`due_on <= ${today}::date`);
    const rows = await builder
      .orderBy('dueOn')
      .orderBy(sql`lower(topic)`)
      .execute();
    return rows as unknown as ReviewItem[];
  }

  async grade(userId: string, id: string, quality: number): Promise<ReviewItem> {
    const today = this.today(await this.timezone(userId));
    return this.db.transaction().execute(async (tx) => {
      // Locked, so two grades at once are applied one after the other.
      const item = await tx
        .selectFrom('reviewItems')
        .select(['easeFactor', 'intervalDays', 'repetitions'])
        .where('id', '=', id)
        .where('userId', '=', userId)
        .forUpdate()
        .executeTakeFirst();
      if (!item) throw notFound('Review');
      const next = sm2(
        {
          easeFactor: Number(item.easeFactor),
          intervalDays: item.intervalDays,
          repetitions: item.repetitions,
        },
        quality,
      );
      await tx
        .updateTable('reviewItems')
        .set({
          easeFactor: next.easeFactor,
          intervalDays: next.intervalDays,
          repetitions: next.repetitions,
          dueOn: DateTime.fromISO(today).plus({ days: next.intervalDays }).toISODate() as string,
          lastReviewedAt: new Date(),
        })
        .where('id', '=', id)
        .execute();
      const row = await this.reviewRows(userId, tx).where('id', '=', id).executeTakeFirstOrThrow();
      return row as unknown as ReviewItem;
    });
  }

  async removeReview(userId: string, id: string): Promise<void> {
    const result = await this.db
      .deleteFrom('reviewItems')
      .where('id', '=', id)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) throw notFound('Review');
  }
}
