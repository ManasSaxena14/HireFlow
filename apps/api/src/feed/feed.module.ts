import { Module } from '@nestjs/common';
import { TrackerModule } from '../tracker/tracker.module.js';
import { AlertsService } from './alerts.service.js';
import { AlertsController, FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';

@Module({
  imports: [TrackerModule],
  controllers: [FeedController, AlertsController],
  providers: [FeedService, AlertsService],
})
export class FeedModule {}
