import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type AvailabilityQuery,
  availabilityQuerySchema,
  type BookOffer,
  bookOfferSchema,
  type CreateInterview,
  createInterviewSchema,
  type CreateOffer,
  createOfferSchema,
  type ListInterviews,
  listInterviewsSchema,
  type PutAvailability,
  putAvailabilitySchema,
  type RescheduleInterview,
  rescheduleInterviewSchema,
  type SuggestSlots,
  suggestSlotsSchema,
} from '@hireflow/shared';
import {
  AnyMember,
  Authenticated,
  ClientIp,
  CurrentUser,
  CurrentViewer,
  HiringTeam,
  Public,
  type RequestUser,
  type Viewer,
} from '../common/access.js';
import { AuthRateLimit } from '../common/rate-limit.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AvailabilityService } from './availability.service.js';
import { InterviewsService } from './interviews.service.js';
import { OffersService } from './offers.service.js';

const ICS_TYPE = 'text/calendar; charset=utf-8';
const ICS_FILE = 'attachment; filename="interview.ics"';

@Controller('me')
@Authenticated()
export class MySchedulerController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly interviews: InterviewsService,
  ) {}

  @Get('availability')
  getAvailability(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(availabilityQuerySchema)) query: AvailabilityQuery,
  ) {
    return this.availability.get(query.companyId, user.id);
  }

  @Put('availability')
  putAvailability(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(availabilityQuerySchema)) query: AvailabilityQuery,
    @Body(new ZodPipe(putAvailabilitySchema)) body: PutAvailability,
  ) {
    return this.availability.replace(query.companyId, user.id, body);
  }

  @Get('interviews')
  myInterviews(@CurrentUser() user: RequestUser) {
    return this.interviews.mine(user.id);
  }
}

@Controller('companies/:cid/interviews')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get()
  @AnyMember()
  list(
    @CurrentViewer() viewer: Viewer,
    @Query(new ZodPipe(listInterviewsSchema)) query: ListInterviews,
  ) {
    return this.interviews.list(viewer, query);
  }

  @Post('suggest-slots')
  @HiringTeam()
  @HttpCode(200)
  suggest(
    @CurrentViewer() viewer: Viewer,
    @Body(new ZodPipe(suggestSlotsSchema)) body: SuggestSlots,
  ) {
    return this.interviews.suggestSlots(viewer, body);
  }

  @Post()
  @HiringTeam()
  create(
    @CurrentViewer() viewer: Viewer,
    @Body(new ZodPipe(createInterviewSchema)) body: CreateInterview,
    @ClientIp() ip: string | null,
  ) {
    return this.interviews.create(viewer, body, ip);
  }

  @Post(':id/reschedule')
  @HiringTeam()
  @HttpCode(200)
  reschedule(
    @CurrentViewer() viewer: Viewer,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rescheduleInterviewSchema)) body: RescheduleInterview,
    @ClientIp() ip: string | null,
  ) {
    return this.interviews.reschedule(viewer, id, body, ip);
  }

  @Post(':id/cancel')
  @HiringTeam()
  @HttpCode(200)
  cancel(
    @CurrentViewer() viewer: Viewer,
    @Param('id', ParseUUIDPipe) id: string,
    @ClientIp() ip: string | null,
  ) {
    return this.interviews.cancel(viewer, id, ip);
  }
}

@Controller('companies/:cid')
export class CompanySchedulerController {
  constructor(
    private readonly interviews: InterviewsService,
    private readonly offers: OffersService,
  ) {}

  @Get('applications/:id/interviews')
  @AnyMember()
  forApplication(@CurrentViewer() viewer: Viewer, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.forApplication(viewer, id);
  }

  @Post('interview-offers')
  @HiringTeam()
  createOffer(
    @CurrentViewer() viewer: Viewer,
    @Body(new ZodPipe(createOfferSchema)) body: CreateOffer,
    @ClientIp() ip: string | null,
  ) {
    return this.offers.create(viewer, body, ip);
  }

  @Post('interview-offers/:id/withdraw')
  @HiringTeam()
  @HttpCode(204)
  withdrawOffer(
    @CurrentViewer() viewer: Viewer,
    @Param('id', ParseUUIDPipe) id: string,
    @ClientIp() ip: string | null,
  ) {
    return this.offers.withdraw(viewer, id, ip);
  }
}

@Controller('interviews')
export class InterviewCalendarController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get(':id/ics')
  @Authenticated()
  @Header('Content-Type', ICS_TYPE)
  @Header('Content-Disposition', ICS_FILE)
  ics(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.icsForParticipant(user.id, id);
  }
}

@Controller('public/interviews')
@Public()
export class PublicCalendarController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get(':id/calendar')
  @Header('Content-Type', ICS_TYPE)
  @Header('Content-Disposition', ICS_FILE)
  calendar(@Param('id', ParseUUIDPipe) id: string, @Query('signature') signature: unknown) {
    return this.interviews.icsForCandidateLink(id, typeof signature === 'string' ? signature : '');
  }
}

@Controller('interview-offers')
@Public()
export class PublicOffersController {
  constructor(private readonly offers: OffersService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.offers.getPublic(token);
  }

  @Post(':token/book')
  @AuthRateLimit()
  @HttpCode(200)
  book(@Param('token') token: string, @Body(new ZodPipe(bookOfferSchema)) body: BookOffer) {
    return this.offers.book(token, body);
  }
}
