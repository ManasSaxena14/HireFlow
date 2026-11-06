import { Injectable } from '@nestjs/common';
import type {
  AssignInterviewer,
  AtsApplication,
  AtsApplicationDetail,
  Comment,
  CreateComment,
  CreateScorecard,
  ListCandidates,
  MoveCandidate,
  Page,
  ResumeLink,
  Scorecard,
} from '@hireflow/shared';
import { sql } from 'kysely';
import { PinoLogger } from 'nestjs-pino';
import type { Viewer } from '../common/access.js';
import { AuditService } from '../common/audit.service.js';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { DomainError, notFound } from '../common/domain-error.js';
import { ConfigService } from '../config/config.service.js';
import { Database, type Executor, isUniqueViolation } from '../database/database.js';
import { FileLinks } from '../files/file-links.js';
import { FileStorage } from '../files/file-storage.js';
import { MailQueue } from '../queue/mail-queue.js';

const SCORECARD_CONSTRAINT = 'scorecards_application_id_interviewer_id_key';

const toNumber = (value: string | null) => (value === null ? null : Number(value));

/** Fills in the words a recruiter can use in a step's email. */
function fillTemplate(text: string, values: { name: string; job: string; company: string }) {
  return text
    .replaceAll('{{name}}', values.name)
    .replaceAll('{{job}}', values.job)
    .replaceAll('{{company}}', values.company);
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
    private readonly mail: MailQueue,
    private readonly config: ConfigService,
    private readonly links: FileLinks,
    private readonly storage: FileStorage,
    private readonly logger: PinoLogger,
  ) {}

  /** An interviewer gets a 404 for other candidates, so they cannot tell who has applied. */
  private async findVisible(
    executor: Executor,
    viewer: Viewer,
    id: string,
    options: { lock?: boolean } = {},
  ) {
    let builder = executor
      .selectFrom('applications')
      .selectAll()
      .where('companyId', '=', viewer.companyId)
      .where('id', '=', id);
    if (viewer.role === 'interviewer') {
      builder = builder.where(
        sql<boolean>`EXISTS (
          SELECT 1 FROM application_assignments aa
          WHERE aa.application_id = applications.id AND aa.user_id = ${viewer.userId})`,
      );
    }
    if (options.lock) builder = builder.forUpdate();
    const row = await builder.executeTakeFirst();
    if (!row) throw notFound('Candidate');
    return row;
  }

  /** The average rating would show an interviewer how the others voted. */
  private visibleScore(viewer: Viewer, score: string | null) {
    return viewer.role === 'interviewer' ? null : toNumber(score);
  }

  async list(viewer: Viewer, query: ListCandidates): Promise<Page<AtsApplication>> {
    let builder = this.db
      .selectFrom('applications')
      .innerJoin('candidates', 'candidates.id', 'applications.candidateId')
      .innerJoin('jobs', 'jobs.id', 'applications.jobId')
      .innerJoin('pipelineStages', 'pipelineStages.id', 'applications.stageId')
      .select([
        'applications.id',
        'applications.jobId',
        'jobs.title as jobTitle',
        'applications.stageId',
        'pipelineStages.name as stageName',
        'pipelineStages.kind as stageKind',
        'applications.score',
        'applications.appliedAt',
        'applications.decidedAt',
        'candidates.id as candidateId',
        'candidates.fullName',
        'candidates.email',
      ])
      .select(sql<string>`applications.applied_at::text`.as('cursorAt'))
      .where('applications.companyId', '=', viewer.companyId);

    if (viewer.role === 'interviewer') {
      builder = builder.where(
        sql<boolean>`EXISTS (
          SELECT 1 FROM application_assignments aa
          WHERE aa.application_id = applications.id AND aa.user_id = ${viewer.userId})`,
      );
    }
    if (query.jobId) builder = builder.where('applications.jobId', '=', query.jobId);
    if (query.stageId) builder = builder.where('applications.stageId', '=', query.stageId);
    if (query.minScore !== undefined && viewer.role !== 'interviewer') {
      builder = builder.where(sql<boolean>`applications.score >= ${query.minScore}`);
    }
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
      builder = builder.where((eb) =>
        eb.or([
          eb('candidates.fullName', 'ilike', pattern),
          eb('candidates.email', 'ilike', pattern),
        ]),
      );
    }
    if (query.cursor) {
      const { at, id } = decodeCursor(query.cursor);
      builder = builder.where(
        sql<boolean>`(applications.applied_at, applications.id) < (${at}::timestamptz, ${id}::uuid)`,
      );
    }

    const rows = await builder
      .orderBy('applications.appliedAt', 'desc')
      .orderBy('applications.id', 'desc')
      .limit(query.limit + 1)
      .execute();
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map((row) => ({
        id: row.id,
        jobId: row.jobId,
        jobTitle: row.jobTitle,
        stageId: row.stageId,
        stageName: row.stageName,
        stageKind: row.stageKind,
        score: this.visibleScore(viewer, row.score),
        appliedAt: row.appliedAt.toISOString(),
        decidedAt: row.decidedAt?.toISOString() ?? null,
        candidate: { id: row.candidateId, fullName: row.fullName, email: row.email },
      })),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ at: last.cursorAt, id: last.id }) : null,
    };
  }

  async get(viewer: Viewer, id: string): Promise<AtsApplicationDetail> {
    const row = await this.findVisible(this.db, viewer, id);
    const { companyId } = viewer;

    const [candidate, job, stages, events, comments, scorecards, assignees, resume] =
      await Promise.all([
        this.db
          .selectFrom('candidates')
          .select(['id', 'fullName', 'email', 'phone', 'source'])
          .where('companyId', '=', companyId)
          .where('id', '=', row.candidateId)
          .executeTakeFirstOrThrow(),
        this.db
          .selectFrom('jobs')
          .select('title')
          .where('companyId', '=', companyId)
          .where('id', '=', row.jobId)
          .executeTakeFirstOrThrow(),
        this.db
          .selectFrom('pipelineStages')
          .select(['id', 'name', 'kind'])
          .where('companyId', '=', companyId)
          .where('jobId', '=', row.jobId)
          .orderBy('position')
          .execute(),
        this.db
          .selectFrom('applicationStageEvents as e')
          .leftJoin('pipelineStages as from', 'from.id', 'e.fromStageId')
          .leftJoin('pipelineStages as to', 'to.id', 'e.toStageId')
          .leftJoin('users', 'users.id', 'e.actorId')
          .select([
            'e.id',
            'from.name as fromStageName',
            'to.name as toStageName',
            'users.fullName as actorName',
            'e.createdAt',
          ])
          .where('e.companyId', '=', companyId)
          .where('e.applicationId', '=', id)
          .orderBy('e.createdAt', 'desc')
          .orderBy('e.id')
          .execute(),
        this.commentsOf(companyId, id),
        this.scorecardsOf(viewer, id),
        this.db
          .selectFrom('applicationAssignments')
          .innerJoin('users', 'users.id', 'applicationAssignments.userId')
          .select(['applicationAssignments.userId', 'users.fullName'])
          .where('applicationAssignments.companyId', '=', companyId)
          .where('applicationAssignments.applicationId', '=', id)
          .orderBy('users.fullName')
          .execute(),
        row.resumeFileId
          ? this.db
              .selectFrom('files')
              .select(['originalName', 'sizeBytes'])
              .where('companyId', '=', companyId)
              .where('id', '=', row.resumeFileId)
              .executeTakeFirst()
          : undefined,
      ]);

    const stage = stages.find(({ id: stageId }) => stageId === row.stageId);
    if (!stage) throw notFound('Candidate');

    return {
      id: row.id,
      jobId: row.jobId,
      jobTitle: job.title,
      stageId: row.stageId,
      stageName: stage.name,
      stageKind: stage.kind,
      score: this.visibleScore(viewer, row.score),
      appliedAt: row.appliedAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
      candidate,
      resume: resume ?? null,
      stages,
      events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      comments,
      scorecards,
      assignees,
    };
  }

  private async commentsOf(companyId: string, applicationId: string): Promise<Comment[]> {
    const rows = await this.db
      .selectFrom('comments')
      .innerJoin('users', 'users.id', 'comments.authorId')
      .select([
        'comments.id',
        'comments.body',
        'comments.authorId',
        'users.fullName as authorName',
        'comments.createdAt',
      ])
      .where('comments.companyId', '=', companyId)
      .where('comments.applicationId', '=', applicationId)
      .orderBy('comments.createdAt', 'desc')
      .execute();
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  /** Interviewers see only their own score, so the others' votes do not sway them. */
  private async scorecardsOf(viewer: Viewer, applicationId: string): Promise<Scorecard[]> {
    let builder = this.db
      .selectFrom('scorecards')
      .innerJoin('users', 'users.id', 'scorecards.interviewerId')
      .select([
        'scorecards.id',
        'scorecards.interviewerId',
        'users.fullName as interviewerName',
        'scorecards.rating',
        'scorecards.recommendation',
        'scorecards.comments',
        'scorecards.createdAt',
      ])
      .where('scorecards.companyId', '=', viewer.companyId)
      .where('scorecards.applicationId', '=', applicationId);
    if (viewer.role === 'interviewer') {
      builder = builder.where('scorecards.interviewerId', '=', viewer.userId);
    }
    const rows = await builder.orderBy('scorecards.createdAt', 'desc').execute();
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async move(viewer: Viewer, id: string, input: MoveCandidate, ip: string | null) {
    await this.db.transaction().execute(async (tx) => {
      const application = await this.findVisible(tx, viewer, id, { lock: true });
      const target = await tx
        .selectFrom('pipelineStages')
        .selectAll()
        .where('companyId', '=', viewer.companyId)
        .where('jobId', '=', application.jobId)
        .where('id', '=', input.toStageId)
        .executeTakeFirst();
      if (!target) throw notFound('Step');
      if (target.kind === 'rejected' && !input.reason) {
        const message = 'Please write why this person was not selected.';
        throw new DomainError('VALIDATION_ERROR', message, [{ path: 'reason', message }]);
      }
      if (target.id === application.stageId) return;

      const decided = target.kind === 'rejected' || target.kind === 'hired';
      await tx
        .updateTable('applications')
        .set({
          stageId: target.id,
          decidedAt: decided ? new Date() : null,
          rejectionReason: target.kind === 'rejected' ? (input.reason ?? null) : null,
        })
        .where('companyId', '=', viewer.companyId)
        .where('id', '=', id)
        .execute();
      const event = await tx
        .insertInto('applicationStageEvents')
        .values({
          companyId: viewer.companyId,
          applicationId: id,
          fromStageId: application.stageId,
          toStageId: target.id,
          actorId: viewer.userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.audit.record(
        {
          companyId: viewer.companyId,
          actorId: viewer.userId,
          action: 'application.moved',
          entityType: 'application',
          entityId: id,
          diff: { fromStageId: application.stageId, toStageId: target.id },
          ip,
        },
        tx,
      );
      if (target.emailSubject && target.emailBody) {
        await this.queueStageEmail(tx, viewer.companyId, application, target, event.id);
      }
    });
    return this.get(viewer, id);
  }

  private async queueStageEmail(
    tx: Executor,
    companyId: string,
    application: { candidateId: string; jobId: string },
    stage: { emailSubject: string | null; emailBody: string | null },
    eventId: string,
  ) {
    const details = await tx
      .selectFrom('candidates')
      .innerJoin('jobs', (join) =>
        join.on('jobs.id', '=', application.jobId).on('jobs.companyId', '=', companyId),
      )
      .innerJoin('companies', 'companies.id', 'jobs.companyId')
      .select([
        'candidates.fullName',
        'candidates.email',
        'jobs.title',
        'jobs.slug as jobSlug',
        'companies.name as companyName',
        'companies.slug as companySlug',
      ])
      .where('candidates.companyId', '=', companyId)
      .where('candidates.id', '=', application.candidateId)
      .executeTakeFirstOrThrow();
    const values = { name: details.fullName, job: details.title, company: details.companyName };
    await this.mail.enqueue(
      {
        template: 'stage-update',
        to: details.email,
        dedupeKey: `stage-update:${eventId}`,
        subject: fillTemplate(stage.emailSubject as string, values),
        body: fillTemplate(stage.emailBody as string, values),
        companyName: details.companyName,
        link: `${this.config.env.APP_URL}/c/${details.companySlug}/jobs/${details.jobSlug}`,
      },
      tx,
    );
  }

  async addComment(viewer: Viewer, id: string, input: CreateComment): Promise<Comment[]> {
    await this.findVisible(this.db, viewer, id);
    await this.db
      .insertInto('comments')
      .values({
        companyId: viewer.companyId,
        applicationId: id,
        authorId: viewer.userId,
        body: input.body,
      })
      .execute();
    return this.commentsOf(viewer.companyId, id);
  }

  async addScorecard(viewer: Viewer, id: string, input: CreateScorecard, ip: string | null) {
    try {
      await this.db.transaction().execute(async (tx) => {
        await this.findVisible(tx, viewer, id, { lock: true });
        const scorecard = await tx
          .insertInto('scorecards')
          .values({
            ...input,
            companyId: viewer.companyId,
            applicationId: id,
            interviewerId: viewer.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await tx
          .updateTable('applications')
          .set({
            score: sql<string>`(
              SELECT round(avg(rating), 2) FROM scorecards
              WHERE application_id = ${id} AND company_id = ${viewer.companyId}
            )`,
          })
          .where('companyId', '=', viewer.companyId)
          .where('id', '=', id)
          .execute();
        await this.audit.record(
          {
            companyId: viewer.companyId,
            actorId: viewer.userId,
            action: 'scorecard.submitted',
            entityType: 'scorecard',
            entityId: scorecard.id,
            ip,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error, SCORECARD_CONSTRAINT)) {
        throw new DomainError('CONFLICT', 'You already sent your score for this person.');
      }
      throw error;
    }
    return this.scorecardsOf(viewer, id);
  }

  async assign(viewer: Viewer, id: string, input: AssignInterviewer, ip: string | null) {
    await this.db.transaction().execute(async (tx) => {
      await this.findVisible(tx, viewer, id);
      const member = await tx
        .selectFrom('memberships')
        .select('userId')
        .where('companyId', '=', viewer.companyId)
        .where('userId', '=', input.userId)
        .executeTakeFirst();
      if (!member) throw notFound('Member');
      await tx
        .insertInto('applicationAssignments')
        .values({
          companyId: viewer.companyId,
          applicationId: id,
          userId: input.userId,
          assignedBy: viewer.userId,
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute();
      await this.recordAssignment(tx, viewer, 'application.assigned', id, input.userId, ip);
    });
    return this.get(viewer, id);
  }

  async unassign(viewer: Viewer, id: string, userId: string, ip: string | null) {
    await this.db.transaction().execute(async (tx) => {
      await this.findVisible(tx, viewer, id);
      await tx
        .deleteFrom('applicationAssignments')
        .where('companyId', '=', viewer.companyId)
        .where('applicationId', '=', id)
        .where('userId', '=', userId)
        .execute();
      await this.recordAssignment(tx, viewer, 'application.unassigned', id, userId, ip);
    });
    return this.get(viewer, id);
  }

  private recordAssignment(
    tx: Executor,
    viewer: Viewer,
    action: string,
    applicationId: string,
    userId: string,
    ip: string | null,
  ) {
    return this.audit.record(
      {
        companyId: viewer.companyId,
        actorId: viewer.userId,
        action,
        entityType: 'application',
        entityId: applicationId,
        diff: { userId },
        ip,
      },
      tx,
    );
  }

  async resumeLink(viewer: Viewer, id: string): Promise<ResumeLink> {
    const application = await this.findVisible(this.db, viewer, id);
    if (!application.resumeFileId) throw notFound('Resume');
    return this.links.create(application.resumeFileId);
  }

  /** Removes the person, their applications and their resumes. The log keeps only the id. */
  async deleteCandidate(viewer: Viewer, candidateId: string, ip: string | null): Promise<void> {
    const storageKeys = await this.db.transaction().execute(async (tx) => {
      const candidate = await tx
        .selectFrom('candidates')
        .select(['id', 'resumeFileId'])
        .where('companyId', '=', viewer.companyId)
        .where('id', '=', candidateId)
        .forUpdate()
        .executeTakeFirst();
      if (!candidate) throw notFound('Candidate');

      const applications = await tx
        .selectFrom('applications')
        .select('resumeFileId')
        .where('companyId', '=', viewer.companyId)
        .where('candidateId', '=', candidateId)
        .execute();
      const fileIds = [candidate.resumeFileId, ...applications.map((a) => a.resumeFileId)].filter(
        (fileId): fileId is string => fileId !== null,
      );

      // Their reminders go with the interviews.
      await tx
        .deleteFrom('interviews')
        .where('companyId', '=', viewer.companyId)
        .where('candidateId', '=', candidateId)
        .execute();
      await tx
        .deleteFrom('candidates')
        .where('companyId', '=', viewer.companyId)
        .where('id', '=', candidateId)
        .execute();
      const files =
        fileIds.length > 0
          ? await tx
              .deleteFrom('files')
              .where('companyId', '=', viewer.companyId)
              .where('id', 'in', fileIds)
              .returning('storageKey')
              .execute()
          : [];
      await this.audit.record(
        {
          companyId: viewer.companyId,
          actorId: viewer.userId,
          action: 'candidate.deleted',
          entityType: 'candidate',
          entityId: candidateId,
          ip,
        },
        tx,
      );
      return files.map((file) => file.storageKey);
    });

    // After the commit, so an undo can never leave a person whose file is already gone.
    for (const key of storageKeys) {
      await this.storage.remove(key).catch((err: unknown) => {
        this.logger.error({ err, key }, 'could not remove a resume file');
      });
    }
  }
}
