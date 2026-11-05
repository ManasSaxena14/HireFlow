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
  Put,
  Query,
} from '@nestjs/common';
import {
  type AssignInterviewer,
  assignInterviewerSchema,
  type CreateComment,
  createCommentSchema,
  type CreateJob,
  createJobSchema,
  type CreateScorecard,
  createScorecardSchema,
  type ListCandidates,
  listCandidatesSchema,
  type ListJobs,
  listJobsSchema,
  type MoveCandidate,
  moveCandidateSchema,
  type ReplaceStages,
  replaceStagesSchema,
  type UpdateJob,
  updateJobSchema,
} from '@hireflow/shared';
import {
  AnyMember,
  ClientIp,
  CurrentViewer,
  HiringTeam,
  Roles,
  type Viewer,
} from '../common/access.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ApplicationsService } from './applications.service.js';
import { JobsService } from './jobs.service.js';

@Controller('companies/:cid/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @AnyMember()
  list(@CurrentViewer() viewer: Viewer, @Query(new ZodPipe(listJobsSchema)) query: ListJobs) {
    return this.jobs.list(viewer, query);
  }

  @Post()
  @HiringTeam()
  create(
    @CurrentViewer() viewer: Viewer,
    @Body(new ZodPipe(createJobSchema)) body: CreateJob,
    @ClientIp() ip: string | null,
  ) {
    return this.jobs.create(viewer, body, ip);
  }

  @Get(':id')
  @AnyMember()
  get(@CurrentViewer() viewer: Viewer, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(viewer, id);
  }

  @Patch(':id')
  @HiringTeam()
  update(
    @CurrentViewer() viewer: Viewer,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateJobSchema)) body: UpdateJob,
    @ClientIp() ip: string | null,
  ) {
    return this.jobs.update(viewer, id, body, ip);
  }

  @Post(':id/publish')
  @HiringTeam()
  @HttpCode(200)
  publish(
    @CurrentViewer() viewer: Viewer,
    @Param('id', ParseUUIDPipe) id: string,
    @ClientIp() ip: string | null,
  ) {
    return this.jobs.publish(viewer, id, ip);
  }

  @Post(':id/close')
  @HiringTeam()
  @HttpCode(200)
  close(
    @CurrentViewer() viewer: Viewer,
    @Param('id', ParseUUIDPipe) id: string,
    @ClientIp() ip: string | null,
  ) {
    return this.jobs.close(viewer, id, ip);
  }

  @Get(':id/stages')
  @AnyMember()
  stages(@CurrentViewer() viewer: Viewer, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.listStages(viewer, id);
  }

  @Put(':id/stages')
  @HiringTeam()
  replaceStages(
    @CurrentViewer() viewer: Viewer,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(replaceStagesSchema)) body: ReplaceStages,
    @ClientIp() ip: string | null,
  ) {
    return this.jobs.replaceStages(viewer, id, body, ip);
  }
}

@Controller('companies/:cid')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get('applications')
  @AnyMember()
  list(
    @CurrentViewer() viewer: Viewer,
    @Query(new ZodPipe(listCandidatesSchema)) query: ListCandidates,
  ) {
    return this.applications.list(viewer, query);
  }

  @Get('applications/:aid')
  @AnyMember()
  get(@CurrentViewer() viewer: Viewer, @Param('aid', ParseUUIDPipe) id: string) {
    return this.applications.get(viewer, id);
  }

  @Post('applications/:aid/move')
  @HiringTeam()
  @HttpCode(200)
  move(
    @CurrentViewer() viewer: Viewer,
    @Param('aid', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(moveCandidateSchema)) body: MoveCandidate,
    @ClientIp() ip: string | null,
  ) {
    return this.applications.move(viewer, id, body, ip);
  }

  @Post('applications/:aid/comments')
  @AnyMember()
  addComment(
    @CurrentViewer() viewer: Viewer,
    @Param('aid', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(createCommentSchema)) body: CreateComment,
  ) {
    return this.applications.addComment(viewer, id, body);
  }

  @Post('applications/:aid/scorecards')
  @AnyMember()
  addScorecard(
    @CurrentViewer() viewer: Viewer,
    @Param('aid', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(createScorecardSchema)) body: CreateScorecard,
    @ClientIp() ip: string | null,
  ) {
    return this.applications.addScorecard(viewer, id, body, ip);
  }

  @Post('applications/:aid/assignees')
  @HiringTeam()
  assign(
    @CurrentViewer() viewer: Viewer,
    @Param('aid', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(assignInterviewerSchema)) body: AssignInterviewer,
    @ClientIp() ip: string | null,
  ) {
    return this.applications.assign(viewer, id, body, ip);
  }

  @Delete('applications/:aid/assignees/:userId')
  @HiringTeam()
  unassign(
    @CurrentViewer() viewer: Viewer,
    @Param('aid', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @ClientIp() ip: string | null,
  ) {
    return this.applications.unassign(viewer, id, userId, ip);
  }

  @Get('applications/:aid/resume')
  @AnyMember()
  resumeLink(@CurrentViewer() viewer: Viewer, @Param('aid', ParseUUIDPipe) id: string) {
    return this.applications.resumeLink(viewer, id);
  }

  @Delete('candidates/:id')
  @Roles('admin')
  @HttpCode(204)
  deleteCandidate(
    @CurrentViewer() viewer: Viewer,
    @Param('id', ParseUUIDPipe) id: string,
    @ClientIp() ip: string | null,
  ) {
    return this.applications.deleteCandidate(viewer, id, ip);
  }
}
