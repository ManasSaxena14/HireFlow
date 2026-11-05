import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'kysely';
import { Public } from '../common/access.js';
import { Database } from '../database/database.js';

@Controller()
@Public()
@SkipThrottle({ user: true })
export class HealthController {
  constructor(private readonly db: Database) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await sql`select 1`.execute(this.db);
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Database is not reachable');
    }
  }
}
