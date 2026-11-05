import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { paginationSchema } from '@hireflow/shared';
import { sql } from 'kysely';
import type { z } from 'zod';
import { Authenticated, CurrentUser, type RequestUser } from '../common/access.js';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { notFound } from '../common/domain-error.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { Database } from '../database/database.js';

@Controller('notifications')
@Authenticated()
export class NotificationsController {
  constructor(private readonly db: Database) {}

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(paginationSchema)) query: z.output<typeof paginationSchema>,
  ) {
    let builder = this.db
      .selectFrom('notifications')
      .select(['id', 'type', 'payload', 'readAt', 'createdAt'])
      .select(sql<string>`created_at::text`.as('cursorAt'))
      .where('userId', '=', user.id);
    if (query.cursor) {
      const { at, id } = decodeCursor(query.cursor);
      builder = builder.where(sql<boolean>`(created_at, id) < (${at}::timestamptz, ${id}::uuid)`);
    }
    const rows = await builder
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(query.limit + 1)
      .execute();

    const { count } = await this.db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('userId', '=', user.id)
      .where('readAt', 'is', null)
      .executeTakeFirstOrThrow();

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(({ cursorAt: _cursorAt, ...row }) => row),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ at: last.cursorAt, id: last.id }) : null,
      unreadCount: Number(count),
    };
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: RequestUser) {
    await this.db
      .updateTable('notifications')
      .set({ readAt: new Date() })
      .where('userId', '=', user.id)
      .where('readAt', 'is', null)
      .execute();
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.db
      .updateTable('notifications')
      .set((eb) => ({ readAt: eb.fn.coalesce('readAt', sql<Date>`now()`) }))
      .where('id', '=', id)
      .where('userId', '=', user.id)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw notFound('Notification');
  }
}
