import { Injectable } from '@nestjs/common';
import type { Availability, PutAvailability } from '@hireflow/shared';
import { sql } from 'kysely';
import { DomainError } from '../common/domain-error.js';
import { Database, type Executor } from '../database/database.js';

/** A person sets their own hours for each company they belong to. */
@Injectable()
export class AvailabilityService {
  constructor(private readonly db: Database) {}

  private async assertMember(companyId: string, userId: string, executor: Executor = this.db) {
    const membership = await executor
      .selectFrom('memberships')
      .select('id')
      .where('companyId', '=', companyId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!membership) throw new DomainError('FORBIDDEN', 'You are not part of this company.');
  }

  async get(companyId: string, userId: string): Promise<Availability> {
    await this.assertMember(companyId, userId);
    const [rules, blocks, user] = await Promise.all([
      this.db
        .selectFrom('availabilityRules')
        .select(['id', 'weekday', 'timezone'])
        .select([
          sql<string>`to_char(start_time, 'HH24:MI')`.as('startTime'),
          sql<string>`to_char(end_time, 'HH24:MI')`.as('endTime'),
          sql<string | null>`valid_from::text`.as('validFrom'),
          sql<string | null>`valid_to::text`.as('validTo'),
        ])
        .where('companyId', '=', companyId)
        .where('userId', '=', userId)
        .orderBy('weekday')
        .orderBy('startTime')
        .execute(),
      this.db
        .selectFrom('availabilityBlocks')
        .select(['id', 'reason'])
        .select([sql<Date>`lower(during)`.as('startsAt'), sql<Date>`upper(during)`.as('endsAt')])
        .where('companyId', '=', companyId)
        .where('userId', '=', userId)
        .where(sql<boolean>`upper(during) > now()`)
        .orderBy(sql`lower(during)`)
        .execute(),
      this.db
        .selectFrom('users')
        .select('timezone')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow(),
    ]);
    return {
      timezone: rules[0]?.timezone ?? user.timezone,
      rules: rules.map(({ timezone: _zone, ...rule }) => rule),
      blocks: blocks.map((block) => ({
        id: block.id,
        start: block.startsAt.toISOString(),
        end: block.endsAt.toISOString(),
        reason: block.reason,
      })),
    };
  }

  /** Saves the whole list at once, so a half-saved week can never be used for booking. */
  async replace(companyId: string, userId: string, body: PutAvailability): Promise<Availability> {
    await this.db.transaction().execute(async (tx) => {
      await this.assertMember(companyId, userId, tx);
      await tx
        .deleteFrom('availabilityRules')
        .where('companyId', '=', companyId)
        .where('userId', '=', userId)
        .execute();
      await tx
        .deleteFrom('availabilityBlocks')
        .where('companyId', '=', companyId)
        .where('userId', '=', userId)
        .execute();
      if (body.rules.length > 0) {
        await tx
          .insertInto('availabilityRules')
          .values(
            body.rules.map((rule) => ({
              companyId,
              userId,
              timezone: body.timezone,
              weekday: rule.weekday,
              startTime: rule.startTime,
              endTime: rule.endTime,
              validFrom: rule.validFrom,
              validTo: rule.validTo,
            })),
          )
          .execute();
      }
      if (body.blocks.length > 0) {
        await tx
          .insertInto('availabilityBlocks')
          .values(
            body.blocks.map((block) => ({
              companyId,
              userId,
              reason: block.reason,
              during: sql<string>`tstzrange(${block.start}::timestamptz, ${block.end}::timestamptz, '[)')`,
            })),
          )
          .execute();
      }
    });
    return this.get(companyId, userId);
  }
}
