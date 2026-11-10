// Takes the pictures used in the README, from an app that is running on this computer.
// It adds a sample person with some jobs and a resume, takes the pictures, and removes that
// person again. It only works against localhost, so it can never touch a live site.
//   Start the app and add the demo company first:  pnpm dev   and   pnpm db:seed
//   Then run:                                       pnpm screenshots
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const BASE = process.env.SCREENSHOT_URL ?? 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error('This script only runs against localhost.');
  process.exit(1);
}

const root = new URL('../', import.meta.url);
const requireFrom = (pkg) => createRequire(new URL(`${pkg}/package.json`, root));
const { chromium } = requireFrom('apps/web')('@playwright/test');
const { Client } = requireFrom('apps/api')('pg');

const OUT = fileURLToPath(new URL('docs/images/', root));
mkdirSync(OUT, { recursive: true });

const PASSWORD = 'sample-person-pass-1';
const DEMO_PASSWORD = 'demo-password-123';
const email = 'riya.menon@example.com';
const API = `${BASE}/api/v1`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The dev servers restart themselves while they compile, so a try that fails is repeated. */
async function call(path, { token, method = 'GET', body, form } = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(API + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    }).catch(() => null);
    const text = response ? await response.text() : '';
    if ((!response || response.status >= 500) && attempt < 20) {
      await sleep(3000);
      continue;
    }
    if (!response) throw new Error(`${method} ${path} could not reach the app`);
    if (!response.ok) throw new Error(`${method} ${path} gave ${response.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  }
}

async function waitForApp() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ready = await fetch(`${API}/ready`).catch(() => null);
    if (ready?.ok) return;
    await sleep(3000);
  }
  throw new Error('The app is not running. Start it with pnpm dev.');
}

const login = async (address, password) =>
  (await call('/auth/login', { method: 'POST', body: { email: address, password } })).accessToken;

/** A small real PDF, with the text a resume would have. */
function makePdf(lines) {
  const escape = (line) => line.replace(/([\\()])/g, '\\$1');
  const stream = `BT /F1 12 Tf 14 TL 50 750 Td ${lines.map((line) => `(${escape(line)}) Tj T*`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const at = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return at;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const JOBS = [
  ['Senior Backend Engineer', 'Larkspur', 'Remote', 'saved'],
  ['Platform Engineer', 'Northpoint', 'Berlin', 'saved'],
  ['Full Stack Developer', 'Brightwave', 'London', 'applied'],
  ['Backend Developer', 'Cobalt Systems', 'Pune', 'applied'],
  ['Software Engineer', 'Tessera', 'Remote', 'applied'],
  ['Staff Engineer', 'Helio', 'Amsterdam', 'screening'],
  ['Backend Engineer', 'Quill', 'Remote', 'screening'],
  ['Senior Software Engineer', 'Marlow', 'Dublin', 'interview'],
  ['Engineering Lead', 'Fernhill', 'Remote', 'interview'],
  ['Principal Engineer', 'Aster', 'Singapore', 'offer'],
  ['Backend Developer', 'Orchid Labs', 'Mumbai', 'rejected'],
];

const JOB_TEXT = `Senior Backend Engineer

About the team
You will build the services behind our hiring platform, and work closely with design and product.

Requirements
- Strong experience with Node.js and TypeScript
- Solid knowledge of PostgreSQL and good data modelling
- Experience with Docker and Kubernetes
- Comfortable with REST APIs and testing

Nice to have
- Kafka or another queue
- AWS`;

async function removeSamplePerson() {
  if (!process.env.DATABASE_URL) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('DELETE FROM users WHERE email = $1', [email]);
  await client.end();
}

async function seedSamplePerson() {
  await removeSamplePerson();
  await call('/auth/register', {
    method: 'POST',
    body: { email, password: PASSWORD, fullName: 'Riya Menon' },
  });
  const token = await login(email, PASSWORD);
  for (const [title, companyName, location, status] of JOBS) {
    const card = await call('/tracker/applications', {
      token,
      method: 'POST',
      body: { title, companyName, location },
    });
    if (status !== 'saved') {
      await call(`/tracker/applications/${card.id}/move`, {
        token,
        method: 'POST',
        body: { toStatus: status },
      });
    }
  }
  const pdf = makePdf([
    'Riya Menon',
    'Experience',
    'Built REST APIs with Node.js, TypeScript and PostgreSQL',
    'Ran services in Docker on AWS, with CI/CD and unit testing',
    'Education',
    'B.Tech in Computer Science',
    'Skills',
    'JavaScript, TypeScript, React, Docker, Git',
    'Projects',
    'A job tracker with drag and drop and websockets',
  ]);
  const form = new FormData();
  form.append('resume', new Blob([pdf], { type: 'application/pdf' }), 'riya-menon-resume.pdf');
  form.append('label', 'Backend resume');
  const resume = await call('/resumes', { token, method: 'POST', form });
  for (let i = 0; i < 30; i++) {
    const current = await call(`/resumes/${resume.id}`, { token });
    if (current.status === 'ready') break;
    await sleep(500);
  }
  await call(`/resumes/${resume.id}/match`, {
    token,
    method: 'POST',
    body: { jobDescription: JOB_TEXT, jobLabel: 'Senior Backend Engineer at Larkspur' },
  });
  return { token, resumeId: resume.id };
}

async function findCompanyPages() {
  const token = await login('admin@northwind.example', DEMO_PASSWORD);
  const me = await call('/me', { token });
  const companyId = me.memberships[0].companyId;
  const all = (await call(`/companies/${companyId}/jobs`, { token })).items;
  // A job that is open, so the page does not show a button to make it live.
  const jobs = all.filter((job) => job.status === 'open');
  if (jobs.length === 0) jobs.push(...all);
  // The job with the most people, so the hiring board looks busy.
  let best = jobs[0];
  let most = -1;
  for (const job of jobs) {
    const count = (
      await call(`/companies/${companyId}/applications?jobId=${job.id}&limit=100`, { token })
    ).items.length;
    if (count > most) [best, most] = [job, count];
  }
  return { companyId, jobId: best.id };
}

async function signIn(page, address, password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(address);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(app|company)/);
}

async function shoot(page, path, name, { waitFor, visibleText } = {}) {
  await page.goto(`${BASE}${path}`);
  if (waitFor) await waitFor(page);
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(2500);
  // The pictures go in the README, so nothing in them may mention the things we leave out.
  const text = visibleText
    ? await visibleText(page)
    : await page.evaluate(() => document.body.innerText);
  if (/\b(AI|LLM|GPT|Claude|machine learning)\b/i.test(text))
    throw new Error(`${name}: the page text has a banned word`);
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 84 });
  console.log(`saved docs/images/${name}.jpg`);
}

