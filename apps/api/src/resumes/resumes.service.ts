import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  MAX_RESUMES_PER_USER,
  type MatchResumeBody,
  RESUME_PARSE_QUEUE,
  type Resume,
  type ResumeMatch,
  type UploadResume,
} from '@hireflow/shared';
import { matchResume } from '@hireflow/shared/matcher';
import { sql } from 'kysely';
import { PinoLogger } from 'nestjs-pino';
import { DomainError, notFound } from '../common/domain-error.js';
import { Database } from '../database/database.js';
import { FileLinks } from '../files/file-links.js';
import { FileStorage } from '../files/file-storage.js';
import { checkResume, type UploadedFile } from '../files/resume-check.js';
import { MailQueue } from '../queue/mail-queue.js';

const MATCH_HISTORY = 20;
const EXTENSION = /\.(pdf|docx)$/i;

const MATCH_COLUMNS = [
  'id',
  'trackedApplicationId',
  'jobRef',
  'score',
  'matched',
  'missing',
  'sectionsFound',
  'suggestions',
  'breakdown',
  'createdAt',
] as const;

/** PostgreSQL gives numeric columns back as text. */
const presentMatch = <T extends { score: string }>(row: T) => ({
  ...row,
  score: Number(row.score),
});

@Injectable()
export class ResumesService {
  constructor(
    private readonly db: Database,
    private readonly storage: FileStorage,
    private readonly links: FileLinks,
    private readonly queue: MailQueue,
    private readonly logger: PinoLogger,
  ) {}

  /** The text stays out of this list. Only the person's own match check reads it. */
  private resumeRows(userId: string) {
    return this.db
      .selectFrom('resumes as r')
      .innerJoin('files as f', 'f.id', 'r.fileId')
      .select([
        'r.id',
        'r.label',
        'r.status',
        'r.parseError',
        'r.parsedSkills',
        'f.originalName',
        'f.sizeBytes',
        'r.createdAt',
      ])
      .select(
        sql<string | null>`(
          SELECT m.score FROM resume_matches m
           WHERE m.resume_id = r.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
        )`.as('lastScore'),
      )
      .where('r.userId', '=', userId);
  }

  async list(userId: string): Promise<Resume[]> {
    const rows = await this.resumeRows(userId)
      .orderBy('r.createdAt', 'desc')
      .orderBy('r.id', 'desc')
      .execute();
    return rows.map((row) => this.present(row));
  }

  async get(userId: string, id: string): Promise<Resume> {
    const row = await this.resumeRows(userId).where('r.id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Resume');
    return this.present(row);
  }

  private present<T extends { lastScore: string | null; createdAt: Date }>(row: T) {
    return {
      ...row,
      lastScore: row.lastScore === null ? null : Number(row.lastScore),
    } as unknown as Resume;
  }

