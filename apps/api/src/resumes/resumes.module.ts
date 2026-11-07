import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesService } from './resumes.service.js';

@Module({
  imports: [FilesModule],
  controllers: [ResumesController],
  providers: [ResumesService],
})
export class ResumesModule {}