let seeded;
const browser = await chromium.launch();
try {
  await waitForApp();
  const { companyId, jobId } = await findCompanyPages();
  seeded = await seedSamplePerson();

  const visitor = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const landing = await visitor.newPage();
  await shoot(landing, '/', 'landing');
  await visitor.close();

  const person = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await person.newPage();
  await signIn(page, email, PASSWORD);
  await shoot(page, '/app/tracker', 'job-board', {
    waitFor: (p) => p.getByTestId('board-card').first().waitFor(),
  });
  await shoot(page, '/app/feed', 'find-jobs', {
    // Only the first jobs are in the picture. The rest of the list is below the fold.
    visibleText: async (p) =>
      (await p.getByTestId('feed-job').allInnerTexts()).slice(0, 3).join('\n'),
    waitFor: async (p) => {
      await p.getByLabel('Search jobs').fill('frontend');
      await p.getByLabel('Remote only').check();
      await p.getByTestId('feed-job').first().waitFor();
    },
  });
  await shoot(page, `/app/resumes/${seeded.resumeId}/match`, 'resume-match', {
    waitFor: (p) => p.getByTestId('match-report').waitFor(),
  });
  await person.close();

  const team = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await team.newPage();
  await signIn(admin, 'admin@northwind.example', DEMO_PASSWORD);
  await shoot(admin, `/company/${companyId}/jobs/${jobId}`, 'hiring-board', {
    waitFor: (p) => p.getByRole('region').first().waitFor(),
  });
  await shoot(admin, `/company/${companyId}/numbers`, 'hiring-numbers', {
    waitFor: (p) => p.getByText('How far people get').waitFor(),
  });
  await team.close();
} finally {
  await browser.close();
  if (seeded) {
    await call(`/resumes/${seeded.resumeId}`, { token: seeded.token, method: 'DELETE' }).catch(
      () => {},
    );
  }
  if (process.env.DATABASE_URL) {
    await removeSamplePerson();
    console.log('The sample person is removed.');
  } else {
    console.log(`Remove the sample person by hand: ${email}`);
  }
}
