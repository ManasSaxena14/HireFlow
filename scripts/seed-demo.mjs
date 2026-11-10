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

// Sign-in happens in Neon Auth, which wants each address confirmed with an emailed code. On your
// computer the local stand-in saves those emails in .mail-preview/, so the demo team uses made-up
// addresses. With the real Neon Auth, set DEMO_EMAIL=you@gmail.com and the team uses your inbox:
// you+hf-admin@gmail.com and so on.
const demoEmail = process.env.DEMO_EMAIL?.trim().toLowerCase();
if (demoEmail && !/^[^@+\s]+@[^@\s]+\.[^@\s]+$/.test(demoEmail)) {
  console.error('DEMO_EMAIL must be a plain address, like DEMO_EMAIL=you@gmail.com');
  process.exit(1);
}
const teamEmail = (key) => {
  if (!demoEmail) return `${key}@northwind.example`;
  const [name, domain] = demoEmail.split('@');
  return `${name}+hf-${key}@${domain}`;
};
const COMPANY = { name: 'Northwind Labs', slug: 'northwind-labs' };
const TEAM = [
  { key: 'admin', name: 'Anika Rao', email: teamEmail('admin'), role: 'admin' },
  { key: 'recruiter', name: 'Rohan Iyer', email: teamEmail('recruiter'), role: 'recruiter' },
  {
    key: 'manager',
    name: 'Meera Shah',
    email: teamEmail('manager'),
    role: 'hiring_manager',
  },
  {
    key: 'interviewer',
    name: 'Dev Kapoor',
    email: teamEmail('interviewer'),
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

/** Working hours for the team and one booked interview. Added once, even to an older demo. */
async function addDemoSchedule(companyId) {
  const { count } = await one('SELECT count(*) FROM availability_rules WHERE company_id = $1', [
    companyId,
  ]);
  if (Number(count) > 0) return false;

  const members = await client.query('SELECT user_id FROM memberships WHERE company_id = $1', [
    companyId,
  ]);
  for (const { user_id: userId } of members.rows) {
    await client.query(`UPDATE users SET timezone = 'Asia/Kolkata' WHERE id = $1`, [userId]);
    for (const weekday of [1, 2, 3, 4, 5]) {
      await client.query(
        `INSERT INTO availability_rules (company_id, user_id, weekday, start_time, end_time, timezone)
         VALUES ($1, $2, $3, '09:00', '18:00', 'Asia/Kolkata')`,
        [companyId, userId, weekday],
      );
    }
  }

  const person = await one(
    `SELECT a.id, a.candidate_id, c.full_name
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN pipeline_stages s ON s.id = a.stage_id
      WHERE a.company_id = $1 AND c.full_name = ANY($2) AND s.kind NOT IN ('rejected', 'hired')
      ORDER BY c.full_name
      LIMIT 1`,
    [companyId, INTERVIEWER_GETS],
  );
  const interviewer = await one('SELECT id FROM users WHERE lower(email) = lower($1)', [
    TEAM.find((member) => member.key === 'interviewer').email,
  ]);
  const recruiter = await one('SELECT id FROM users WHERE lower(email) = lower($1)', [
    TEAM.find((member) => member.key === 'recruiter').email,
  ]);
  if (!person) return true;

  // 05:30 UTC is 11:00 in India, at least two days from now on a work day.
  const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  while ([0, 6].includes(start.getUTCDay())) start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(5, 30, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const interview = await one(
    `INSERT INTO interviews (company_id, application_id, candidate_id, interviewer_id, during,
                             meeting_url, notes, created_by)
     VALUES ($1, $2, $3, $4, tstzrange($5, $6, '[)'), 'https://meet.example.com/demo',
             'Ask about the last project on the resume.', $7)
     RETURNING id`,
    [companyId, person.id, person.candidate_id, interviewer.id, start, end, recruiter.id],
  );
  for (const hours of [24, 1]) {
    await client.query(
      `INSERT INTO reminders (user_id, interview_id, kind, remind_at, message)
       VALUES ($1, $2, 'interview', $3, $4)`,
      [
        interviewer.id,
        interview.id,
        new Date(start.getTime() - hours * 60 * 60 * 1000),
        `Interview with ${person.full_name}.`,
      ],
    );
  }
  return true;
}

const existing = await one('SELECT id FROM companies WHERE slug = $1', [COMPANY.slug]);
if (existing) {
  const added = await addDemoSchedule(existing.id);
  console.log(
    added
      ? 'Added working hours and an interview to the demo company.'
      : 'The demo company is already there. Nothing to do.',
  );
  await client.end();
  process.exit(0);
}

const savedFiles = [];
try {
  await client.query('BEGIN');
  const company = await one('INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id', [
    COMPANY.name,
    COMPANY.slug,
  ]);

  const users = {};
  for (const person of TEAM) {
    const user = await one(
      `INSERT INTO users (email, full_name, email_verified_at)
       VALUES ($1, $2, now())
       ON CONFLICT (lower(email)) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [person.email, person.name],
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

  await addDemoSchedule(company.id);
  await client.query('COMMIT');
  console.log(`Demo data added. Careers page: /c/${COMPANY.slug}`);
  console.log('Sign up with any of these, confirm the code from the email, and you get its role:');
  for (const person of TEAM) console.log(`  ${person.email} (${person.role})`);
} catch (error) {
  await client.query('ROLLBACK');
  await Promise.all(savedFiles.map((key) => rm(join(uploadDir, key), { force: true })));
  throw error;
} finally {
  await client.end();
}
