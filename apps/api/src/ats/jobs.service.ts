import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateJob,
  Job,
  JobDetail,
  ListJobs,
  Page,
  PipelineStage,
  ReplaceStages,
  StageKind,
  UpdateJob,
} from '@hireflow/shared';
import { type Selectable, sql } from 'kysely';
import type { Viewer } from '../common/access.js';
import { AuditService } from '../common/audit.service.js';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { DomainError, notFound } from '../common/domain-error.js';
import { slugify } from '../common/slug.js';
import { Database, type Executor, isUniqueViolation } from '../database/database.js';
import type { JobsTable } from '../database/schema.js';

const SLUG_CONSTRAINT = 'jobs_company_id_slug_key';

const DEFAULT_STAGES: { name: string; kind: StageKind }[] = [
  { name: 'New', kind: 'applied' },
  { name: 'First call', kind: 'screening' },
  { name: 'Interview', kind: 'interview' },
  { name: 'Offer', kind: 'offer' },
  { name: 'Hired', kind: 'hired' },
  { name: 'Not selected', kind: 'rejected' },
];

/** A hiring manager runs only their own jobs. Admins and recruiters run all of them. */
function canManage(viewer: Viewer, job: { createdBy: string }): boolean {
  if (viewer.role === 'admin' || viewer.role === 'recruiter') return true;
  return viewer.role === 'hiring_manager' && job.createdBy === viewer.userId;
}

const forbidden = () => new DomainError('FORBIDDEN', 'You can only change jobs you created.');

