import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { MAIL_QUEUE, type MailMessage } from '@hireflow/shared';
import { CompiledQuery } from 'kysely';
import { PgBoss } from 'pg-boss';
import { PinoLogger } from 'nestjs-pino';
import { ConfigService } from '../config/config.service.js';
import type { Executor } from '../database/database.js';

export abstract class MailQueue {
  /** Adds the email inside the same transaction, so an undo also cancels the email. */
  abstract enqueue(message: MailMessage, executor: Executor): Promise<void>;
}

@Injectable()
export class PgBossMailQueue extends MailQueue implements OnModuleInit, OnModuleDestroy {
  private readonly boss: PgBoss;

  constructor(
    config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    super();
    // The worker runs the schedules and clean-up. The API only adds jobs.
    this.boss = new PgBoss({
      connectionString: config.env.DATABASE_URL,
      schedule: false,
      supervise: false,
    });
    this.boss.on('error', (err) => this.logger.error({ err }, 'job queue error'));
  }

  async onModuleInit(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(MAIL_QUEUE, { retryLimit: 5, retryBackoff: true, retryDelay: 30 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop({ graceful: false });
  }

  async enqueue(message: MailMessage, executor: Executor): Promise<void> {
    await this.boss.send(MAIL_QUEUE, message, {
      db: {
        executeSql: async (text, values) => {
          const { rows } = await executor.executeQuery(
            CompiledQuery.raw(text, (values ?? []) as unknown[]),
          );
          return { rows } as never;
        },
      },
    });
  }
}