  async upload(userId: string, input: UploadResume, file: UploadedFile | undefined) {
    const resume = checkResume(file);
    // The random name means nothing the person typed ever reaches the file system.
    const storageKey = randomUUID();
    await this.storage.save(storageKey, resume.content);
    try {
      const id = await this.db.transaction().execute(async (tx) => {
        // Holding the person's row means two uploads at once cannot both pass the limit.
        await tx.selectFrom('users').select('id').where('id', '=', userId).forUpdate().execute();
        const { count } = await tx
          .selectFrom('resumes')
          .select(sql<number>`count(*)::int`.as('count'))
          .where('userId', '=', userId)
          .executeTakeFirstOrThrow();
        if (count >= MAX_RESUMES_PER_USER) {
          throw new DomainError(
            'CONFLICT',
            `You can keep up to ${MAX_RESUMES_PER_USER} resumes. Delete one to add another.`,
          );
        }
        const stored = await tx
          .insertInto('files')
          .values({
            ownerUserId: userId,
            companyId: null,
            storageKey,
            originalName: resume.originalName,
            mimeType: resume.mimeType,
            sizeBytes: resume.content.length,
            sha256: createHash('sha256').update(resume.content).digest('hex'),
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        const row = await tx
          .insertInto('resumes')
          .values({
            userId,
            fileId: stored.id,
            label: input.label ?? resume.originalName.replace(EXTENSION, '').slice(0, 80),
            parseError: null,
            parsedText: null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await this.queue.enqueueJob(RESUME_PARSE_QUEUE, { resumeId: row.id }, tx);
        return row.id;
      });
      return await this.get(userId, id);
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const storageKey = await this.db.transaction().execute(async (tx) => {
      const resume = await tx
        .deleteFrom('resumes')
        .where('id', '=', id)
        .where('userId', '=', userId)
        .returning('fileId')
        .executeTakeFirst();
      if (!resume) throw notFound('Resume');
      const file = await tx
        .deleteFrom('files')
        .where('id', '=', resume.fileId)
        .returning('storageKey')
        .executeTakeFirstOrThrow();
      return file.storageKey;
    });
    try {
      await this.storage.remove(storageKey);
    } catch (err) {
      // The rows are gone and the person is done. A stray file should not look like a failure.
      this.logger.error({ err, resumeId: id }, 'could not remove a resume file');
    }
  }

  async fileLink(userId: string, id: string) {
    const resume = await this.db
      .selectFrom('resumes')
      .select('fileId')
      .where('id', '=', id)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!resume) throw notFound('Resume');
    return this.links.create(resume.fileId);
  }

  async listMatches(userId: string, id: string): Promise<ResumeMatch[]> {
    await this.get(userId, id);
    const rows = await this.db
      .selectFrom('resumeMatches')
      .select(MATCH_COLUMNS)
      .where('resumeId', '=', id)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(MATCH_HISTORY)
      .execute();
    return rows.map(presentMatch) as unknown as ResumeMatch[];
  }

  /** The job text is used for the score and not saved, because it may be long or private. */
  async match(userId: string, id: string, input: MatchResumeBody): Promise<ResumeMatch> {
    const resume = await this.db
      .selectFrom('resumes')
      .select(['status', 'parsedText'])
      .where('id', '=', id)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!resume) throw notFound('Resume');
    if (resume.status === 'pending') {
      throw new DomainError('CONFLICT', 'We are still reading this resume. Try again in a moment.');
    }
    if (resume.status === 'failed' || !resume.parsedText) {
      throw new DomainError(
        'CONFLICT',
        'We could not read this resume, so we cannot check it. Please upload it again.',
      );
    }

    const job = input.trackedApplicationId
      ? await this.trackedJob(userId, input.trackedApplicationId)
      : { text: input.jobDescription as string, ref: input.jobLabel || 'A job you pasted' };
    const result = matchResume(resume.parsedText, job.text);

    const row = await this.db
      .insertInto('resumeMatches')
      .values({
        resumeId: id,
        trackedApplicationId: input.trackedApplicationId ?? null,
        jobRef: job.ref,
        score: result.score,
        matched: result.matched,
        missing: result.missing,
        sectionsFound: result.sectionsFound,
        suggestions: result.suggestions,
        breakdown: JSON.stringify(result.breakdown),
      })
      .returning(MATCH_COLUMNS)
      .executeTakeFirstOrThrow();
    return presentMatch(row) as unknown as ResumeMatch;
  }

  private async trackedJob(userId: string, applicationId: string) {
    const job = await this.db
      .selectFrom('trackedApplications')
      .select(['title', 'companyName', 'description', 'skills'])
      .where('id', '=', applicationId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!job) throw notFound('Job');
    if (!job.description && job.skills.length === 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'This job has no description to compare. Add one on your board, or paste it here.',
        [{ path: 'trackedApplicationId', message: 'This job has no description' }],
      );
    }
    return {
      text: [job.title, job.description ?? '', job.skills.join(', ')].join('\n'),
      ref: `${job.title} at ${job.companyName}`,
    };
  }
}
