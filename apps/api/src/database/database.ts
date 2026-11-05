import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { CamelCasePlugin, Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import { ConfigService } from '../config/config.service.js';
import type { DB } from './schema.js';

export type Tx = Transaction<DB>;
export type Executor = Kysely<DB>;

const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = error as { code?: string; constraint?: string };
  return pgError?.code === UNIQUE_VIOLATION && (!constraint || pgError.constraint === constraint);
}

@Injectable()
export class Database extends Kysely<DB> implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: config.env.DATABASE_URL, max: 10 }),
      }),
      plugins: [new CamelCasePlugin()],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.destroy();
  }
}
