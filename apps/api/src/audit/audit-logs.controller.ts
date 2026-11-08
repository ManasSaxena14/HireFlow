import { Controller, Get, Query } from '@nestjs/common';
import {
  type AuditLogEntry,
  type AuditLogQuery,
  auditLogQuerySchema,
  type Page,
} from '@hireflow/shared';
import { sql } from 'kysely';
import { type RequestTenant, Roles, Tenant } from '../common/access.js';
import { DomainError } from '../common/domain-error.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { Database } from '../database/database.js';

/** The ids here are numbers, so this page link is not the shared one, which expects a UUID. */
const encode = (at: string, id: string) =>
  Buffer.from(JSON.stringify({ at, id })).toString('base64url');
function decode(raw: string): { at: string; id: string } {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString()) as {
      at?: unknown;
      id?: unknown;
    };
    if (
      typeof value.at === 'string' &&
      typeof value.id === 'string' &&
      /^\d{1,19}$/.test(value.id) &&
      !Number.isNaN(Date.parse(value.at.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')))
    ) {
      return { at: value.at, id: value.id };
    }
  } catch {
    // A broken link gets the same error as the one below.
  }
  throw new DomainError('VALIDATION_ERROR', 'That page link is not valid.');
}

/** Read only. Nobody can change or delete these rows: a database trigger stops it. */
@Controller('companies/:cid/audit-logs')
@Roles('admin')
export class AuditLogsController {
  constructor(private readonly db: Database) {}

  @Get()
  async list(
    @Tenant() tenant: RequestTenant,
    @Query(new ZodPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<Page<AuditLogEntry>> {
    let builder = this.db
      .selectFrom('auditLogs as l')
      .leftJoin('users as u', 'u.id', 'l.actorId')
      .select(['l.id', 'l.action', 'l.entityType', 'l.entityId', 'l.diff', 'l.createdAt'])
      .select(sql<string | null>`host(l.ip)`.as('ip'))
      .select(['u.id as actorUserId', 'u.fullName as actorName', 'u.email as actorEmail'])
      .select(sql<string>`l.created_at::text`.as('cursorAt'))
      .select(sql<string>`l.id::text`.as('cursorId'))
      .where('l.companyId', '=', tenant.companyId);
    if (query.actorId) builder = builder.where('l.actorId', '=', query.actorId);
    if (query.entityType) builder = builder.where('l.entityType', '=', query.entityType);
    if (query.entityId) builder = builder.where('l.entityId', '=', query.entityId);
    if (query.from) builder = builder.where(sql<boolean>`l.created_at >= ${query.from}::date`);
    if (query.to) builder = builder.where(sql<boolean>`l.created_at < ${query.to}::date + 1`);
    if (query.cursor) {
      const { at, id } = decode(query.cursor);
      builder = builder.where(
        sql<boolean>`(l.created_at, l.id) < (${at}::timestamptz, ${id}::bigint)`,
      );
    }
    const rows = await builder
      .orderBy('l.createdAt', 'desc')
      .orderBy('l.id', 'desc')
      .limit(query.limit + 1)
      .execute();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(
        ({ actorUserId, actorName, actorEmail, cursorAt: _at, cursorId: _id, ...row }) => ({
          ...row,
          id: String(row.id),
          createdAt: row.createdAt.toISOString(),
          actor:
            actorUserId && actorName && actorEmail
              ? { id: actorUserId, fullName: actorName, email: actorEmail }
              : null,
        }),
      ),
      nextCursor: rows.length > query.limit && last ? encode(last.cursorAt, last.cursorId) : null,
    };
  }
}
