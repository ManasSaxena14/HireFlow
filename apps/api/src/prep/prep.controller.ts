import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreatePracticeSession,
  createPracticeSessionSchema,
  type GradeReview,
  gradeReviewSchema,
  listPracticeSessionsSchema,
} from '@hireflow/shared';
import type { z } from 'zod';
import { Authenticated, CurrentUser, type RequestUser } from '../common/access.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrepService } from './prep.service.js';

@Controller('prep')
@Authenticated()
export class PrepController {
  constructor(private readonly prep: PrepService) {}

  @Post('sessions')
  log(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createPracticeSessionSchema)) body: CreatePracticeSession,
  ) {
    return this.prep.logSession(user.id, body);
  }

  @Get('sessions')
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(listPracticeSessionsSchema))
    query: z.output<typeof listPracticeSessionsSchema>,
  ) {
    return this.prep.listSessions(user.id, query.limit, query.cursor);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  removeSession(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.prep.removeSession(user.id, id);
  }

  @Get('stats')
  stats(@CurrentUser() user: RequestUser) {
    return this.prep.stats(user.id);
  }

  @Get('reviews')
  reviews(@CurrentUser() user: RequestUser) {
    return this.prep.listReviews(user.id, false);
  }

  @Get('reviews/due')
  due(@CurrentUser() user: RequestUser) {
    return this.prep.listReviews(user.id, true);
  }

  @Post('reviews/:id/grade')
  @HttpCode(200)
  grade(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(gradeReviewSchema)) body: GradeReview,
  ) {
    return this.prep.grade(user.id, id, body.quality);
  }

  @Delete('reviews/:id')
  @HttpCode(204)
  removeReview(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.prep.removeReview(user.id, id);
  }
}
