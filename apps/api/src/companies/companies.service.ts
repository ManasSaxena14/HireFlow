import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  AddMemberInput,
  CompanyMember,
  CreateCompanyInput,
  UpdateCompanyInput,
  UpdateMemberInput,
} from '@hireflow/shared';
import { sql } from 'kysely';
import { AuditService } from '../common/audit.service.js';
import { DomainError, notFound } from '../common/domain-error.js';
import { slugify } from '../common/slug.js';
import { Database, type Executor, isUniqueViolation } from '../database/database.js';
import { MembershipsRepository } from './memberships.repository.js';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly db: Database,
    private readonly memberships: MembershipsRepository,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateCompanyInput, userId: string, ip: string | null) {
    const base = input.slug ?? slugify(input.name, 'company');
    // If the user did not pick a link and this one is taken, add a few letters and try again.
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      try {
        return await this.insert(input.name, slug, userId, ip);
      } catch (error) {
        if (!isUniqueViolation(error, 'companies_slug_key')) throw error;
        if (input.slug) throw new DomainError('CONFLICT', 'This company link is already taken.');
      }
    }
    throw new DomainError('CONFLICT', 'Please choose a different company link.');
  }

  private insert(name: string, slug: string, userId: string, ip: string | null) {
    return this.db.transaction().execute(async (tx) => {
      const company = await tx
        .insertInto('companies')
        .values({ name, slug })
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.memberships.add(company.id, userId, 'admin', tx);
      await this.audit.record(
        {
          companyId: company.id,
          actorId: userId,
          action: 'company.created',
          entityType: 'company',
          entityId: company.id,
          ip,
        },
        tx,
      );
      return company;
    });
  }

  async get(companyId: string) {
    const company = await this.db
      .selectFrom('companies')
      .selectAll()
      .where('id', '=', companyId)
      .executeTakeFirst();
    if (!company) throw notFound('Company');
    return company;
  }

  async update(companyId: string, input: UpdateCompanyInput, actorId: string, ip: string | null) {
    return this.db.transaction().execute(async (tx) => {
      const company = await tx
        .updateTable('companies')
        .set(input)
        .where('id', '=', companyId)
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.audit.record(
        {
          companyId,
          actorId,
          action: 'company.updated',
          entityType: 'company',
          entityId: companyId,
          diff: input,
          ip,
        },
        tx,
      );
      return company;
    });
  }

  listMembers(companyId: string): Promise<CompanyMember[]> {
    return this.db
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.userId')
      .select(['users.id as userId', 'users.fullName', 'users.email', 'memberships.role'])
      .where('memberships.companyId', '=', companyId)
      .orderBy('users.fullName')
      .execute();
  }

  async addMember(companyId: string, input: AddMemberInput, actorId: string, ip: string | null) {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'fullName'])
      .where((eb) => eb(eb.fn('lower', ['email']), '=', input.email))
      .where('isActive', '=', true)
      .executeTakeFirst();
    if (!user) throw notFound('A HireFlow account with that email');

    try {
      return await this.db.transaction().execute(async (tx) => {
        const membership = await this.memberships.add(companyId, user.id, input.role, tx);
        await this.recordRoleChange(tx, companyId, actorId, user.id, 'member.added', ip, {
          role: input.role,
        });
        return { ...membership, email: user.email, fullName: user.fullName };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError('CONFLICT', 'This person is already a member.');
      }
      throw error;
    }
  }

  async updateMember(
    companyId: string,
    userId: string,
    input: UpdateMemberInput,
    actorId: string,
    ip: string | null,
  ) {
    return this.db.transaction().execute(async (tx) => {
      if (input.role !== 'admin') await this.assertNotLastAdmin(companyId, userId, tx);
      const updated = await this.memberships.updateRole(companyId, userId, input.role, tx);
      if (!updated) throw notFound('Member');
      await this.recordRoleChange(tx, companyId, actorId, userId, 'member.role_changed', ip, {
        role: input.role,
      });
      return updated;
    });
  }

  async removeMember(companyId: string, userId: string, actorId: string, ip: string | null) {
    await this.db.transaction().execute(async (tx) => {
      await this.assertNotLastAdmin(companyId, userId, tx);
      const upcoming = await tx
        .selectFrom('interviews')
        .select('id')
        .where('companyId', '=', companyId)
        .where('interviewerId', '=', userId)
        .where('status', '=', 'scheduled')
        .where(sql<boolean>`upper(during) > now()`)
        .limit(1)
        .executeTakeFirst();
      if (upcoming) {
        throw new DomainError(
          'CONFLICT',
          'This person has interviews coming up. Please cancel them or change them first.',
        );
      }
      const result = await this.memberships.remove(companyId, userId, tx);
      if (result.numDeletedRows === 0n) throw notFound('Member');
      // Their open booking links stop working too, or someone could still book with them.
      await tx
        .updateTable('interviewOffers')
        .set({ withdrawnAt: new Date() })
        .where('companyId', '=', companyId)
        .where('interviewerId', '=', userId)
        .where('interviewId', 'is', null)
        .where('withdrawnAt', 'is', null)
        .execute();
      await tx
        .deleteFrom('availabilityRules')
        .where('companyId', '=', companyId)
        .where('userId', '=', userId)
        .execute();
      await tx
        .deleteFrom('availabilityBlocks')
        .where('companyId', '=', companyId)
        .where('userId', '=', userId)
        .execute();
      // If this person joins again later, they should not get their old candidates back.
      await tx
        .deleteFrom('applicationAssignments')
        .where('companyId', '=', companyId)
        .where('userId', '=', userId)
        .execute();
      await this.recordRoleChange(tx, companyId, actorId, userId, 'member.removed', ip);
    });
  }

  private async assertNotLastAdmin(companyId: string, userId: string, tx: Executor) {
    const admins = await this.memberships.lockAdmins(companyId, tx);
    if (admins.length === 1 && admins[0] === userId) {
      throw new DomainError('CONFLICT', 'A company must keep at least one admin.');
    }
  }

  private recordRoleChange(
    tx: Executor,
    companyId: string,
    actorId: string,
    userId: string,
    action: string,
    ip: string | null,
    diff?: unknown,
  ) {
    return this.audit.record(
      { companyId, actorId, action, entityType: 'user', entityId: userId, diff, ip },
      tx,
    );
  }
}
