import { Controller, Get, Query } from '@nestjs/common';
import { type AnalyticsQuery, analyticsQuerySchema } from '@hireflow/shared';
import { HiringTeam, Tenant } from '../common/access.js';
import type { RequestTenant } from '../common/access.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AnalyticsService } from './analytics.service.js';

/** Interviewers only see the people given to them, so company-wide numbers are not for them. */
@Controller('companies/:cid/analytics')
@HiringTeam()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('funnel')
  funnel(
    @Tenant() tenant: RequestTenant,
    @Query(new ZodPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analytics.funnel(tenant.companyId, query);
  }

  @Get('time-to-hire')
  timeToHire(
    @Tenant() tenant: RequestTenant,
    @Query(new ZodPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analytics.timeToHire(tenant.companyId, query);
  }

  @Get('sources')
  sources(
    @Tenant() tenant: RequestTenant,
    @Query(new ZodPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analytics.sources(tenant.companyId, query);
  }
}
