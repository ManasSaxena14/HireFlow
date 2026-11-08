import {
  Body,
  Header,
  Headers,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type ApplyToJob,
  applyToJobSchema,
  MAX_RESUME_BYTES,
  paginationSchema,
} from '@hireflow/shared';
import type { z } from 'zod';
import { Public } from '../common/access.js';
import { optionalUserId } from '../common/optional-user.js';
import { AuthRateLimit } from '../common/rate-limit.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { UploadedFile as UploadedResume } from '../files/resume-check.js';
import { CareersService } from './careers.service.js';

/** Public pages are the same for everyone, so browsers and proxies may keep them for a minute. */
const PUBLIC_CACHE = 'public, max-age=60';

@Controller('public/companies/:slug/jobs')
@Public()
export class CareersController {
  constructor(
    private readonly careers: CareersService,
    private readonly jwt: JwtService,
  ) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE)
  list(
    @Param('slug') slug: string,
    @Query(new ZodPipe(paginationSchema)) query: z.infer<typeof paginationSchema>,
  ) {
    return this.careers.listJobs(slug, query.limit, query.cursor);
  }

  @Get(':jobSlug')
  @Header('Cache-Control', PUBLIC_CACHE)
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
  async apply(
    @Param('slug') slug: string,
    @Param('jobSlug') jobSlug: string,
    @Body(new ZodPipe(applyToJobSchema)) body: ApplyToJob,
    @UploadedFile() file: UploadedResume | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    // Signed in people get their application on their own job board. It is checked in the service.
    const signedInUserId = await optionalUserId(this.jwt, authorization);
    return this.careers.apply(slug, jobSlug, body, file, signedInUserId);
  }
}
