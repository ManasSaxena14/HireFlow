import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCompany,
  createTestApp,
  signUp,
  type TestContext,
  type TestUser,
} from './helpers/app.js';

const PDF = Buffer.from('%PDF-1.7\nA small test resume\n');
const DOCX = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('....[Content_Types].xml....word/document.xml....'),
]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
const PLAIN_ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(200, 1)]);

const JOB = {
  title: 'Backend Developer',
  description: 'Build and run the services that power our product.',
  location: 'Pune',
  remote: true,
  skills: ['TypeScript', 'PostgreSQL'],
};

interface Team {
  admin: TestUser;
  recruiter: TestUser;
  manager: TestUser;
  interviewer: TestUser;
}

interface Stage {
  id: string;
  name: string;
  kind: string;
}

describe('hiring', () => {
  let ctx: TestContext;
  let team: Team;
  let companyId: string;
  let companySlug: string;
  let outsider: TestUser;
  let otherCompanyId: string;

  const api = (cid = companyId) => `/api/v1/companies/${cid}`;

  const join = async (role: string, cid = companyId, owner = team?.admin): Promise<TestUser> => {
    const member = await signUp(ctx);
    await ctx
      .http()
      .post(`${api(cid)}/members`)
      .set(owner.auth)
      .send({ email: member.email, role })
      .expect(201);
    return member;
  };

  const createJob = async (by: TestUser = team.recruiter, title = JOB.title) => {
    const { body } = await ctx
      .http()
      .post(`${api()}/jobs`)
      .set(by.auth)
      .send({ ...JOB, title })
      .expect(201);
    return body as { id: string; slug: string; stages: Stage[] };
  };

  const openJob = async (title?: string) => {
    const job = await createJob(team.recruiter, title);
    await ctx.http().post(`${api()}/jobs/${job.id}/publish`).set(team.recruiter.auth).expect(200);
    return job;
  };

  const apply = (
    jobSlug: string,
    {
      email = `applicant-${randomUUID()}@example.com`,
      file = PDF,
      filename = 'resume.pdf',
      fullName = 'Asha Rao',
    }: { email?: string; file?: Buffer; filename?: string; fullName?: string } = {},
  ) =>
    ctx
      .http()
      .post(`/api/v1/public/companies/${companySlug}/jobs/${jobSlug}/apply`)
      .field('fullName', fullName)
      .field('email', email)
      .attach('resume', file, filename);

  const newApplication = async (job: { id: string; slug: string }, email?: string) => {
    await apply(job.slug, { email }).expect(201);
    const { body } = await ctx
      .http()
      .get(`${api()}/applications?jobId=${job.id}&limit=1`)
      .set(team.admin.auth)
      .expect(200);
    return body.items[0] as { id: string; stageId: string; candidate: { id: string } };
  };

  const stageOf = (job: { stages: Stage[] }, kind: string) =>
    job.stages.find((stage) => stage.kind === kind) as Stage;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await signUp(ctx);
    companyId = await createCompany(ctx, admin);
    const company = await ctx.http().get(api()).set(admin.auth).expect(200);
    companySlug = company.body.slug;
    team = { admin } as Team;
    team.recruiter = await join('recruiter');
    team.manager = await join('hiring_manager');
    team.interviewer = await join('interviewer');

    outsider = await signUp(ctx);
    otherCompanyId = await createCompany(ctx, outsider);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('jobs', () => {
    it('starts a job as a draft with the normal steps', async () => {
      const job = await createJob();
      expect(job).toMatchObject({ status: 'draft', slug: expect.stringContaining('backend') });
      expect(job.stages.map((stage) => stage.kind)).toEqual([
        'applied',
        'screening',
        'interview',
        'offer',
        'hired',
        'rejected',
      ]);
    });

    it('gives a second job with the same title its own link', async () => {
      const first = await createJob(team.recruiter, 'Same Title');
      const second = await createJob(team.recruiter, 'Same Title');
      expect(first.slug).toBe('same-title');
      expect(second.slug).toMatch(/^same-title-/);
    });

    it('checks the fields', async () => {
      const { body } = await ctx
        .http()
        .post(`${api()}/jobs`)
        .set(team.admin.auth)
        .send({ title: 'x', description: 'short' })
        .expect(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('lets a hiring manager change only their own jobs', async () => {
      const own = await createJob(team.manager, 'Manager job');
      const other = await createJob(team.recruiter, 'Recruiter job');
      await ctx
        .http()
        .patch(`${api()}/jobs/${own.id}`)
        .set(team.manager.auth)
        .send({ location: 'Delhi' })
        .expect(200);
      for (const call of [
        () => ctx.http().patch(`${api()}/jobs/${other.id}`).send({ location: 'Delhi' }),
        () => ctx.http().post(`${api()}/jobs/${other.id}/publish`),
        () => ctx.http().post(`${api()}/jobs/${other.id}/close`),
        () => ctx.http().put(`${api()}/jobs/${other.id}/stages`).send({ stages: other.stages }),
      ]) {
        await call().set(team.manager.auth).expect(403);
      }
      const read = await ctx.http().get(`${api()}/jobs/${other.id}`).set(team.manager.auth);
      expect(read.status).toBe(200);
      expect(read.body.canManage).toBe(false);
    });

    it('publishes and closes a job, and writes both to the audit log', async () => {
      const job = await createJob();
      await ctx.http().post(`${api()}/jobs/${job.id}/close`).set(team.admin.auth).expect(409);
      const open = await ctx
        .http()
        .post(`${api()}/jobs/${job.id}/publish`)
        .set(team.admin.auth)
        .expect(200);
      expect(open.body.status).toBe('open');
      expect(open.body.publishedAt).toBeTruthy();
      await ctx.http().post(`${api()}/jobs/${job.id}/publish`).set(team.admin.auth).expect(409);
      const closed = await ctx
        .http()
        .post(`${api()}/jobs/${job.id}/close`)
        .set(team.admin.auth)
        .expect(200);
      expect(closed.body.status).toBe('closed');

      const logs = await ctx.db
        .selectFrom('auditLogs')
        .select('action')
        .where('entityId', '=', job.id)
        .execute();
      expect(logs.map((log) => log.action)).toEqual(
        expect.arrayContaining(['job.published', 'job.closed']),
      );
    });

    it('pages through the job list', async () => {
      const { body: first } = await ctx
        .http()
        .get(`${api()}/jobs?limit=2`)
        .set(team.admin.auth)
        .expect(200);
      expect(first.items).toHaveLength(2);
      const { body: second } = await ctx
        .http()
        .get(`${api()}/jobs?limit=2&cursor=${first.nextCursor}`)
        .set(team.admin.auth)
        .expect(200);
      const ids = first.items.map((job: { id: string }) => job.id);
      for (const job of second.items) expect(ids).not.toContain(job.id);
    });
  });

  describe('steps of a job', () => {
    it('renames and reorders steps, and can add one', async () => {
      const job = await createJob();
      const [applied, screening, interview, ...rest] = job.stages as [
        Stage,
        Stage,
        Stage,
        ...Stage[],
      ];
      const { body } = await ctx
        .http()
        .put(`${api()}/jobs/${job.id}/stages`)
        .set(team.recruiter.auth)
        .send({
          stages: [
            applied,
            interview,
            { ...screening, name: 'Phone call' },
            { name: 'Task', kind: 'interview' },
            ...rest,
          ],
        })
        .expect(200);
      expect(body.map((stage: Stage) => stage.name)).toEqual([
        'New',
        'Interview',
        'Phone call',
        'Task',
        'Offer',
        'Hired',
        'Not selected',
      ]);
    });

    it('needs a first step for new people, a hired step and a rejected step', async () => {
      const job = await createJob();
      await ctx
        .http()
        .put(`${api()}/jobs/${job.id}/stages`)
        .set(team.recruiter.auth)
        .send({
          stages: [
            { name: 'One', kind: 'screening' },
            { name: 'Two', kind: 'applied' },
            { name: 'Three', kind: 'hired' },
          ],
        })
        .expect(400);
    });

    it('refuses to remove or change the type of a step that has people in it', async () => {
      const job = await openJob('Steps with people');
      await newApplication(job);
      const remaining = job.stages.filter((stage) => stage.kind !== 'screening');
      await ctx
        .http()
        .put(`${api()}/jobs/${job.id}/stages`)
        .set(team.recruiter.auth)
        .send({ stages: remaining })
        .expect(200);

      const [first, ...others] = remaining as [Stage, ...Stage[]];
      await ctx
        .http()
        .put(`${api()}/jobs/${job.id}/stages`)
        .set(team.recruiter.auth)
        .send({ stages: [{ name: 'New one', kind: 'applied' }, ...others] })
        .expect(409);
      await ctx
        .http()
        .put(`${api()}/jobs/${job.id}/stages`)
        .set(team.recruiter.auth)
        .send({
          stages: [
            { name: 'New one', kind: 'applied' },
            { ...first, kind: 'screening' },
            ...others,
          ],
        })
        .expect(409);
    });

    it('refuses a step from another job', async () => {
      const job = await createJob();
      const other = await createJob();
      await ctx
        .http()
        .put(`${api()}/jobs/${job.id}/stages`)
        .set(team.recruiter.auth)
        .send({ stages: [stageOf(other, 'applied'), ...job.stages.slice(1)] })
        .expect(404);
    });
  });

  describe('careers pages', () => {
    it('shows only open jobs, with no private fields', async () => {
      const open = await openJob('Open careers job');
      const draft = await createJob(team.recruiter, 'Draft careers job');

      const { body } = await ctx
        .http()
        .get(`/api/v1/public/companies/${companySlug}/jobs?limit=100`);
      const slugs = body.items.map((job: { slug: string }) => job.slug);
      expect(body.company.slug).toBe(companySlug);
      expect(slugs).toContain(open.slug);
      expect(slugs).not.toContain(draft.slug);

      const detail = await ctx
        .http()
        .get(`/api/v1/public/companies/${companySlug}/jobs/${open.slug}`)
        .expect(200);
      expect(detail.body.job.description).toBe(JOB.description);
      expect(detail.body.job).not.toHaveProperty('createdBy');
      expect(detail.body.job).not.toHaveProperty('id');
      expect(detail.body.company).not.toHaveProperty('id');

      await ctx
        .http()
        .get(`/api/v1/public/companies/${companySlug}/jobs/${draft.slug}`)
        .expect(404);
      await apply(draft.slug).expect(404);
    });

    it('hides everything when the company turns its careers page off', async () => {
      const owner = await signUp(ctx);
      const cid = await createCompany(ctx, owner);
      const company = await ctx.http().get(api(cid)).set(owner.auth).expect(200);
      await ctx.http().patch(api(cid)).set(owner.auth).send({ careersEnabled: false }).expect(200);
      await ctx.http().get(`/api/v1/public/companies/${company.body.slug}/jobs`).expect(404);
    });

    it('takes an application, confirms it by email and starts in the first step', async () => {
      const job = await openJob('Apply job');
      const email = `asha-${randomUUID()}@example.com`;
      const application = await newApplication(job, email);
      expect(application.stageId).toBe(stageOf(job, 'applied').id);
      expect(ctx.mail.sent.at(-1)).toMatchObject({
        template: 'application-received',
        to: email,
        jobTitle: 'Apply job',
      });

      const detail = await ctx
        .http()
        .get(`${api()}/applications/${application.id}`)
        .set(team.admin.auth)
        .expect(200);
      expect(detail.body.resume).toEqual({ originalName: 'resume.pdf', sizeBytes: PDF.length });
      expect(detail.body.events).toEqual([
        expect.objectContaining({ fromStageName: null, toStageName: 'New', actorName: null }),
      ]);
    });

    it('rejects a second application to the same job cleanly', async () => {
      const job = await openJob('Duplicate job');
      const email = `twice-${randomUUID()}@example.com`;
      await apply(job.slug, { email }).expect(201);
      const { body } = await apply(job.slug, { email: email.toUpperCase() }).expect(409);
      expect(body.error).toMatchObject({
        code: 'CONFLICT',
        message: 'You have already applied to this job.',
      });
      const files = await ctx.db
        .selectFrom('candidates')
        .select('id')
        .where('email', '=', email)
        .execute();
      expect(files).toHaveLength(1);
    });

    it('does not let a new form change the details of someone on file', async () => {
      const first = await openJob('Keep details one');
      const second = await openJob('Keep details two');
      const email = `keep-${randomUUID()}@example.com`;
      await apply(first.slug, { email, fullName: 'Real Name' }).expect(201);
      await apply(second.slug, { email, fullName: 'Fake Name' }).expect(201);
      const rows = await ctx.db
        .selectFrom('candidates')
        .select('fullName')
        .where('email', '=', email)
        .execute();
      expect(rows).toEqual([{ fullName: 'Real Name' }]);
    });

    it('accepts a PDF and a DOCX', async () => {
      const job = await openJob('Good files');
      await apply(job.slug, { file: PDF, filename: 'cv.PDF' }).expect(201);
      await apply(job.slug, { file: DOCX, filename: 'cv.docx' }).expect(201);
    });

    it.each([
      ['a renamed .exe', EXE, 'resume.pdf'],
      ['a .exe under its own name', EXE, 'setup.exe'],
      ['a plain zip named .docx', PLAIN_ZIP, 'resume.docx'],
      ['a PDF with the wrong ending', PDF, 'resume.exe'],
      ['text pretending to be a PDF', Buffer.from('hello there'), 'resume.pdf'],
    ])('rejects %s', async (_name, file, filename) => {
      const job = await openJob(`Bad file ${randomUUID().slice(0, 6)}`);
      const { body } = await apply(job.slug, { file, filename }).expect(400);
      expect(body.error.details).toEqual([
        { path: 'resume', message: 'Please upload a PDF or Word (.docx) file.' },
      ]);
    });

    it('rejects a file over 5 MB', async () => {
      const job = await openJob('Big file');
      const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
      const { body } = await apply(job.slug, { file: big }).expect(413);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('This file is too big. The limit is 5 MB.');
    });

    it('needs a resume and valid details', async () => {
      const job = await openJob('Missing resume');
      await ctx
        .http()
        .post(`/api/v1/public/companies/${companySlug}/jobs/${job.slug}/apply`)
        .field('fullName', 'Asha Rao')
        .field('email', 'asha@example.com')
        .expect(400);
      await ctx
        .http()
        .post(`/api/v1/public/companies/${companySlug}/jobs/${job.slug}/apply`)
        .field('fullName', 'A')
        .field('email', 'nope')
        .attach('resume', PDF, 'resume.pdf')
        .expect(400);
    });

    it('never uses the sent file name for the saved file', async () => {
      const job = await openJob('Path trick');
      await apply(job.slug, { filename: '../../../../etc/evil.pdf' }).expect(201);
      const file = await ctx.db
        .selectFrom('files')
        .select(['originalName', 'storageKey'])
        .orderBy('createdAt', 'desc')
        .executeTakeFirstOrThrow();
      expect(file.originalName).toBe('evil.pdf');
      expect(file.storageKey).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('resume downloads', () => {
    it('gives a signed link that works, and refuses a changed one', async () => {
      const job = await openJob('Download job');
      const application = await newApplication(job);
      const { body } = await ctx
        .http()
        .get(`${api()}/applications/${application.id}/resume`)
        .set(team.recruiter.auth)
        .expect(200);

      const file = await ctx.http().get(body.url).expect(200);
      expect(file.headers['content-type']).toContain('application/pdf');
      expect(file.headers['content-disposition']).toContain('attachment');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(file.body as Buffer).equals(PDF)).toBe(true);

      await ctx
        .http()
        .get(body.url.replace(/signature=.{4}/, 'signature=aaaa'))
        .expect(404);
      await ctx
        .http()
        .get(body.url.replace(/expires=\d+/, 'expires=99999999999999'))
        .expect(404);
      const past = body.url.replace(/expires=\d+/, `expires=${Date.now() - 1000}`);
      await ctx.http().get(past).expect(404);
    });
  });

  describe('moving candidates', () => {
    it('moves within a job, and logs it', async () => {
      const job = await openJob('Move job');
      const application = await newApplication(job);
      const { body } = await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.manager.auth)
        .send({ toStageId: stageOf(job, 'screening').id })
        .expect(200);
      expect(body.stageKind).toBe('screening');
      expect(body.events[0]).toMatchObject({ fromStageName: 'New', toStageName: 'First call' });

      const logs = await ctx.db
        .selectFrom('auditLogs')
        .select('action')
        .where('entityId', '=', application.id)
        .execute();
      expect(logs.map((log) => log.action)).toContain('application.moved');
    });

    it('refuses a step from another job with a 404', async () => {
      const job = await openJob('Move job A');
      const other = await openJob('Move job B');
      const application = await newApplication(job);
      await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.recruiter.auth)
        .send({ toStageId: stageOf(other, 'screening').id })
        .expect(404);
    });

    it('needs a reason to reject, and records the decision', async () => {
      const job = await openJob('Reject job');
      const application = await newApplication(job);
      const rejected = stageOf(job, 'rejected').id;
      const missing = await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.recruiter.auth)
        .send({ toStageId: rejected })
        .expect(400);
      expect(missing.body.error.details[0].path).toBe('reason');

      const { body } = await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.recruiter.auth)
        .send({ toStageId: rejected, reason: 'Needs more experience' })
        .expect(200);
      expect(body.rejectionReason).toBe('Needs more experience');
      expect(body.decidedAt).toBeTruthy();

      const back = await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.recruiter.auth)
        .send({ toStageId: stageOf(job, 'interview').id })
        .expect(200);
      expect(back.body.rejectionReason).toBeNull();
      expect(back.body.decidedAt).toBeNull();
    });

    it('sets the decision time when someone is hired', async () => {
      const job = await openJob('Hire job');
      const application = await newApplication(job);
      const { body } = await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.admin.auth)
        .send({ toStageId: stageOf(job, 'hired').id })
        .expect(200);
      expect(body.decidedAt).toBeTruthy();
    });

    it('writes nothing when the person is already in that step', async () => {
      const job = await openJob('Same step');
      const application = await newApplication(job);
      const { body } = await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.admin.auth)
        .send({ toStageId: application.stageId })
        .expect(200);
      expect(body.events).toHaveLength(1);
    });

    it('sends the step email only when the step has one, and fills in the words', async () => {
      const job = await openJob('Email job');
      const stages = job.stages.map((stage) =>
        stage.kind === 'screening'
          ? {
              ...stage,
              emailSubject: 'Next step for {{job}}',
              emailBody: 'Hi {{name}},\n\n{{company}} would like to talk.',
            }
          : stage,
      );
      await ctx
        .http()
        .put(`${api()}/jobs/${job.id}/stages`)
        .set(team.recruiter.auth)
        .send({ stages })
        .expect(200);
      const email = `email-${randomUUID()}@example.com`;
      const application = await newApplication(job, email);

      const before = ctx.mail.sent.length;
      await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.recruiter.auth)
        .send({ toStageId: stageOf(job, 'interview').id })
        .expect(200);
      expect(ctx.mail.sent).toHaveLength(before);

      await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.recruiter.auth)
        .send({ toStageId: stageOf(job, 'screening').id })
        .expect(200);
      expect(ctx.mail.sent.at(-1)).toMatchObject({
        template: 'stage-update',
        to: email,
        subject: 'Next step for Email job',
        body: expect.stringContaining('Hi Asha Rao,'),
      });
    });
  });

  describe('interviewers', () => {
    it('see only the candidates given to them', async () => {
      const job = await openJob('Interviewer job');
      const assigned = await newApplication(job);
      const hidden = await newApplication(job);
      const { interviewer } = team;

      await ctx.http().get(`${api()}/jobs/${job.id}`).set(interviewer.auth).expect(404);
      await ctx
        .http()
        .get(`${api()}/applications/${assigned.id}`)
        .set(interviewer.auth)
        .expect(404);

      await ctx
        .http()
        .post(`${api()}/applications/${assigned.id}/assignees`)
        .set(team.recruiter.auth)
        .send({ userId: interviewer.id })
        .expect(201);

      const list = await ctx
        .http()
        .get(`${api()}/applications?jobId=${job.id}`)
        .set(interviewer.auth)
        .expect(200);
      expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([assigned.id]);

      const jobs = await ctx
        .http()
        .get(`${api()}/jobs?limit=100`)
        .set(interviewer.auth)
        .expect(200);
      const shown = jobs.body.items.find((item: { id: string }) => item.id === job.id);
      expect(shown.applicationCount).toBe(1);
      await ctx.http().get(`${api()}/jobs/${job.id}/stages`).set(interviewer.auth).expect(200);

      for (const call of [
        () => ctx.http().get(`${api()}/applications/${hidden.id}`),
        () => ctx.http().get(`${api()}/applications/${hidden.id}/resume`),
        () => ctx.http().post(`${api()}/applications/${hidden.id}/comments`).send({ body: 'Hi' }),
        () =>
          ctx
            .http()
            .post(`${api()}/applications/${hidden.id}/scorecards`)
            .send({ rating: 3, recommendation: 'yes' }),
      ]) {
        await call().set(interviewer.auth).expect(404);
      }

      await ctx
        .http()
        .post(`${api()}/applications/${assigned.id}/comments`)
        .set(interviewer.auth)
        .send({ body: 'Good call today.' })
        .expect(201);

      await ctx
        .http()
        .delete(`${api()}/applications/${assigned.id}/assignees/${interviewer.id}`)
        .set(team.recruiter.auth)
        .expect(200);
      await ctx
        .http()
        .get(`${api()}/applications/${assigned.id}`)
        .set(interviewer.auth)
        .expect(404);
    });

    it('can only be given to someone in the company', async () => {
      const job = await openJob('Assign job');
      const application = await newApplication(job);
      await ctx
        .http()
        .post(`${api()}/applications/${application.id}/assignees`)
        .set(team.recruiter.auth)
        .send({ userId: outsider.id })
        .expect(404);
    });

    it('lose their candidates when they leave the company', async () => {
      const job = await openJob('Leaving job');
      const application = await newApplication(job);
      const leaving = await join('interviewer');
      await ctx
        .http()
        .post(`${api()}/applications/${application.id}/assignees`)
        .set(team.recruiter.auth)
        .send({ userId: leaving.id })
        .expect(201);
      await ctx.http().delete(`${api()}/members/${leaving.id}`).set(team.admin.auth).expect(204);
      await ctx
        .http()
        .post(`${api()}/members`)
        .set(team.admin.auth)
        .send({ email: leaving.email, role: 'interviewer' })
        .expect(201);
      await ctx.http().get(`${api()}/applications/${application.id}`).set(leaving.auth).expect(404);
    });
  });

  describe('scorecards', () => {
    it('allows one per person, and keeps the average score up to date', async () => {
      const job = await openJob('Score job');
      const application = await newApplication(job);
      const url = `${api()}/applications/${application.id}/scorecards`;
      await ctx
        .http()
        .post(url)
        .set(team.recruiter.auth)
        .send({ rating: 4, recommendation: 'yes', comments: 'Clear thinker' })
        .expect(201);
      const again = await ctx
        .http()
        .post(url)
        .set(team.recruiter.auth)
        .send({ rating: 5, recommendation: 'strong_yes' })
        .expect(409);
      expect(again.body.error.code).toBe('CONFLICT');
      await ctx
        .http()
        .post(url)
        .set(team.manager.auth)
        .send({ rating: 3, recommendation: 'no' })
        .expect(201);

      const detail = await ctx
        .http()
        .get(`${api()}/applications/${application.id}`)
        .set(team.admin.auth)
        .expect(200);
      expect(detail.body.score).toBe(3.5);
      expect(detail.body.scorecards).toHaveLength(2);

      const found = await ctx
        .http()
        .get(`${api()}/applications?jobId=${job.id}&minScore=3.5`)
        .set(team.admin.auth)
        .expect(200);
      expect(found.body.items).toHaveLength(1);
      const none = await ctx
        .http()
        .get(`${api()}/applications?jobId=${job.id}&minScore=4`)
        .set(team.admin.auth)
        .expect(200);
      expect(none.body.items).toHaveLength(0);

      const logs = await ctx.db
        .selectFrom('auditLogs')
        .select('action')
        .where('action', '=', 'scorecard.submitted')
        .execute();
      expect(logs.length).toBeGreaterThan(0);
    });

    it('checks the rating', async () => {
      const job = await openJob('Rating job');
      const application = await newApplication(job);
      await ctx
        .http()
        .post(`${api()}/applications/${application.id}/scorecards`)
        .set(team.admin.auth)
        .send({ rating: 9, recommendation: 'yes' })
        .expect(400);
    });

    it('hides the other votes and the average from an interviewer', async () => {
      const job = await openJob('Blind job');
      const application = await newApplication(job);
      const url = `${api()}/applications/${application.id}`;
      await ctx
        .http()
        .post(`${url}/assignees`)
        .set(team.recruiter.auth)
        .send({ userId: team.interviewer.id })
        .expect(201);
      await ctx
        .http()
        .post(`${url}/scorecards`)
        .set(team.recruiter.auth)
        .send({ rating: 5, recommendation: 'strong_yes' })
        .expect(201);

      const before = await ctx.http().get(url).set(team.interviewer.auth).expect(200);
      expect(before.body.scorecards).toEqual([]);
      expect(before.body.score).toBeNull();

      await ctx
        .http()
        .post(`${url}/scorecards`)
        .set(team.interviewer.auth)
        .send({ rating: 2, recommendation: 'no' })
        .expect(201);
      const after = await ctx.http().get(url).set(team.interviewer.auth).expect(200);
      expect(after.body.scorecards).toHaveLength(1);
      expect(after.body.scorecards[0].interviewerId).toBe(team.interviewer.id);
    });
  });

  describe('search', () => {
    it('finds people by name or email, and treats % as a normal letter', async () => {
      const job = await openJob('Search job');
      await apply(job.slug, {
        fullName: 'Zubin Mehta',
        email: `zubin-${randomUUID()}@example.com`,
      }).expect(201);
      await apply(job.slug, {
        fullName: 'Tara Das',
        email: `tara-${randomUUID()}@example.com`,
      }).expect(201);
      const find = async (q: string) => {
        const { body } = await ctx
          .http()
          .get(`${api()}/applications`)
          .query({ jobId: job.id, q })
          .set(team.admin.auth)
          .expect(200);
        return body.items.map(
          (item: { candidate: { fullName: string } }) => item.candidate.fullName,
        );
      };
      expect(await find('zubin')).toEqual(['Zubin Mehta']);
      expect(await find('tara-')).toEqual(['Tara Das']);
      expect(await find('%')).toEqual([]);
    });

    it('filters by step', async () => {
      const job = await openJob('Filter job');
      const application = await newApplication(job);
      await newApplication(job);
      const screening = stageOf(job, 'screening').id;
      await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.admin.auth)
        .send({ toStageId: screening })
        .expect(200);
      const { body } = await ctx
        .http()
        .get(`${api()}/applications?jobId=${job.id}&stageId=${screening}`)
        .set(team.admin.auth)
        .expect(200);
      expect(body.items.map((item: { id: string }) => item.id)).toEqual([application.id]);
    });
  });

  describe('deleting a candidate', () => {
    it('removes the person, their files and everything linked, and keeps only an id in the log', async () => {
      const job = await openJob('Delete job');
      const email = `gone-${randomUUID()}@example.com`;
      const application = await newApplication(job, email);
      const link = await ctx
        .http()
        .get(`${api()}/applications/${application.id}/resume`)
        .set(team.admin.auth)
        .expect(200);
      await ctx
        .http()
        .post(`${api()}/applications/${application.id}/comments`)
        .set(team.admin.auth)
        .send({ body: 'A note' })
        .expect(201);

      await ctx
        .http()
        .delete(`${api()}/candidates/${application.candidate.id}`)
        .set(team.admin.auth)
        .expect(204);

      await ctx
        .http()
        .get(`${api()}/applications/${application.id}`)
        .set(team.admin.auth)
        .expect(404);
      await ctx.http().get(link.body.url).expect(404);
      const left = await ctx.db
        .selectFrom('candidates')
        .select('id')
        .where('email', '=', email)
        .execute();
      expect(left).toHaveLength(0);

      const log = await ctx.db
        .selectFrom('auditLogs')
        .select(['action', 'diff'])
        .where('entityId', '=', application.candidate.id)
        .executeTakeFirstOrThrow();
      expect(log.action).toBe('candidate.deleted');
      expect(JSON.stringify(log)).not.toContain(email);
    });
  });

  describe('who can do what', () => {
    let job: { id: string; slug: string; stages: Stage[] };
    let fresh: { id: string; candidate: { id: string } };

    beforeAll(async () => {
      job = await openJob('Role matrix job');
    });

    const ALL = ['admin', 'recruiter', 'manager', 'interviewer'] as const;
    const HIRING = ['admin', 'recruiter', 'manager'] as const;
    type Who = (typeof ALL)[number];

    interface Route {
      name: string;
      method: 'get' | 'post' | 'patch' | 'put' | 'delete';
      path: () => string;
      body?: () => object;
      allowed: readonly Who[];
    }

    /** The routes that are limited by role. A role that is not listed must get a 403. */
    const ROUTES: Route[] = [
      { name: 'list jobs', method: 'get', path: () => '/jobs', allowed: ALL },
      {
        name: 'create a job',
        method: 'post',
        path: () => '/jobs',
        body: () => JOB,
        allowed: HIRING,
      },
      {
        name: 'edit a job',
        method: 'patch',
        path: () => `/jobs/${job.id}`,
        body: () => ({ location: 'Goa' }),
        allowed: ['admin', 'recruiter'],
      },
      { name: 'list members', method: 'get', path: () => '/members', allowed: HIRING },
      { name: 'list candidates', method: 'get', path: () => '/applications', allowed: ALL },
      {
        name: 'move a candidate',
        method: 'post',
        path: () => `/applications/${fresh.id}/move`,
        body: () => ({ toStageId: stageOf(job, 'screening').id }),
        allowed: HIRING,
      },
      {
        name: 'give a candidate to someone',
        method: 'post',
        path: () => `/applications/${fresh.id}/assignees`,
        body: () => ({ userId: team.recruiter.id }),
        allowed: HIRING,
      },
      {
        name: 'take a candidate from someone',
        method: 'delete',
        path: () => `/applications/${fresh.id}/assignees/${team.recruiter.id}`,
        allowed: HIRING,
      },
      {
        name: 'delete a candidate',
        method: 'delete',
        path: () => `/candidates/${fresh.candidate.id}`,
        allowed: ['admin'],
      },
    ];

    const expectedStatus = (route: Route, who: Who) => {
      return route.allowed.includes(who) ? undefined : 403;
    };

    for (const route of ROUTES) {
      for (const who of ALL) {
        it(`${who}: ${route.name}`, async () => {
          fresh = await newApplication(job);
          const response = await ctx
            .http()
            [route.method](`${api()}${route.path()}`)
            .set(team[who].auth)
            .send(route.body?.());
          const expected = expectedStatus(route, who);
          if (expected) expect(response.status).toBe(expected);
          else expect(response.status).toBeLessThan(300);
        });
      }
    }

    it('every route needs a login', async () => {
      const paths = [
        ['get', '/jobs'],
        ['post', '/jobs'],
        ['get', `/jobs/${randomUUID()}`],
        ['patch', `/jobs/${randomUUID()}`],
        ['post', `/jobs/${randomUUID()}/publish`],
        ['post', `/jobs/${randomUUID()}/close`],
        ['get', `/jobs/${randomUUID()}/stages`],
        ['put', `/jobs/${randomUUID()}/stages`],
        ['get', '/applications'],
        ['get', `/applications/${randomUUID()}`],
        ['post', `/applications/${randomUUID()}/move`],
        ['post', `/applications/${randomUUID()}/comments`],
        ['post', `/applications/${randomUUID()}/scorecards`],
        ['post', `/applications/${randomUUID()}/assignees`],
        ['delete', `/applications/${randomUUID()}/assignees/${randomUUID()}`],
        ['get', `/applications/${randomUUID()}/resume`],
        ['delete', `/candidates/${randomUUID()}`],
        ['get', '/members'],
      ] as const;
      for (const [method, path] of paths) {
        await ctx.http()[method](`${api()}${path}`).expect(401);
      }
    });
  });

  describe('other companies', () => {
    let job: { id: string; slug: string; stages: Stage[] };
    let application: { id: string; candidate: { id: string } };

    beforeAll(async () => {
      job = await openJob('Tenant job');
      application = await newApplication(job);
    });

    const routes = (): [string, 'get' | 'post' | 'patch' | 'put' | 'delete', string, object?][] => {
      const stage = stageOf(job, 'screening').id;
      return [
        ['read a job', 'get', `/jobs/${job.id}`],
        ['edit a job', 'patch', `/jobs/${job.id}`, { location: 'Goa' }],
        ['publish a job', 'post', `/jobs/${job.id}/publish`],
        ['close a job', 'post', `/jobs/${job.id}/close`],
        ['read steps', 'get', `/jobs/${job.id}/stages`],
        ['change steps', 'put', `/jobs/${job.id}/stages`, { stages: job.stages }],
        ['read a candidate', 'get', `/applications/${application.id}`],
        ['move a candidate', 'post', `/applications/${application.id}/move`, { toStageId: stage }],
        ['comment', 'post', `/applications/${application.id}/comments`, { body: 'Hi' }],
        [
          'send a score',
          'post',
          `/applications/${application.id}/scorecards`,
          { rating: 3, recommendation: 'yes' },
        ],
        [
          'give a candidate to someone',
          'post',
          `/applications/${application.id}/assignees`,
          { userId: outsider.id },
        ],
        [
          'take a candidate from someone',
          'delete',
          `/applications/${application.id}/assignees/${outsider.id}`,
        ],
        ['get a resume link', 'get', `/applications/${application.id}/resume`],
        ['delete a candidate', 'delete', `/candidates/${application.candidate.id}`],
      ];
    };

    it('cannot reach any data through this company', async () => {
      for (const [, method, path, body] of routes()) {
        await ctx.http()[method](`${api()}${path}`).set(outsider.auth).send(body).expect(404);
      }
      await ctx.http().get(`${api()}/jobs`).set(outsider.auth).expect(404);
      await ctx.http().get(`${api()}/applications`).set(outsider.auth).expect(404);
    });

    it('cannot reach this data by going through their own company', async () => {
      for (const [, method, path, body] of routes()) {
        await ctx
          .http()
          [method](`${api(otherCompanyId)}${path}`)
          .set(outsider.auth)
          .send(body)
          .expect(404);
      }
      const jobs = await ctx
        .http()
        .get(`${api(otherCompanyId)}/jobs`)
        .set(outsider.auth)
        .expect(200);
      expect(jobs.body.items).toEqual([]);
      const list = await ctx
        .http()
        .get(`${api(otherCompanyId)}/applications?jobId=${job.id}`)
        .set(outsider.auth)
        .expect(200);
      expect(list.body.items).toEqual([]);
    });

    it('cannot move a candidate into a step of another company', async () => {
      const { body: otherJob } = await ctx
        .http()
        .post(`${api(otherCompanyId)}/jobs`)
        .set(outsider.auth)
        .send(JOB)
        .expect(201);
      await ctx
        .http()
        .post(`${api()}/applications/${application.id}/move`)
        .set(team.admin.auth)
        .send({ toStageId: stageOf(otherJob, 'screening').id })
        .expect(404);
    });
  });
});
