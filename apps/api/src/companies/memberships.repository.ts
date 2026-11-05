import { Injectable } from '@nestjs/common';
import type { MembershipRole } from '@hireflow/shared';
import { Database, type Executor } from '../database/database.js';

/** Every query takes companyId as a required argument, so it cannot cross tenants. */
@Injectable()
export class MembershipsRepository {
  constructor(private readonly db: Database) {}

  find(companyId: string, userId: string, executor: Executor = this.db) {
    return executor
      .selectFrom('memberships')
      .selectAll()
      .where('companyId', '=', companyId)
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  async add(companyId: string, userId: string, role: MembershipRole, executor: Executor = this.db) {
    return executor
      .insertInto('memberships')
      .values({ companyId, userId, role })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updateRole(companyId: string, userId: string, role: MembershipRole, executor: Executor) {
    return executor
      .updateTable('memberships')
      .set({ role })
      .where('companyId', '=', companyId)
      .where('userId', '=', userId)
      .returningAll()
      .executeTakeFirst();
  }

  remove(companyId: string, userId: string, executor: Executor) {
    return executor
      .deleteFrom('memberships')
      .where('companyId', '=', companyId)
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  /** Locks the admin rows so two concurrent demotions cannot remove the last admin. */
  async lockAdmins(companyId: string, executor: Executor): Promise<string[]> {
    const rows = await executor
      .selectFrom('memberships')
      .select('userId')
      .where('companyId', '=', companyId)
      .where('role', '=', 'admin')
      .forUpdate()
      .execute();
    return rows.map((row) => row.userId);
  }
}
