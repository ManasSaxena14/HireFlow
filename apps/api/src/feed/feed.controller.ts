import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateAlert,
  createAlertSchema,
  type ListFeedJobs,
  listFeedJobsSchema,
  type UpdateAlert,
  updateAlertSchema,
} from '@hireflow/shared';
import { Authenticated, CurrentUser, type RequestUser } from '../common/access.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AlertsService } from './alerts.service.js';
import { FeedService } from './feed.service.js';

@Controller('feed/jobs')
@Authenticated()
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(listFeedJobsSchema)) query: ListFeedJobs,
  ) {
    return this.feed.list(user.id, query);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.feed.get(user.id, id);
  }

  @Post(':id/save')
  save(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.feed.save(user.id, id);
  }
}

@Controller('alerts')
@Authenticated()
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.alerts.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createAlertSchema)) body: CreateAlert,
  ) {
    return this.alerts.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateAlertSchema)) body: UpdateAlert,
  ) {
    return this.alerts.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.alerts.remove(user.id, id);
  }
}
