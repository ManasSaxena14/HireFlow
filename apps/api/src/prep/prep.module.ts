import { Module } from '@nestjs/common';
import { PrepController } from './prep.controller.js';
import { PrepService } from './prep.service.js';

@Module({ controllers: [PrepController], providers: [PrepService] })
export class PrepModule {}
