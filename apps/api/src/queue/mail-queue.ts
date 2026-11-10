import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { MAIL_QUEUE, type MailMessage, RESUME_PARSE_QUEUE } from '@hireflow/shared';
import { CompiledQuery } from 'kysely';
import { PgBoss } from 'pg-boss';
import { PinoLogger } from 'nestjs-pino';
import { ConfigService } from '../config/config.service.js';
import type { Executor } from '../database/database.js';

export abstract class MailQueue {
  /** Adds the email inside the same transaction, so an undo also cancels the email. */
  abstract enqueue(message: MailMessage, executor: Executor): Promise<void>;
  /** The same promise for a job that is not an email. */
  abstract enqueueJob(queue: string, data: object, executor: Executor): Promise<void>;
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
      // The API only adds jobs, so two links are plenty. Free databases allow few links.
      max: 2,
    });
    this.boss.on('error', (err) => this.logger.error({ err }, 'job queue error'));
  }

  private ready: Promise<void> | undefined;

  /**
   * Starts the queue without holding up the server. A free host only counts the server as up
   * once it answers, and a sleeping database can take seconds to wake, so the first job waits
   * for the queue instead of the whole start.
   */
  onModuleInit(): void {
    this.ready = this.start();
    // Seen here so a failed start is logged once. The next job tries again.
    this.ready.catch((err: unknown) => this.logger.warn({ err }, 'job queue not started yet'));
  }

  private async start(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(MAIL_QUEUE, { retryLimit: 5, retryBackoff: true, retryDelay: 30 });
    await this.boss.createQueue(RESUME_PARSE_QUEUE, { retryLimit: 2, retryDelay: 15 });
  }

  private async whenReady(): Promise<void> {
    try {
      await (this.ready ??= this.start());
    } catch {
      this.ready = this.start();
      await this.ready;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.ready?.catch(() => undefined);
    await this.boss.stop({ graceful: false });
  }

  async enqueue(message: MailMessage, executor: Executor): Promise<void> {
    await this.enqueueJob(MAIL_QUEUE, message, executor);
  }

  async enqueueJob(queue: string, data: object, executor: Executor): Promise<void> {
    await this.whenReady();
    await this.boss.send(queue, data, {
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
