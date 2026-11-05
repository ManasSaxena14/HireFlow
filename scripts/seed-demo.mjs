// Adds a demo company with jobs and candidates, so the hiring screens have something to show.
// Run it again and it does nothing, because the demo company is already there.
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production') {
  console.error('The demo data is only for development.');
  process.exit(1);
}

const apiRoot = fileURLToPath(new URL('../apps/api/', import.meta.url));
const require = createRequire(`${apiRoot}package.json`);
const { Client } = require('pg');
const argon2 = require('argon2');

const PASSWORD = 'demo-password-123';
const COMPANY = { name: 'Northwind Labs', slug: 'northwind-labs' };
const TEAM = [
  { key: 'admin', name: 'Anika Rao', email: 'admin@northwind.example', role: 'admin' },
  { key: 'recruiter', name: 'Rohan Iyer', email: 'recruiter@northwind.example', role: 'recruiter' },
  {
    key: 'manager',
    name: 'Meera Shah',
    email: 'manager@northwind.example',
    role: 'hiring_manager',
  },
  {
    key: 'interviewer',
    name: 'Dev Kapoor',
    email: 'interviewer@northwind.example',
    role: 'interviewer',
  },
];
const STAGES = [
  ['New', 'applied'],
  ['First call', 'screening'],
  ['Interview', 'interview'],
  ['Offer', 'offer'],
  ['Hired', 'hired'],
  ['Not selected', 'rejected'],
];
const JOBS = [
  {
    title: 'Senior Backend Developer',
    slug: 'senior-backend-developer',
    location: 'Bengaluru',
    remote: true,
    type: 'Full time',
    skills: ['TypeScript', 'PostgreSQL', 'Node.js'],
    status: 'open',
    owner: 'recruiter',
    description:
      'You will build the services that power our product and keep them fast.\n\nYou will work with a small team, talk to customers and decide what to build next.',
    people: [
      ['Asha Menon', 'New'],
      ['Kabir Singh', 'New'],
      ['Nisha Pillai', 'New'],
      ['Arjun Nair', 'First call'],
      ['Sara Thomas', 'First call'],
      ['Vikram Joshi', 'Interview', { rating: 4, recommendation: 'yes', by: 'manager' }],
      ['Leela Bose', 'Offer', { rating: 5, recommendation: 'strong_yes', by: 'recruiter' }],
      ['Imran Khan', 'Hired', { rating: 5, recommendation: 'strong_yes', by: 'manager' }],
      ['Tanya Gill', 'Not selected', { reason: 'Looking for more backend experience.' }],
    ],
  },
  {
    title: 'Product Designer',
    slug: 'product-designer',
    location: 'Mumbai',
    remote: false,
    type: 'Full time',
    skills: ['Figma', 'User research'],
    status: 'open',
    owner: 'manager',
    description:
      'You will shape how people use our product, from the first sketch to the final screen.\n\nYou will sit with the team that builds it and test your ideas with real users.',
    people: [
      ['Pooja Reddy', 'New'],
      ['Ishaan Das', 'First call'],
      ['Mira Kapoor', 'Interview'],
    ],
  },
  {
    title: 'Sales Lead',
    slug: 'sales-lead',
    location: 'Delhi',
    remote: false,
    type: 'Full time',
    skills: ['Sales', 'Negotiation'],
    status: 'draft',
    owner: 'recruiter',
    description: 'You will start our sales team and find our first hundred customers.',
    people: [],
  },
];
const INTERVIEWER_GETS = ['Vikram Joshi', 'Mira Kapoor'];

// The smallest file that still counts as a PDF, which is all the demo needs.
const DEMO_RESUME = Buffer.from(
  '%PDF-1.4\n% Demo resume\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
);

const uploadDir = resolve(apiRoot, process.env.UPLOAD_DIR ?? 'uploads');
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const one = async (text, values) => (await client.query(text, values)).rows[0];

const existing = await one('SELECT id FROM companies WHERE slug = $1', [COMPANY.slug]);
if (existing) {
  console.log('The demo company is already there. Nothing to do.');
  await client.end();
  process.exit(0);
}

