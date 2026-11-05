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
  type CreateApplication,
  createApplicationSchema,
  type CreateNote,
  createNoteSchema,
  type CreateReminder,
  createReminderSchema,
  type ListApplications,
  listApplicationsSchema,
  type MoveApplication,
  moveApplicationSchema,
  type UpdateApplication,
  updateApplicationSchema,
} from '@hireflow/shared';
import { Authenticated, CurrentUser, type RequestUser } from '../common/access.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { TrackerService } from './tracker.service.js';

@Controller('tracker')
@Authenticated()
export class TrackerController {
  constructor(private readonly tracker: TrackerService) {}

  @Get('applications')
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(listApplicationsSchema)) query: ListApplications,
  ) {
    return this.tracker.list(user.id, query);
  }

  @Post('applications')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createApplicationSchema)) body: CreateApplication,
  ) {
    return this.tracker.create(user.id, body);
  }

  @Get('applications/:id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracker.get(user.id, id);
  }

  @Patch('applications/:id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateApplicationSchema)) body: UpdateApplication,
  ) {
    return this.tracker.update(user.id, id, body);
  }

  @Post('applications/:id/move')
  @HttpCode(200)
  move(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(moveApplicationSchema)) body: MoveApplication,
  ) {
    return this.tracker.move(user.id, id, body);
  }

  @Delete('applications/:id')
  @HttpCode(204)
  archive(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracker.archive(user.id, id);
  }

  @Post('applications/:id/notes')
  addNote(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(createNoteSchema)) body: CreateNote,
  ) {
    return this.tracker.addNote(user.id, id, body);
  }

  @Get('applications/:id/notes')
  listNotes(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracker.listNotes(user.id, id);
  }

  @Get('applications/:id/events')
  listEvents(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracker.listEvents(user.id, id);
  }

  @Post('applications/:id/reminders')
  addReminder(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(createReminderSchema)) body: CreateReminder,
  ) {
    return this.tracker.addReminder(user.id, id, body);
  }

  @Get('stats')
  stats(@CurrentUser() user: RequestUser) {
    return this.tracker.stats(user.id);
  }
}
