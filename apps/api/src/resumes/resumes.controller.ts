import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MAX_RESUME_BYTES,
  type MatchResumeBody,
  matchResumeSchema,
  type UploadResume,
  uploadResumeSchema,
} from '@hireflow/shared';
import { Authenticated, CurrentUser, type RequestUser } from '../common/access.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { UploadedFile as UploadedResume } from '../files/resume-check.js';
import { ResumesService } from './resumes.service.js';

@Controller('resumes')
@Authenticated()
export class ResumesController {
  constructor(private readonly resumes: ResumesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.resumes.list(user.id);
  }

  // The file stays in memory for this one request, and the limit stops it growing too big.
  @Post()
  @UseInterceptors(
    FileInterceptor('resume', {
      limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 5, fieldSize: 1024 },
    }),
  )
  upload(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(uploadResumeSchema)) body: UploadResume,
    @UploadedFile() file: UploadedResume | undefined,
  ) {
    return this.resumes.upload(user.id, body, file);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.get(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.remove(user.id, id);
  }

  @Get(':id/file')
  fileLink(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.fileLink(user.id, id);
  }

  @Get(':id/matches')
  listMatches(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.resumes.listMatches(user.id, id);
  }

  @Post(':id/match')
  match(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(matchResumeSchema)) body: MatchResumeBody,
  ) {
    return this.resumes.match(user.id, id, body);
  }
}
