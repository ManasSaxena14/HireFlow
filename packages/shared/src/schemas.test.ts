import { applyToJobSchema, listCandidatesSchema, replaceStagesSchema } from './ats.js';
import { describe, expect, it } from 'vitest';
import { registerSchema, updateProfileSchema } from './auth.js';
import { createCompanySchema } from './company.js';
import {
  createApplicationSchema,
  createReminderSchema,
  listApplicationsSchema,
  updateApplicationSchema,
} from './tracker.js';

describe('registerSchema', () => {
  it('normalises the email', () => {
    const parsed = registerSchema.parse({
      email: '  Riya@Example.COM ',
      password: 'long-enough-password',
      fullName: ' Riya ',
    });
    expect(parsed.email).toBe('riya@example.com');
    expect(parsed.fullName).toBe('Riya');
  });

  it('rejects a short password', () => {
    const result = registerSchema.safeParse({
      email: 'a@example.com',
      password: 'short',
      fullName: 'A',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('rejects an unknown time zone and an empty update', () => {
    expect(updateProfileSchema.safeParse({ timezone: 'Not/AZone' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ timezone: 'Asia/Kolkata' }).success).toBe(true);
  });
});

describe('createCompanySchema', () => {
  it('only accepts URL-safe slugs', () => {
    expect(createCompanySchema.safeParse({ name: 'Acme', slug: 'acme-labs' }).success).toBe(true);
    expect(createCompanySchema.safeParse({ name: 'Acme', slug: 'Acme Labs!' }).success).toBe(false);
  });
});

describe('createApplicationSchema', () => {
  const base = { title: 'Engineer', companyName: 'Acme' };

  it('turns blank optional fields into null', () => {
    const parsed = createApplicationSchema.parse({ ...base, location: '  ', jobUrl: '' });
    expect(parsed.location).toBeNull();
    expect(parsed.jobUrl).toBeNull();
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'example.com'])(
    'refuses %s as a job link',
    (jobUrl) => {
      expect(createApplicationSchema.safeParse({ ...base, jobUrl }).success).toBe(false);
    },
  );

  it('requires the salary range to be in order', () => {
    expect(createApplicationSchema.safeParse({ ...base, salaryMin: 9, salaryMax: 3 }).success).toBe(
      false,
    );
    expect(createApplicationSchema.safeParse({ ...base, salaryMin: 3, salaryMax: 9 }).success).toBe(
      true,
    );
  });

  it('uppercases the currency', () => {
    expect(createApplicationSchema.parse({ ...base, currency: 'inr' }).currency).toBe('INR');
  });
});

describe('updateApplicationSchema', () => {
  it('refuses an empty update and never accepts a status', () => {
    expect(updateApplicationSchema.safeParse({}).success).toBe(false);
    const parsed = updateApplicationSchema.parse({ title: 'New', status: 'offer' });
    expect(parsed).toEqual({ title: 'New' });
  });
});

describe('createReminderSchema', () => {
  it('refuses a time in the past', () => {
    const result = createReminderSchema.safeParse({
      remindAt: '2020-01-01T00:00:00Z',
      message: 'Too late',
    });
    expect(result.success).toBe(false);
  });
});

describe('listApplicationsSchema', () => {
  it('applies defaults and limits', () => {
    expect(listApplicationsSchema.parse({}).limit).toBe(20);
    expect(listApplicationsSchema.parse({ archived: 'true' }).archived).toBe(true);
    expect(listApplicationsSchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('hiring schemas', () => {
  const stages = (kinds: string[]) => ({
    stages: kinds.map((kind, index) => ({ name: `Step ${index}`, kind })),
  });

  it('needs a first step for new people, a hired step and a rejected step', () => {
    expect(replaceStagesSchema.safeParse(stages(['applied', 'hired', 'rejected'])).success).toBe(
      true,
    );
    expect(replaceStagesSchema.safeParse(stages(['hired', 'applied', 'rejected'])).success).toBe(
      false,
    );
    expect(
      replaceStagesSchema.safeParse(stages(['applied', 'screening', 'rejected'])).success,
    ).toBe(false);
    expect(replaceStagesSchema.safeParse(stages(['applied', 'hired', 'offer'])).success).toBe(
      false,
    );
  });

  it('needs both parts of a step email, on one subject line', () => {
    const withEmail = (emailSubject: string | null, emailBody: string | null) => ({
      stages: [
        { name: 'New', kind: 'applied', emailSubject, emailBody },
        { name: 'Hired', kind: 'hired' },
        { name: 'No', kind: 'rejected' },
      ],
    });
    expect(replaceStagesSchema.safeParse(withEmail('Hello', 'Body')).success).toBe(true);
    expect(replaceStagesSchema.safeParse(withEmail('Hello', null)).success).toBe(false);
    expect(replaceStagesSchema.safeParse(withEmail(null, 'Body')).success).toBe(false);
    expect(replaceStagesSchema.safeParse(withEmail('Two\nlines', 'Body')).success).toBe(false);
  });

  it('cleans up the apply form', () => {
    const parsed = applyToJobSchema.parse({
      fullName: ' Asha Rao ',
      email: ' ASHA@Example.com ',
      phone: '',
    });
    expect(parsed).toEqual({
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      phone: null,
      source: null,
    });
  });

  it('turns a typed-in score filter into a number and limits it', () => {
    expect(listCandidatesSchema.parse({ minScore: '3.5' }).minScore).toBe(3.5);
    expect(listCandidatesSchema.safeParse({ minScore: '9' }).success).toBe(false);
  });
});
