import { Module } from '@nestjs/common';
import { FileLinks } from './file-links.js';
import { DiskFileStorage, FileStorage } from './file-storage.js';
import { FilesController } from './files.controller.js';

@Module({
  controllers: [FilesController],
  providers: [FileLinks, { provide: FileStorage, useClass: DiskFileStorage }],
  exports: [FileLinks, FileStorage],
})
export class FilesModule {}
