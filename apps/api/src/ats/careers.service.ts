import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ApplyToJob, PublicJobDetail, PublicJobList } from '@hireflow/shared';
import { sql } from 'kysely';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { DomainError, notFound } from '../common/domain-error.js';
import { ConfigService } from '../config/config.service.js';
import { Database, isUniqueViolation, type Tx } from '../database/database.js';
import { FileStorage } from '../files/file-storage.js';
import { checkResume, type CheckedResume, type UploadedFile } from '../files/resume-check.js';
import { MailQueue } from '../queue/mail-queue.js';
import { CompanyLinks } from '../tracker/company-links.service.js';

const ONE_APPLICATION_CONSTRAINT = 'applications_job_id_candidate_id_key';
const PUBLIC_COLUMNS = [
  'jobs.title',
  'jobs.slug',
  'jobs.location',
  'jobs.employmentType',
  'jobs.remote',
  'jobs.skills',
  'jobs.publishedAt',
] as const;

@Injectable()
export class CareersService {
  constructor(
    private readonly db: Database,
    private readonly storage: FileStorage,
    private readonly mail: MailQueue,
    private readonly config: ConfigService,
    private readonly links: CompanyLinks,
  ) {}

  private async findCompany(slug: string) {
    const company = await this.db
      .selectFrom('companies')
      .select(['id', 'name', 'slug'])
      .where('slug', '=', slug)
      .where('careersEnabled', '=', true)
      .executeTakeFirst();
    if (!company) throw notFound('Company');
    return company;
  }

