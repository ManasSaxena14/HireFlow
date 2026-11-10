import { randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuditLogsModule } from './audit/audit-logs.module.js';
import { AtsModule } from './ats/ats.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { AuditService } from './common/audit.service.js';
import { AuthGuard, RolesGuard, TenantGuard } from './common/guards.js';
import { AppThrottlerGuard, isAuthLimited } from './common/rate-limit.js';
import { CompaniesModule } from './companies/companies.module.js';
import { ConfigService } from './config/config.service.js';
import { Database } from './database/database.js';
import { FeedModule } from './feed/feed.module.js';
import { HealthController } from './health/health.controller.js';
import { MailQueue, PgBossMailQueue } from './queue/mail-queue.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { PrepModule } from './prep/prep.module.js';
import { ResumesModule } from './resumes/resumes.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';
import { TrackerModule } from './tracker/tracker.module.js';
import { UsersController } from './users/users.controller.js';

@Global()
@Module({
  providers: [
    ConfigService,
    Database,
    AuditService,
    { provide: MailQueue, useClass: PgBossMailQueue },
  ],
  exports: [ConfigService, Database, AuditService, MailQueue],
})
class CoreModule {}

const ONE_MINUTE_MS = 60_000;

@Module({
  imports: [
    CoreModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.env.LOG_LEVEL,
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const id = `req_${randomUUID()}`;
            res.setHeader('x-request-id', id);
            return id;
          },
          // Log only the method, path and status. Headers hold tokens and cookies.
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              // A booking link works like a password, so it must never reach the logs.
              path: req.url.split('?')[0]?.replace(/(\/interview-offers\/)[^/]+/, '$1[hidden]'),
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          ...(config.env.NODE_ENV === 'development'
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'user',
            ttl: ONE_MINUTE_MS,
            limit: config.env.RATE_LIMIT_USER_PER_MIN,
          },
          {
            name: 'auth',
            ttl: ONE_MINUTE_MS,
            limit: config.env.RATE_LIMIT_AUTH_PER_MIN,
            skipIf: (context) => !isAuthLimited(context),
          },
        ],
      }),
    }),
    AuthModule,
    CompaniesModule,
    TrackerModule,
    AtsModule,
    SchedulerModule,
    FeedModule,
    ResumesModule,
    PrepModule,
    AnalyticsModule,
    AuditLogsModule,
  ],
  controllers: [UsersController, NotificationsController, HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // The order matters: find the user, check rate limits, then check company and role.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
