import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller.js';

@Module({ controllers: [AuditLogsController] })
export class AuditLogsModule {}
