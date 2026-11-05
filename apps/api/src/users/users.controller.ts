import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateProfileSchema, type UpdateProfileInput } from '@hireflow/shared';
import { Authenticated, CurrentUser, type RequestUser } from '../common/access.js';
import { notFound } from '../common/domain-error.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { Database } from '../database/database.js';

const PROFILE_COLUMNS = ['id', 'email', 'fullName', 'timezone', 'emailVerifiedAt'] as const;

@Controller('me')
export class UsersController {
  constructor(private readonly db: Database) {}

  @Get()
  @Authenticated()
  async me(@CurrentUser() user: RequestUser) {
    const profile = await this.db
      .selectFrom('users')
      .select(PROFILE_COLUMNS)
      .where('id', '=', user.id)
      .executeTakeFirst();
    if (!profile) throw notFound('Account');

    const memberships = await this.db
      .selectFrom('memberships')
      .innerJoin('companies', 'companies.id', 'memberships.companyId')
      .select(['companies.id as companyId', 'companies.name', 'companies.slug', 'memberships.role'])
      .where('memberships.userId', '=', user.id)
      .orderBy('companies.name')
      .execute();

    return { ...profile, memberships };
  }

  @Patch()
  @Authenticated()
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.db
      .updateTable('users')
      .set(body)
      .where('id', '=', user.id)
      .returning(PROFILE_COLUMNS)
      .executeTakeFirstOrThrow();
  }
}
