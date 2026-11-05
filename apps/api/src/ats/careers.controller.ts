import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type ApplyToJob,
  applyToJobSchema,
  MAX_RESUME_BYTES,
  paginationSchema,
} from '@hireflow/shared';
import type { z } from 'zod';
import { Public } from '../common/access.js';
import { AuthRateLimit } from '../common/rate-limit.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { UploadedFile as UploadedResume } from '../files/resume-check.js';
import { CareersService } from './careers.service.js';

@Controller('public/companies/:slug/jobs')
@Public()
export class CareersController {
  constructor(private readonly careers: CareersService) {}

  @Get()
  list(
    @Param('slug') slug: string,
    @Query(new ZodPipe(paginationSchema)) query: z.infer<typeof paginationSchema>,
  ) {
    return this.careers.listJobs(slug, query.limit, query.cursor);
  }

  @Get(':jobSlug')
  get(@Param('slug') slug: string, @Param('jobSlug') jobSlug: string) {
    return this.careers.getJob(slug, jobSlug);
  }

  // The file stays in memory for this one request, and the limit stops it growing too big.
  @Post(':jobSlug/apply')
  @AuthRateLimit()
  @UseInterceptors(
    FileInterceptor('resume', {
      limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 10, fieldSize: 64 * 1024 },
    }),
  )
  apply(
    @Param('slug') slug: string,
    @Param('jobSlug') jobSlug: string,
    @Body(new ZodPipe(applyToJobSchema)) body: ApplyToJob,
    @UploadedFile() file: UploadedResume | undefined,
  ) {
    return this.careers.apply(slug, jobSlug, body, file);
  }
}
