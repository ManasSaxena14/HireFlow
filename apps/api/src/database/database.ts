import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
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

const EXCLUSION_VIOLATION = '23P01';
const DEADLOCK_DETECTED = '40P01';

/**
 * Says which booking rule stopped a save. Two inserts racing for the same time can wait on each
 * other. PostgreSQL then ends one of them with a deadlock error, which means the same thing.
 */
export function bookingClash(error: unknown): 'interviewer' | 'candidate' | null {
  const pgError = error as { code?: string; constraint?: string };
  if (pgError?.code === DEADLOCK_DETECTED) return 'interviewer';
  if (pgError?.code !== EXCLUSION_VIOLATION) return null;
  return pgError.constraint === 'no_candidate_overlap' ? 'candidate' : 'interviewer';
}

const logger = new Logger('Database');

/**
 * Free database hosts close idle links and sleep when unused. Without an error listener, a
 * link closed while idle would crash the whole process, so it is logged and the pool opens a
 * new one next time. Idle links are closed after 30 seconds, and a sleeping database gets
 * 15 seconds to wake.
 */
export function createPool(connectionString: string, max: number): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });
  pool.on('error', (err) => logger.warn(`An idle database link closed: ${err.message}`));
  return pool;
}

@Injectable()
export class Database extends Kysely<DB> implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      dialect: new PostgresDialect({ pool: createPool(config.env.DATABASE_URL, 10) }),
      plugins: [new CamelCasePlugin()],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.destroy();
  }
}