@Injectable()
export class JobsService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** The count of candidates this person can see. An interviewer counts only their own. */
  private applicationCount(viewer: Viewer) {
    const onlyAssigned =
      viewer.role === 'interviewer'
        ? sql`AND EXISTS (
            SELECT 1 FROM application_assignments aa
            WHERE aa.application_id = a.id AND aa.user_id = ${viewer.userId})`
        : sql``;
    return sql<number>`(
      SELECT count(*)::int FROM applications a
      WHERE a.job_id = jobs.id AND a.company_id = jobs.company_id ${onlyAssigned}
    )`.as('applicationCount');
  }

  /** An interviewer can see a job only when one of its candidates is given to them. */
  private assignedOnly(viewer: Viewer) {
    return viewer.role === 'interviewer'
      ? sql<boolean>`EXISTS (
          SELECT 1 FROM applications a
          JOIN application_assignments aa ON aa.application_id = a.id
          WHERE a.job_id = jobs.id AND aa.user_id = ${viewer.userId})`
      : sql<boolean>`true`;
  }

  private present(viewer: Viewer, row: Selectable<JobsTable>, applicationCount: number): Job {
    const { companyId: _company, ...job } = row;
    return {
      ...job,
      publishedAt: job.publishedAt?.toISOString() ?? null,
      closedAt: job.closedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      applicationCount,
      canManage: canManage(viewer, row),
    };
  }

  async list(viewer: Viewer, query: ListJobs): Promise<Page<Job>> {
    let builder = this.db
      .selectFrom('jobs')
      .selectAll()
      .select(sql<string>`created_at::text`.as('cursorAt'))
      .select(this.applicationCount(viewer))
      .where('companyId', '=', viewer.companyId)
      .where(this.assignedOnly(viewer));
    if (query.status) builder = builder.where('status', '=', query.status);
    if (query.cursor) {
      const { at, id } = decodeCursor(query.cursor);
      builder = builder.where(sql<boolean>`(created_at, id) < (${at}::timestamptz, ${id}::uuid)`);
    }

    const rows = await builder
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(query.limit + 1)
      .execute();
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(({ cursorAt: _at, applicationCount, ...row }) =>
        this.present(viewer, row, applicationCount),
      ),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ at: last.cursorAt, id: last.id }) : null,
    };
  }

  async create(viewer: Viewer, input: CreateJob, ip: string | null): Promise<JobDetail> {
    const base = slugify(input.title, 'job');
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      try {
        return await this.insert(viewer, input, slug, ip);
      } catch (error) {
        if (!isUniqueViolation(error, SLUG_CONSTRAINT)) throw error;
      }
    }
    throw new DomainError('CONFLICT', 'Please try a different job title.');
  }

  private insert(viewer: Viewer, input: CreateJob, slug: string, ip: string | null) {
    return this.db.transaction().execute(async (tx) => {
      const job = await tx
        .insertInto('jobs')
        .values({
          ...input,
          slug,
          companyId: viewer.companyId,
          createdBy: viewer.userId,
          publishedAt: null,
          closedAt: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const stages = await tx
        .insertInto('pipelineStages')
        .values(
          DEFAULT_STAGES.map((stage, position) => ({
            ...stage,
            position,
            companyId: viewer.companyId,
            jobId: job.id,
            emailSubject: null,
            emailBody: null,
          })),
        )
        .returning(['id', 'name', 'position', 'kind', 'emailSubject', 'emailBody'])
        .execute();
      await this.recordChange(tx, viewer, 'job.created', job.id, ip);
      return { ...this.present(viewer, job, 0), stages };
    });
  }

  async get(viewer: Viewer, id: string): Promise<JobDetail> {
    const row = await this.db
      .selectFrom('jobs')
      .selectAll()
      .select(this.applicationCount(viewer))
      .where('companyId', '=', viewer.companyId)
      .where('id', '=', id)
      .where(this.assignedOnly(viewer))
      .executeTakeFirst();
    if (!row) throw notFound('Job');
    const { applicationCount, ...job } = row;
    return {
      ...this.present(viewer, job, applicationCount),
      stages: await this.stagesOf(this.db, viewer.companyId, id),
    };
  }

  private stagesOf(executor: Executor, companyId: string, jobId: string): Promise<PipelineStage[]> {
    return executor
      .selectFrom('pipelineStages')
      .select(['id', 'name', 'position', 'kind', 'emailSubject', 'emailBody'])
      .where('companyId', '=', companyId)
      .where('jobId', '=', jobId)
      .orderBy('position')
      .execute();
  }

  async listStages(viewer: Viewer, jobId: string): Promise<PipelineStage[]> {
    return (await this.get(viewer, jobId)).stages;
  }

  private async findManaged(tx: Executor, viewer: Viewer, id: string) {
    const job = await tx
      .selectFrom('jobs')
      .selectAll()
      .where('companyId', '=', viewer.companyId)
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!job) throw notFound('Job');
    if (!canManage(viewer, job)) throw forbidden();
    return job;
  }

  async update(viewer: Viewer, id: string, input: UpdateJob, ip: string | null) {
    await this.db.transaction().execute(async (tx) => {
      await this.findManaged(tx, viewer, id);
      await tx
        .updateTable('jobs')
        .set(input)
        .where('companyId', '=', viewer.companyId)
        .where('id', '=', id)
        .execute();
      await this.recordChange(tx, viewer, 'job.updated', id, ip);
    });
    return this.get(viewer, id);
  }

  async publish(viewer: Viewer, id: string, ip: string | null) {
    await this.db.transaction().execute(async (tx) => {
      const job = await this.findManaged(tx, viewer, id);
      if (job.status === 'open') throw new DomainError('CONFLICT', 'This job is already live.');
      await tx
        .updateTable('jobs')
        .set({ status: 'open', publishedAt: job.publishedAt ?? new Date(), closedAt: null })
        .where('companyId', '=', viewer.companyId)
        .where('id', '=', id)
        .execute();
      await this.recordChange(tx, viewer, 'job.published', id, ip);
    });
    return this.get(viewer, id);
  }

  async close(viewer: Viewer, id: string, ip: string | null) {
    await this.db.transaction().execute(async (tx) => {
      const job = await this.findManaged(tx, viewer, id);
      if (job.status !== 'open')
        throw new DomainError('CONFLICT', 'Only a live job can be closed.');
      await tx
        .updateTable('jobs')
        .set({ status: 'closed', closedAt: new Date() })
        .where('companyId', '=', viewer.companyId)
        .where('id', '=', id)
        .execute();
      await this.recordChange(tx, viewer, 'job.closed', id, ip);
    });
    return this.get(viewer, id);
  }

  async replaceStages(viewer: Viewer, jobId: string, input: ReplaceStages, ip: string | null) {
    try {
      return await this.db.transaction().execute(async (tx) => {
        await this.findManaged(tx, viewer, jobId);
        const current = await this.stagesOf(tx, viewer.companyId, jobId);
        const currentById = new Map(current.map((stage) => [stage.id, stage]));
        const counts = await this.candidateCounts(tx, viewer.companyId, jobId);

        for (const stage of input.stages) {
          if (!stage.id) continue;
          const existing = currentById.get(stage.id);
          if (!existing) throw notFound('Step');
          // People in a step were put there under its old meaning, such as with no reason.
          if (existing.kind !== stage.kind && counts.get(stage.id)) {
            throw new DomainError('CONFLICT', `Move the people out of "${existing.name}" first.`);
          }
        }

        const kept = new Set(input.stages.flatMap((stage) => (stage.id ? [stage.id] : [])));
        const removed = current.filter((stage) => !kept.has(stage.id));
        for (const stage of removed) {
          if (counts.get(stage.id)) {
            throw new DomainError('CONFLICT', `Move the people out of "${stage.name}" first.`);
          }
        }
        if (removed.length > 0) {
          await tx
            .deleteFrom('pipelineStages')
            .where('companyId', '=', viewer.companyId)
            .where('jobId', '=', jobId)
            .where(
              'id',
              'in',
              removed.map((stage) => stage.id),
            )
            .execute();
        }

        for (const [position, { id, ...stage }] of input.stages.entries()) {
          if (id) {
            await tx
              .updateTable('pipelineStages')
              .set({ ...stage, position })
              .where('companyId', '=', viewer.companyId)
              .where('id', '=', id)
              .execute();
          } else {
            await tx
              .insertInto('pipelineStages')
              .values({ ...stage, position, companyId: viewer.companyId, jobId })
              .execute();
          }
        }
        await this.recordChange(tx, viewer, 'job.stages_changed', jobId, ip);
        return this.stagesOf(tx, viewer.companyId, jobId);
      });
    } catch (error) {
      // A candidate moved into a step at the same moment it was being removed.
      if ((error as { code?: string }).code === '23503') {
        throw new DomainError('CONFLICT', 'Someone just moved a person into that step.');
      }
      throw error;
    }
  }

  private async candidateCounts(tx: Executor, companyId: string, jobId: string) {
    const rows = await tx
      .selectFrom('applications')
      .select(['stageId', (eb) => eb.fn.countAll<string>().as('total')])
      .where('companyId', '=', companyId)
      .where('jobId', '=', jobId)
      .groupBy('stageId')
      .execute();
    return new Map(rows.map((row) => [row.stageId, Number(row.total)]));
  }

  private recordChange(
    tx: Executor,
    viewer: Viewer,
    action: string,
    jobId: string,
    ip: string | null,
  ) {
    return this.audit.record(
      {
        companyId: viewer.companyId,
        actorId: viewer.userId,
        action,
        entityType: 'job',
        entityId: jobId,
        ip,
      },
      tx,
    );
  }
}
