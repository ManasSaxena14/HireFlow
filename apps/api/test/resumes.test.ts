import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_RESUMES_PER_USER, RESUME_PARSE_QUEUE } from '@hireflow/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signUp, type TestContext, type TestUser } from './helpers/app.js';

const RESUMES = '/api/v1/resumes';
const PDF = Buffer.from('%PDF-1.7\nA test resume\n');
const RESUME_TEXT = `Experience
Built APIs with NodeJS and Postgres.

Education
B.Tech

Skills
Docker

Projects
A chat app`;
const JOB_TEXT = `Backend Engineer

Requirements
- Node.js
- Kubernetes

About the team
We also use Docker every day in this role.`;

const uploadDir = join(tmpdir(), 'hireflow-test-uploads');

describe('resumes', () => {
  let ctx: TestContext;
  let user: TestUser;

  const upload = (who: TestUser, name = 'My Resume.pdf', content = PDF) =>
    ctx.http().post(RESUMES).set(who.auth).attach('resume', content, name);

  /** Does what the worker does, so these tests do not need it running. */
  const markRead = async (id: string, text = RESUME_TEXT) => {
    await ctx.db
      .updateTable('resumes')
      .set({ status: 'ready', parsedText: text })
      .where('id', '=', id)
      .execute();
  };

  const readyResume = async (who: TestUser, text?: string) => {
    const { body } = await upload(who).expect(201);
    await markRead(body.id, text);
    return body.id as string;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    user = await signUp(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('uploading', () => {
    it('needs a signed-in person', async () => {
      await ctx.http().get(RESUMES).expect(401);
      await ctx.http().post(RESUMES).attach('resume', PDF, 'a.pdf').expect(401);
    });

    it('saves the file, starts as pending and adds a job to read it', async () => {
      const owner = await signUp(ctx);
      const { body } = await upload(owner).expect(201);
      expect(body).toMatchObject({
        label: 'My Resume',
        originalName: 'My Resume.pdf',
        status: 'pending',
        parsedSkills: [],
        lastScore: null,
        sizeBytes: PDF.length,
      });
      expect(body.parsedText).toBeUndefined();
      expect(ctx.mail.jobs).toContainEqual({
        queue: RESUME_PARSE_QUEUE,
        data: { resumeId: body.id },
      });
      const list = await ctx.http().get(RESUMES).set(owner.auth).expect(200);
      expect(list.body.map((resume: { id: string }) => resume.id)).toEqual([body.id]);
    });

    it('uses the label given', async () => {
      const { body } = await ctx
        .http()
        .post(RESUMES)
        .set(user.auth)
        .field('label', 'For design jobs')
        .attach('resume', PDF, 'a.pdf')
        .expect(201);
      expect(body.label).toBe('For design jobs');
      await ctx.http().delete(`${RESUMES}/${body.id}`).set(user.auth).expect(204);
    });

    it('refuses a renamed program, a wrong name, no file and a file too big', async () => {
      await upload(user, 'resume.pdf', Buffer.from('MZ this is a program')).expect(400);
      await upload(user, 'resume.exe').expect(400);
      await ctx.http().post(RESUMES).set(user.auth).expect(400);
      await upload(user, 'big.pdf', Buffer.alloc(5 * 1024 * 1024 + 1, 'a')).expect(413);
    });

    it('cleans a file name that tries to leave the folder', async () => {
      const { body } = await upload(user, '../../etc/secret.pdf').expect(201);
      expect(body.originalName).toBe('secret.pdf');
      await ctx.http().delete(`${RESUMES}/${body.id}`).set(user.auth).expect(204);
    });

    it('stops at the limit, even with many uploads at once, and keeps no extra files', async () => {
      const owner = await signUp(ctx);
      const before = (await readdir(uploadDir)).length;
      const responses = await Promise.all(
        Array.from({ length: MAX_RESUMES_PER_USER + 2 }, () => upload(owner)),
      );
      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 201)).toHaveLength(MAX_RESUMES_PER_USER);
      expect(statuses.filter((status) => status === 409)).toHaveLength(2);
      expect((await readdir(uploadDir)).length).toBe(before + MAX_RESUMES_PER_USER);
    });
  });

  describe('keeping files private', () => {
    it('hides a resume from everyone else', async () => {
      const owner = await signUp(ctx);
      const stranger = await signUp(ctx);
      const id = await readyResume(owner);
      const path = `${RESUMES}/${id}`;
      await ctx.http().get(path).set(stranger.auth).expect(404);
      await ctx.http().get(`${path}/file`).set(stranger.auth).expect(404);
      await ctx.http().get(`${path}/matches`).set(stranger.auth).expect(404);
      await ctx.http().delete(path).set(stranger.auth).expect(404);
      await ctx
        .http()
        .post(`${path}/match`)
        .set(stranger.auth)
        .send({ jobDescription: JOB_TEXT })
        .expect(404);
      const list = await ctx.http().get(RESUMES).set(stranger.auth).expect(200);
      expect(list.body).toEqual([]);
    });

    it('gives the owner a working download link', async () => {
      const id = await readyResume(user);
      const { body } = await ctx.http().get(`${RESUMES}/${id}/file`).set(user.auth).expect(200);
      const file = await ctx.http().get(body.url).expect(200);
      expect(Buffer.from(file.body as Buffer).equals(PDF)).toBe(true);
      await ctx.http().delete(`${RESUMES}/${id}`).set(user.auth).expect(204);
    });

    it('deleting removes the rows, the checks and the file on disk', async () => {
      const owner = await signUp(ctx);
      const id = await readyResume(owner);
      await ctx
        .http()
        .post(`${RESUMES}/${id}/match`)
        .set(owner.auth)
        .send({ jobDescription: JOB_TEXT })
        .expect(201);
      const before = (await readdir(uploadDir)).length;

      await ctx.http().delete(`${RESUMES}/${id}`).set(owner.auth).expect(204);

      expect((await readdir(uploadDir)).length).toBe(before - 1);
      const matches = await ctx.db
        .selectFrom('resumeMatches')
        .select('id')
        .where('resumeId', '=', id)
        .execute();
      expect(matches).toEqual([]);
      await ctx.http().delete(`${RESUMES}/${id}`).set(owner.auth).expect(404);
    });
  });

  describe('checking against a job', () => {
    it('gives the report for pasted text, and saves it without the job text', async () => {
      const owner = await signUp(ctx);
      const id = await readyResume(owner);
      const { body } = await ctx
        .http()
        .post(`${RESUMES}/${id}/match`)
        .set(owner.auth)
        .send({ jobDescription: JOB_TEXT, jobLabel: 'Backend at Larkspur' })
        .expect(201);
      expect(body).toMatchObject({
        jobRef: 'Backend at Larkspur',
        matched: ['Node.js', 'Docker'],
        missing: ['Kubernetes'],
        sectionsFound: ['experience', 'education', 'skills', 'projects'],
        suggestions: [
          'The job asks for Kubernetes. Add it only if you have real experience with Kubernetes.',
        ],
      });
      expect(typeof body.score).toBe('number');
      expect(body.breakdown.coverage).toBeCloseTo(3 / 5, 3);
      expect(JSON.stringify(body)).not.toContain('every day');

      const list = await ctx.http().get(RESUMES).set(owner.auth).expect(200);
      expect(list.body[0].lastScore).toBe(body.score);
      const history = await ctx.http().get(`${RESUMES}/${id}/matches`).set(owner.auth).expect(200);
      expect(history.body).toEqual([body]);
    });

    it('gives the same score for the same inputs', async () => {
      const id = await readyResume(user);
      const run = () =>
        ctx
          .http()
          .post(`${RESUMES}/${id}/match`)
          .set(user.auth)
          .send({ jobDescription: JOB_TEXT })
          .expect(201);
      const first = await run();
      const second = await run();
      expect(second.body.score).toBe(first.body.score);
      expect(second.body.matched).toEqual(first.body.matched);
      expect(second.body.breakdown).toEqual(first.body.breakdown);
      await ctx.http().delete(`${RESUMES}/${id}`).set(user.auth).expect(204);
    });

    it('can use a job from the board, but only the person’s own', async () => {
      const owner = await signUp(ctx);
      const stranger = await signUp(ctx);
      const id = await readyResume(owner);
      const add = async (who: TestUser, fields: object) =>
        (
          await ctx
            .http()
            .post('/api/v1/tracker/applications')
            .set(who.auth)
            .send({ title: 'Backend', companyName: `Larkspur ${randomUUID()}`, ...fields })
            .expect(201)
        ).body;

      const job = await add(owner, { description: JOB_TEXT });
      const { body } = await ctx
        .http()
        .post(`${RESUMES}/${id}/match`)
        .set(owner.auth)
        .send({ trackedApplicationId: job.id })
        .expect(201);
      expect(body.trackedApplicationId).toBe(job.id);
      expect(body.jobRef).toBe(`Backend at ${job.companyName}`);
      expect(body.matched).toContain('Node.js');

      const others = await add(stranger, { description: JOB_TEXT });
      await ctx
        .http()
        .post(`${RESUMES}/${id}/match`)
        .set(owner.auth)
        .send({ trackedApplicationId: others.id })
        .expect(404);

      const empty = await add(owner, {});
      await ctx
        .http()
        .post(`${RESUMES}/${id}/match`)
        .set(owner.auth)
        .send({ trackedApplicationId: empty.id })
        .expect(400);
    });

    it('refuses bad input', async () => {
      const id = await readyResume(user);
      const path = `${RESUMES}/${id}/match`;
      for (const body of [
        {},
        { jobDescription: 'too short' },
        { jobDescription: JOB_TEXT, trackedApplicationId: randomUUID() },
        { jobDescription: 'x'.repeat(50_001) },
        { trackedApplicationId: 'nope' },
      ]) {
        await ctx.http().post(path).set(user.auth).send(body).expect(400);
      }
      await ctx.http().delete(`${RESUMES}/${id}`).set(user.auth).expect(204);
    });

    it('explains itself while the resume is not ready', async () => {
      const owner = await signUp(ctx);
      const { body } = await upload(owner).expect(201);
      const path = `${RESUMES}/${body.id}/match`;
      const waiting = await ctx
        .http()
        .post(path)
        .set(owner.auth)
        .send({ jobDescription: JOB_TEXT })
        .expect(409);
      expect(waiting.body.error.message).toContain('still reading');

      await ctx.db
        .updateTable('resumes')
        .set({ status: 'failed', parseError: 'No text' })
        .where('id', '=', body.id)
        .execute();
      const failed = await ctx
        .http()
        .post(path)
        .set(owner.auth)
        .send({ jobDescription: JOB_TEXT })
        .expect(409);
      expect(failed.body.error.message).toContain('could not read');
    });
  });
});
