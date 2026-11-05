import { Injectable } from '@nestjs/common';
import {
  type CreateApplication,
  type CreateNote,
  type CreateReminder,
  type ListApplications,
  type MoveApplication,
  type Page,
  TRACKER_STATUSES,
  type TrackerStats,
  type TrackerStatus,
  type UpdateApplication,
} from '@hireflow/shared';
import { type Selectable, sql } from 'kysely';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { DomainError, notFound } from '../common/domain-error.js';
import { ConfigService } from '../config/config.service.js';
import { Database, type Executor, isUniqueViolation, type Tx } from '../database/database.js';
import type { TrackedApplicationsTable } from '../database/schema.js';
import { jobHash } from './job-hash.js';

type Row = Selectable<TrackedApplicationsTable>;

const JOB_HASH_CONSTRAINT = 'tracked_applications_user_id_job_hash_key';
const DAY_MS = 24 * 60 * 60 * 1000;
const STATS_WEEKS = 8;

/** After one of these, there is no need for a follow-up reminder. */
const CANCELS_FOLLOW_UP: readonly TrackerStatus[] = ['rejected', 'withdrawn', 'offer'];

const FUNNEL_STAGES = ['applied', 'screening', 'interview', 'offer'] as const;
const RESPONSE_STATUSES: readonly TrackerStatus[] = ['screening', 'interview', 'offer', 'rejected'];

const present = ({ jobHash: _hash, userId: _user, resumeId: _resume, ...row }: Row) => row;

