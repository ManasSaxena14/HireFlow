import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { ApplicationsService } from './applications.service.js';
import { ApplicationsController, JobsController } from './ats.controller.js';
import { CareersController } from './careers.controller.js';
import { CareersService } from './careers.service.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [FilesModule],
  controllers: [JobsController, ApplicationsController, CareersController],
  providers: [JobsService, ApplicationsService, CareersService],
})
export class AtsModule {}
