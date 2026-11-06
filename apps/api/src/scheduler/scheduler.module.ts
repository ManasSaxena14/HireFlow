import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service.js';
import { InterviewsService } from './interviews.service.js';
import { OffersService } from './offers.service.js';
import {
  CompanySchedulerController,
  InterviewCalendarController,
  InterviewsController,
  MySchedulerController,
  PublicCalendarController,
  PublicOffersController,
} from './scheduler.controller.js';
import { SchedulerLinks } from './scheduler-links.js';

@Module({
  controllers: [
    MySchedulerController,
    InterviewsController,
    CompanySchedulerController,
    InterviewCalendarController,
    PublicCalendarController,
    PublicOffersController,
  ],
  providers: [AvailabilityService, InterviewsService, OffersService, SchedulerLinks],
  exports: [InterviewsService],
})
export class SchedulerModule {}