const savedFiles = [];
try {
  await client.query('BEGIN');
  const passwordHash = await argon2.hash(PASSWORD);
  const company = await one('INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id', [
    COMPANY.name,
    COMPANY.slug,
  ]);

  const users = {};
  for (const person of TEAM) {
    const user = await one(
      `INSERT INTO users (email, password_hash, full_name, email_verified_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (lower(email)) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [person.email, passwordHash, person.name],
    );
    users[person.key] = user.id;
    await client.query('INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, $3)', [
      company.id,
      user.id,
      person.role,
    ]);
  }

  await mkdir(uploadDir, { recursive: true });
  let daysAgo = 14;
  for (const job of JOBS) {
    const published = job.status === 'open';
    const { id: jobId } = await one(
      `INSERT INTO jobs (company_id, title, slug, description, location, employment_type, remote,
                         skills, status, created_by, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        company.id,
        job.title,
        job.slug,
        job.description,
        job.location,
        job.type,
        job.remote,
        job.skills,
        job.status,
        users[job.owner],
        published ? new Date() : null,
      ],
    );

    const stages = {};
    for (const [position, [name, kind]] of STAGES.entries()) {
      const stage = await one(
        `INSERT INTO pipeline_stages (company_id, job_id, name, position, kind)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [company.id, jobId, name, position, kind],
      );
      stages[name] = { id: stage.id, kind };
    }

    for (const [fullName, stageName, extra = {}] of job.people) {
      const email = `${fullName.toLowerCase().replace(/\s+/g, '.')}@example.com`;
      const appliedAt = new Date(Date.now() - daysAgo-- * 24 * 60 * 60 * 1000);

      const storageKey = randomUUID();
      await writeFile(join(uploadDir, storageKey), DEMO_RESUME);
      savedFiles.push(storageKey);
      const file = await one(
        `INSERT INTO files (company_id, storage_key, original_name, mime_type, size_bytes, sha256)
         VALUES ($1, $2, $3, 'application/pdf', $4, $5) RETURNING id`,
        [
          company.id,
          storageKey,
          `${fullName.replace(/\s+/g, '-')}-resume.pdf`,
          DEMO_RESUME.length,
          createHash('sha256').update(DEMO_RESUME).digest('hex'),
        ],
      );
      const candidate = await one(
        `INSERT INTO candidates (company_id, full_name, email, resume_file_id, source)
         VALUES ($1, $2, $3, $4, 'Careers page') RETURNING id`,
        [company.id, fullName, email, file.id],
      );

      const stage = stages[stageName];
      const decided = stage.kind === 'hired' || stage.kind === 'rejected';
      const application = await one(
        `INSERT INTO applications (company_id, job_id, candidate_id, stage_id, resume_file_id, score,
                                   rejection_reason, applied_at, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          company.id,
          jobId,
          candidate.id,
          stage.id,
          file.id,
          extra.rating ?? null,
          extra.reason ?? null,
          appliedAt,
          decided ? new Date() : null,
        ],
      );

      await client.query(
        `INSERT INTO application_stage_events (company_id, application_id, to_stage_id, created_at)
         VALUES ($1, $2, $3, $4)`,
        [company.id, application.id, stages.New.id, appliedAt],
      );
      if (stageName !== 'New') {
        await client.query(
          `INSERT INTO application_stage_events
             (company_id, application_id, from_stage_id, to_stage_id, actor_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [company.id, application.id, stages.New.id, stage.id, users.recruiter],
        );
      }
      if (extra.rating) {
        await client.query(
          `INSERT INTO scorecards (company_id, application_id, interviewer_id, rating, recommendation, comments)
           VALUES ($1, $2, $3, $4, $5, 'Clear thinker. Explained the work well.')`,
          [company.id, application.id, users[extra.by], extra.rating, extra.recommendation],
        );
        await client.query(
          `INSERT INTO comments (company_id, application_id, author_id, body)
           VALUES ($1, $2, $3, 'Please look at the last project on the resume.')`,
          [company.id, application.id, users.recruiter],
        );
      }
      if (INTERVIEWER_GETS.includes(fullName)) {
        await client.query(
          `INSERT INTO application_assignments (company_id, application_id, user_id, assigned_by)
           VALUES ($1, $2, $3, $4)`,
          [company.id, application.id, users.interviewer, users.recruiter],
        );
      }
    }
  }

  await client.query('COMMIT');
  console.log(`Demo data added. Careers page: /c/${COMPANY.slug}`);
  console.log(`Sign in with any of these. The password is ${PASSWORD}`);
  for (const person of TEAM) console.log(`  ${person.email} (${person.role})`);
} catch (error) {
  await client.query('ROLLBACK');
  await Promise.all(savedFiles.map((key) => rm(join(uploadDir, key), { force: true })));
  throw error;
} finally {
  await client.end();
}