@Injectable()
export class TrackerService {
  constructor(
    private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  async list(userId: string, query: ListApplications): Promise<Page<ReturnType<typeof present>>> {
    let builder = this.db
      .selectFrom('trackedApplications')
      .selectAll()
      .select(sql<string>`created_at::text`.as('cursorAt'))
      .where('userId', '=', userId)
      .where('archivedAt', query.archived ? 'is not' : 'is', null);

    if (query.status) builder = builder.where('status', '=', query.status);
    if (query.tag) builder = builder.where(sql<boolean>`${query.tag} = ANY(tags)`);
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
      builder = builder.where((eb) =>
        eb.or([eb('title', 'ilike', pattern), eb('companyName', 'ilike', pattern)]),
      );
    }
    if (query.cursor) {
      const { at, id } = decodeCursor(query.cursor);
      builder = builder.where(sql<boolean>`(created_at, id) < (${at}::timestamptz, ${id}::uuid)`);
    }

    const rows = await builder
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(query.limit + 1)
      .execute();

    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(({ cursorAt: _cursorAt, ...row }) => present(row)),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ at: last.cursorAt, id: last.id }) : null,
    };
  }

  async create(userId: string, input: CreateApplication) {
    const status = input.status ?? 'saved';
    const hash = jobHash(input.title, input.companyName, input.location);
    try {
      return await this.db.transaction().execute(async (tx) => {
        const row = await tx
          .insertInto('trackedApplications')
          .values({
            userId,
            title: input.title,
            companyName: input.companyName,
            jobUrl: input.jobUrl ?? null,
            location: input.location ?? null,
            source: input.source ?? null,
            salaryMin: input.salaryMin ?? null,
            salaryMax: input.salaryMax ?? null,
            currency: input.currency ?? null,
            status,
            appliedAt: status === 'applied' ? new Date() : null,
            skills: input.skills ?? [],
            description: input.description ?? null,
            tags: input.tags ?? [],
            jobHash: hash,
            resumeId: null,
            archivedAt: null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        await this.writeEvent(tx, row.id, null, status, null);
        if (status === 'applied') await this.scheduleFollowUp(tx, row);
        return present(row);
      });
    } catch (error) {
      if (isUniqueViolation(error, JOB_HASH_CONSTRAINT)) throw await this.duplicate(userId, hash);
      throw error;
    }
  }

  async get(userId: string, id: string) {
    const row = await this.findOwned(this.db, userId, id);
    const reminders = await this.db
      .selectFrom('reminders')
      .select(['id', 'kind', 'remindAt', 'message', 'sentAt'])
      .where('trackedApplicationId', '=', id)
      .where('userId', '=', userId)
      .orderBy('remindAt')
      .execute();
    return { ...present(row), reminders };
  }

  async update(userId: string, id: string, input: UpdateApplication) {
    const { archived, ...fields } = input;
    let hash = '';
    try {
      const row = await this.db.transaction().execute(async (tx) => {
        const current = await this.findOwned(tx, userId, id, { lock: true });
        hash = jobHash(
          fields.title ?? current.title,
          fields.companyName ?? current.companyName,
          fields.location === undefined ? current.location : fields.location,
        );
        const updated = await tx
          .updateTable('trackedApplications')
          .set({
            ...fields,
            jobHash: hash,
            ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
          })
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow();
        if (archived) await this.cancelPendingReminders(tx, id);
        return updated;
      });
      return present(row);
    } catch (error) {
      if (isUniqueViolation(error, JOB_HASH_CONSTRAINT)) throw await this.duplicate(userId, hash);
      throw error;
    }
  }

  /** Every status change is saved to history. Moving to the same status does nothing. */
  async move(userId: string, id: string, input: MoveApplication) {
    return this.db.transaction().execute(async (tx) => {
      const current = await this.findOwned(tx, userId, id, { lock: true });
      if (current.status === input.toStatus) return present(current);

      const firstApply = input.toStatus === 'applied' && current.appliedAt === null;
      const row = await tx
        .updateTable('trackedApplications')
        .set({
          status: input.toStatus,
          ...(firstApply ? { appliedAt: new Date() } : {}),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await this.writeEvent(tx, id, current.status, input.toStatus, input.note ?? null);
      if (firstApply) await this.scheduleFollowUp(tx, row);
      if (CANCELS_FOLLOW_UP.includes(input.toStatus)) {
        await tx
          .deleteFrom('reminders')
          .where('trackedApplicationId', '=', id)
          .where('kind', '=', 'follow_up')
          .where('sentAt', 'is', null)
          .execute();
      }
      return present(row);
    });
  }

  async archive(userId: string, id: string): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await this.findOwned(tx, userId, id, { lock: true });
      await tx
        .updateTable('trackedApplications')
        .set({ archivedAt: new Date() })
        .where('id', '=', id)
        .execute();
      await this.cancelPendingReminders(tx, id);
    });
  }

  async addNote(userId: string, id: string, input: CreateNote) {
    await this.findOwned(this.db, userId, id);
    return this.db
      .insertInto('applicationNotes')
      .values({ trackedApplicationId: id, body: input.body })
      .returning(['id', 'body', 'createdAt'])
      .executeTakeFirstOrThrow();
  }

  async listNotes(userId: string, id: string) {
    await this.findOwned(this.db, userId, id);
    return this.db
      .selectFrom('applicationNotes')
      .select(['id', 'body', 'createdAt'])
      .where('trackedApplicationId', '=', id)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async listEvents(userId: string, id: string) {
    await this.findOwned(this.db, userId, id);
    return this.db
      .selectFrom('applicationEvents')
      .select(['id', 'fromStatus', 'toStatus', 'note', 'createdAt'])
      .where('trackedApplicationId', '=', id)
      .orderBy('createdAt')
      .execute();
  }

  async addReminder(userId: string, id: string, input: CreateReminder) {
    await this.findOwned(this.db, userId, id);
    return this.db
      .insertInto('reminders')
      .values({
        userId,
        trackedApplicationId: id,
        interviewId: null,
        kind: 'custom',
        remindAt: new Date(input.remindAt),
        message: input.message,
        sentAt: null,
      })
      .returning(['id', 'kind', 'remindAt', 'message', 'sentAt'])
      .executeTakeFirstOrThrow();
  }

  async stats(userId: string): Promise<TrackerStats> {
    const statusCounts = await this.db
      .selectFrom('trackedApplications')
      .select(['status', (eb) => eb.fn.countAll<string>().as('count')])
      .where('userId', '=', userId)
      .where('archivedAt', 'is', null)
      .groupBy('status')
      .execute();

    const byStatus = Object.fromEntries(TRACKER_STATUSES.map((s) => [s, 0])) as Record<
      TrackerStatus,
      number
    >;
    for (const { status, count } of statusCounts) byStatus[status] = Number(count);

    const reached = await this.db
      .selectFrom('applicationEvents')
      .innerJoin(
        'trackedApplications',
        'trackedApplications.id',
        'applicationEvents.trackedApplicationId',
      )
      .select(['applicationEvents.trackedApplicationId as id', 'applicationEvents.toStatus'])
      .where('trackedApplications.userId', '=', userId)
      .where('trackedApplications.archivedAt', 'is', null)
      .execute();

    return {
      byStatus,
      perWeek: await this.appliedPerWeek(userId),
      ...this.summarizeFunnel(reached),
    };
  }

  private async appliedPerWeek(userId: string) {
    const rows = await this.db
      .selectFrom('trackedApplications')
      .select([
        sql<string>`to_char(date_trunc('week', applied_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`.as(
          'weekStart',
        ),
        (eb) => eb.fn.countAll<string>().as('count'),
      ])
      .where('userId', '=', userId)
      .where('archivedAt', 'is', null)
      .where('appliedAt', 'is not', null)
      .where('appliedAt', '>=', new Date(Date.now() - (STATS_WEEKS + 1) * 7 * DAY_MS))
      .groupBy('weekStart')
      .execute();
    const counts = new Map(rows.map((row) => [row.weekStart, Number(row.count)]));

    const monday = new Date();
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));

    return Array.from({ length: STATS_WEEKS }, (_, index) => {
      const week = new Date(monday.getTime() - (STATS_WEEKS - 1 - index) * 7 * DAY_MS);
      const weekStart = week.toISOString().slice(0, 10);
      return { weekStart, count: counts.get(weekStart) ?? 0 };
    });
  }

  /**
   * A card that jumped to a later step still counts for the steps before it.
   * So each job counts for every step up to the furthest one it reached.
   */
  private summarizeFunnel(events: { id: string; toStatus: TrackerStatus }[]) {
    const furthest = new Map<string, number>();
    const responded = new Set<string>();
    for (const { id, toStatus } of events) {
      const rank = FUNNEL_STAGES.indexOf(toStatus as (typeof FUNNEL_STAGES)[number]);
      furthest.set(id, Math.max(furthest.get(id) ?? -1, rank));
      if (RESPONSE_STATUSES.includes(toStatus)) responded.add(id);
    }

    const funnel = { applied: 0, screening: 0, interview: 0, offer: 0 };
    for (const rank of furthest.values()) {
      FUNNEL_STAGES.forEach((stage, index) => {
        if (rank >= index) funnel[stage] += 1;
      });
    }
    const responseRate =
      funnel.applied === 0 ? null : Math.round((responded.size / funnel.applied) * 1000) / 1000;
    return { funnel, responseRate };
  }

  private async findOwned(
    executor: Executor,
    userId: string,
    id: string,
    options: { lock?: boolean } = {},
  ): Promise<Row> {
    let query = executor
      .selectFrom('trackedApplications')
      .selectAll()
      .where('id', '=', id)
      .where('userId', '=', userId);
    if (options.lock) query = query.forUpdate();
    const row = await query.executeTakeFirst();
    if (!row) throw notFound('Application');
    return row;
  }

  private writeEvent(
    tx: Tx,
    id: string,
    fromStatus: TrackerStatus | null,
    toStatus: TrackerStatus,
    note: string | null,
  ) {
    return tx
      .insertInto('applicationEvents')
      .values({ trackedApplicationId: id, fromStatus, toStatus, note })
      .execute();
  }

  private scheduleFollowUp(tx: Tx, row: Row) {
    const days = this.config.env.FOLLOW_UP_DAYS;
    return tx
      .insertInto('reminders')
      .values({
        userId: row.userId,
        trackedApplicationId: row.id,
        interviewId: null,
        kind: 'follow_up',
        remindAt: new Date(Date.now() + days * DAY_MS),
        message: `Time to follow up on ${row.title} at ${row.companyName}.`,
        sentAt: null,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  private cancelPendingReminders(tx: Tx, id: string) {
    return tx
      .deleteFrom('reminders')
      .where('trackedApplicationId', '=', id)
      .where('sentAt', 'is', null)
      .execute();
  }

  private async duplicate(userId: string, hash: string): Promise<DomainError> {
    const existing = await this.db
      .selectFrom('trackedApplications')
      .select('id')
      .where('userId', '=', userId)
      .where('jobHash', '=', hash)
      .executeTakeFirst();
    return new DomainError('DUPLICATE_JOB', 'This job is already on your board.', [
      { existingId: existing?.id ?? null },
    ]);
  }
}
