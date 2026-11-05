import { Module } from '@nestjs/common';
import { TrackerController } from './tracker.controller.js';
import { TrackerService } from './tracker.service.js';

@Module({
  controllers: [TrackerController],
  providers: [TrackerService],
})
export class TrackerModule {}
