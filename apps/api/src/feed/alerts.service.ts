import { Injectable } from '@nestjs/common';
import {
  type CreateAlert,
  type JobAlert,
  MAX_ALERTS_PER_USER,
  type UpdateAlert,
} from '@hireflow/shared';
import { sql } from 'kysely';
import { DomainError, notFound } from '../common/domain-error.js';
import { Database } from '../database/database.js';

const COLUMNS = [
  'id',
  'name',
  'keywords',
  'locations',
  'remoteOnly',
  'frequency',
  'active',
  'lastSentAt',
  'createdAt',
] as const;

@Injectable()
export class AlertsService {
  constructor(private readonly db: Database) {}

  async list(userId: string): Promise<JobAlert[]> {
    const rows = await this.db
      .selectFrom('jobAlerts')
      .select(COLUMNS)
      .select((eb) =>
        eb
          .selectFrom('alertDeliveries')
          .select(sql<number>`count(*)::int`.as('count'))
          .whereRef('alertDeliveries.alertId', '=', 'jobAlerts.id')
          .where('alertDeliveries.deliveredAt', 'is not', null)
          .as('sentCount'),
      )
      .where('userId', '=', userId)
      .orderBy('createdAt', 'desc')
      .execute();
    return rows as unknown as JobAlert[];
  }

  async create(userId: string, input: CreateAlert) {
    return this.db.transaction().execute(async (tx) => {
      // Holding the person's row means two requests at once cannot both pass the limit.
      await tx.selectFrom('users').select('id').where('id', '=', userId).forUpdate().execute();
      const { count } = await tx
        .selectFrom('jobAlerts')
        .select(sql<number>`count(*)::int`.as('count'))
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow();
      if (count >= MAX_ALERTS_PER_USER) {
        throw new DomainError(
          'CONFLICT',
          `You can keep up to ${MAX_ALERTS_PER_USER} alerts. Delete one to add another.`,
        );
      }
      const row = await tx
        .insertInto('jobAlerts')
        .values({ userId, ...input })
        .returning(COLUMNS)
        .executeTakeFirstOrThrow();
      return { ...row, sentCount: 0 };
    });
  }

  async update(userId: string, id: string, input: UpdateAlert) {
    return this.db.transaction().execute(async (tx) => {
      const row = await tx
        .updateTable('jobAlerts')
        .set(input)
        .where('id', '=', id)
        .where('userId', '=', userId)
        .returning(COLUMNS)
        .executeTakeFirst();
      if (!row) throw notFound('Alert');

      // Waiting jobs were found with the old search, or the person has asked for a break.
      const startsOver =
        input.active === false ||
        input.keywords !== undefined ||
        input.locations !== undefined ||
        input.remoteOnly !== undefined;
      if (startsOver) {
        await tx
          .deleteFrom('alertDeliveries')
          .where('alertId', '=', id)
          .where('deliveredAt', 'is', null)
          .execute();
      }
      return row;
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.db
      .deleteFrom('jobAlerts')
      .where('id', '=', id)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) throw notFound('Alert');
  }
}
