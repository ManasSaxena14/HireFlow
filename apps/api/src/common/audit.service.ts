import { Injectable } from '@nestjs/common';
import { Database, type Executor } from '../database/database.js';
import type { NewAuditLog } from '../database/schema.js';

@Injectable()
export class AuditService {
  constructor(private readonly db: Database) {}

  /** Pass the open transaction so the entry commits or rolls back with the change it records. */
  async record(entry: NewAuditLog, executor: Executor = this.db): Promise<void> {
    await executor
      .insertInto('auditLogs')
      .values({ ...entry, diff: entry.diff ? JSON.stringify(entry.diff) : null })
      .execute();
  }
}
