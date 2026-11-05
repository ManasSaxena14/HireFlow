import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  addMemberSchema,
  type AddMemberInput,
  createCompanySchema,
  type CreateCompanyInput,
  updateCompanySchema,
  type UpdateCompanyInput,
  updateMemberSchema,
  type UpdateMemberInput,
} from '@hireflow/shared';
import {
  AnyMember,
  Authenticated,
  ClientIp,
  CurrentUser,
  HiringTeam,
  type RequestTenant,
  type RequestUser,
  Roles,
  Tenant,
} from '../common/access.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CompaniesService } from './companies.service.js';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  @Authenticated()
  create(
    @Body(new ZodPipe(createCompanySchema)) body: CreateCompanyInput,
    @CurrentUser() user: RequestUser,
    @ClientIp() ip: string | null,
  ) {
    return this.companies.create(body, user.id, ip);
  }

  @Get(':cid')
  @AnyMember()
  get(@Tenant() tenant: RequestTenant) {
    return this.companies.get(tenant.companyId);
  }

  @Patch(':cid')
  @Roles('admin')
  update(
    @Tenant() tenant: RequestTenant,
    @Body(new ZodPipe(updateCompanySchema)) body: UpdateCompanyInput,
    @CurrentUser() user: RequestUser,
    @ClientIp() ip: string | null,
  ) {
    return this.companies.update(tenant.companyId, body, user.id, ip);
  }

  @Get(':cid/members')
  @HiringTeam()
  listMembers(@Tenant() tenant: RequestTenant) {
    return this.companies.listMembers(tenant.companyId);
  }

  @Post(':cid/members')
  @Roles('admin')
  addMember(
    @Tenant() tenant: RequestTenant,
    @Body(new ZodPipe(addMemberSchema)) body: AddMemberInput,
    @CurrentUser() user: RequestUser,
    @ClientIp() ip: string | null,
  ) {
    return this.companies.addMember(tenant.companyId, body, user.id, ip);
  }

  @Patch(':cid/members/:userId')
  @Roles('admin')
  updateMember(
    @Tenant() tenant: RequestTenant,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodPipe(updateMemberSchema)) body: UpdateMemberInput,
    @CurrentUser() user: RequestUser,
    @ClientIp() ip: string | null,
  ) {
    return this.companies.updateMember(tenant.companyId, userId, body, user.id, ip);
  }

  @Delete(':cid/members/:userId')
  @Roles('admin')
  @HttpCode(204)
  removeMember(
    @Tenant() tenant: RequestTenant,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: RequestUser,
    @ClientIp() ip: string | null,
  ) {
    return this.companies.removeMember(tenant.companyId, userId, user.id, ip);
  }
}
