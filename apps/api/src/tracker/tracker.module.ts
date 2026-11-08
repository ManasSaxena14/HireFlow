import { Module } from '@nestjs/common';
import { TrackerController } from './tracker.controller.js';
import { CompanyLinks } from './company-links.service.js';
import { TrackerService } from './tracker.service.js';

@Module({
  controllers: [TrackerController],
  providers: [TrackerService, CompanyLinks],
  exports: [TrackerService, CompanyLinks],
})
export class TrackerModule {}
