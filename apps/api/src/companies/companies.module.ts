import { Global, Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { MembershipsRepository } from './memberships.repository.js';

@Global()
@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, MembershipsRepository],
  exports: [MembershipsRepository],
})
export class CompaniesModule {}