  async listJobs(slug: string, limit: number, cursor?: string): Promise<PublicJobList> {
    const company = await this.findCompany(slug);
    let builder = this.db
      .selectFrom('jobs')
      .select(PUBLIC_COLUMNS)
      .select(['jobs.id', sql<string>`jobs.published_at::text`.as('cursorAt')])
      .where('jobs.companyId', '=', company.id)
      .where('jobs.status', '=', 'open');
    if (cursor) {
      const { at, id } = decodeCursor(cursor);
      builder = builder.where(
        sql<boolean>`(jobs.published_at, jobs.id) < (${at}::timestamptz, ${id}::uuid)`,
      );
    }
    const rows = await builder
      .orderBy('jobs.publishedAt', 'desc')
      .orderBy('jobs.id', 'desc')
      .limit(limit + 1)
      .execute();
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      company: { name: company.name, slug: company.slug },
      items: pageRows.map(({ id: _id, cursorAt: _at, publishedAt, ...job }) => ({
        ...job,
        publishedAt: publishedAt?.toISOString() ?? null,
      })),
      nextCursor:
        rows.length > limit && last ? encodeCursor({ at: last.cursorAt, id: last.id }) : null,
    };
  }

  async getJob(slug: string, jobSlug: string): Promise<PublicJobDetail> {
    const company = await this.findCompany(slug);
    const job = await this.db
      .selectFrom('jobs')
      .select(PUBLIC_COLUMNS)
      .select('jobs.description')
      .where('jobs.companyId', '=', company.id)
      .where('jobs.slug', '=', jobSlug)
      .where('jobs.status', '=', 'open')
      .executeTakeFirst();
    if (!job) throw notFound('Job');
    return {
      company: { name: company.name, slug: company.slug },
      job: { ...job, publishedAt: job.publishedAt?.toISOString() ?? null },
    };
  }

  async apply(
    slug: string,
    jobSlug: string,
    input: ApplyToJob,
    file: UploadedFile | undefined,
    signedInUserId: string | null = null,
  ) {
    const resume = checkResume(file);
    let onYourBoard = false;
    const company = await this.findCompany(slug);
    const job = await this.db
      .selectFrom('jobs')
      .select(['id', 'title'])
      .where('companyId', '=', company.id)
      .where('slug', '=', jobSlug)
      .where('status', '=', 'open')
      .executeTakeFirst();
    if (!job) throw notFound('Job');

    const firstStage = await this.db
      .selectFrom('pipelineStages')
      .select('id')
      .where('companyId', '=', company.id)
      .where('jobId', '=', job.id)
      .orderBy('position')
      .limit(1)
      .executeTakeFirstOrThrow();

    // The random name means nothing the applicant typed ever reaches the file system.
    const storageKey = randomUUID();
    await this.storage.save(storageKey, resume.content);
    try {
      await this.db.transaction().execute(async (tx) => {
        const fileId = await this.insertFile(tx, company.id, storageKey, resume);
        const candidateId = await this.upsertCandidate(tx, company.id, input, fileId);
        const proven = await this.attachAccount(tx, candidateId, input.email, signedInUserId);
        const application = await tx
          .insertInto('applications')
          .values({
            companyId: company.id,
            jobId: job.id,
            candidateId,
            stageId: firstStage.id,
            resumeFileId: fileId,
            score: null,
            rejectionReason: null,
            decidedAt: null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await tx
          .insertInto('applicationStageEvents')
          .values({
            companyId: company.id,
            applicationId: application.id,
            fromStageId: null,
            toStageId: firstStage.id,
            actorId: null,
          })
          .execute();
        onYourBoard = proven;
        if (proven) await this.links.refresh(tx, application.id, 'applied');
        await this.mail.enqueue(
          {
            template: 'application-received',
            to: input.email,
            dedupeKey: `application-received:${application.id}`,
            name: input.fullName,
            jobTitle: job.title,
            companyName: company.name,
            link: `${this.config.env.APP_URL}/c/${company.slug}/jobs/${jobSlug}`,
          },
          tx,
        );
      });
    } catch (error) {
      await this.storage.remove(storageKey);
      if (isUniqueViolation(error, ONE_APPLICATION_CONSTRAINT)) {
        throw new DomainError('CONFLICT', 'You have already applied to this job.');
      }
      throw error;
    }
    return { jobTitle: job.title, companyName: company.name, onYourBoard };
  }

  /**
   * Links the candidate to an account, but only when the person proves they own the email:
   * they were signed in, the account's email is confirmed, and it is the one on the form.
   * The form itself is open to anyone, so an email alone proves nothing.
   */
  private async attachAccount(
    tx: Tx,
    candidateId: string,
    email: string,
    userId: string | null,
  ): Promise<boolean> {
    if (!userId) return false;
    const user = await tx
      .selectFrom('users')
      .select('id')
      .where('id', '=', userId)
      .where('isActive', '=', true)
      .where('emailVerifiedAt', 'is not', null)
      .where((eb) => eb(eb.fn('lower', ['email']), '=', email.toLowerCase()))
      .executeTakeFirst();
    if (!user) return false;
    await tx
      .updateTable('candidates')
      .set({ userId: user.id })
      .where('id', '=', candidateId)
      .where('userId', 'is', null)
      .execute();
    const candidate = await tx
      .selectFrom('candidates')
      .select('userId')
      .where('id', '=', candidateId)
      .executeTakeFirstOrThrow();
    return candidate.userId === user.id;
  }

  private async insertFile(
    tx: Tx,
    companyId: string,
    storageKey: string,
    resume: CheckedResume,
  ): Promise<string> {
    const file = await tx
      .insertInto('files')
      .values({
        ownerUserId: null,
        companyId,
        storageKey,
        originalName: resume.originalName,
        mimeType: resume.mimeType,
        sizeBytes: resume.content.length,
        sha256: createHash('sha256').update(resume.content).digest('hex'),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return file.id;
  }

  /**
   * This form is public and nobody proves they own the email. So a new form never changes
   * the name or details of someone already on file. It only fills in what is missing.
   */
  private async upsertCandidate(
    tx: Tx,
    companyId: string,
    input: ApplyToJob,
    fileId: string,
  ): Promise<string> {
    const { rows } = await sql<{ id: string }>`
      INSERT INTO candidates (company_id, full_name, email, phone, source, resume_file_id)
      VALUES (${companyId}, ${input.fullName}, ${input.email}, ${input.phone}, ${input.source}, ${fileId})
      ON CONFLICT (company_id, lower(email)) DO UPDATE SET
        phone = COALESCE(candidates.phone, EXCLUDED.phone),
        source = COALESCE(candidates.source, EXCLUDED.source),
        resume_file_id = COALESCE(candidates.resume_file_id, EXCLUDED.resume_file_id)
      RETURNING id
    `.execute(tx);
    return (rows[0] as { id: string }).id;
  }
}
