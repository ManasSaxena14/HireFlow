import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { addJob, registerNewUser } from './helpers';

const docx = (paragraphs: string[]) =>
  Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'word/document.xml': strToU8(
        `<w:document><w:body>${paragraphs
          .map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`)
          .join('')}</w:body></w:document>`,
      ),
    }),
  );

const RESUME = {
  name: 'Riya resume.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  buffer: docx([
    'Experience',
    'Built APIs with NodeJS and Postgres.',
    'Education',
    'B.Tech',
    'Skills',
    'Docker',
    'Projects',
    'A chat app',
  ]),
};

const JOB = `Backend Engineer

Requirements
- Node.js
- Kubernetes

We also use Docker every day.`;

test('uploads a resume, checks it against a job and deletes it', async ({ page }) => {
  await registerNewUser(page);
  await addJob(page, 'Designer', 'Larkspur');
  await page.getByRole('link', { name: 'Resumes' }).first().click();
  await expect(page.getByRole('heading', { name: 'No resumes yet' })).toBeVisible();

  await page.getByLabel('Choose a resume file').setInputFiles(RESUME);
  const card = page.getByTestId('resume-card');
  await expect(card.getByRole('heading', { name: 'Riya resume' })).toBeVisible();
  // The worker reads the real file, and the page updates by itself.
  await expect(card.getByRole('listitem').filter({ hasText: 'Node.js' })).toBeVisible({
    timeout: 30_000,
  });

  await card.getByRole('link', { name: 'Check against a job' }).click();
  await expect(page.getByLabel('Which job?')).toBeVisible();
  await expect(page.getByLabel('Which job?').getByRole('option')).toHaveCount(2);

  await page.getByLabel('Job description').fill('Too short');
  await page.getByRole('button', { name: 'Check my resume' }).click();
  await expect(page.getByText('Paste more of the job')).toBeVisible();

  await page.getByLabel('Job description').fill(JOB);
  await page.getByLabel(/A name for this job/).fill('Backend at Larkspur');
  await page.getByRole('button', { name: 'Check my resume' }).click();

  const report = page.getByTestId('match-report');
  await expect(report.getByRole('heading', { name: 'Backend at Larkspur' })).toBeVisible();
  await expect(report.getByRole('list', { name: 'You have' })).toContainText('Node.js');
  await expect(report.getByRole('list', { name: 'You have' })).toContainText('Docker');
  await expect(report.getByRole('list', { name: 'Missing from your resume' })).toContainText(
    'Kubernetes',
  );
  await expect(
    report.getByText(
      'The job asks for Kubernetes. Add it only if you have real experience with Kubernetes.',
    ),
  ).toBeVisible();
  const score = await report.getByTestId('match-score').getAttribute('aria-label');

  // The same inputs give the same score, and the check stays in the history.
  await page.getByRole('button', { name: 'Check my resume' }).click();
  await expect(page.getByRole('button', { name: /Backend at Larkspur/ })).toHaveCount(2);
  await expect(report.getByTestId('match-score')).toHaveAttribute('aria-label', score as string);

  await page.getByRole('link', { name: 'All resumes' }).click();
  await expect(card).toContainText(/Last score \d+ out of 100/);
  await card.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete resume' }).click();
  await expect(page.getByRole('heading', { name: 'No resumes yet' })).toBeVisible();
});

test('explains when a file has no text to read', async ({ page }) => {
  await registerNewUser(page);
  await page.goto('/app/resumes');
  await page.getByLabel('Choose a resume file').setInputFiles({
    ...RESUME,
    name: 'scan.docx',
    buffer: docx([]),
  });
  await expect(page.getByTestId('resume-card').getByRole('alert')).toContainText(
    'We found no text in this file',
    { timeout: 30_000 },
  );
  await expect(page.getByRole('link', { name: 'Check against a job' })).toHaveCount(0);
});

test('refuses a file that is not a resume', async ({ page }) => {
  await registerNewUser(page);
  await page.goto('/app/resumes');
  await page.getByLabel('Choose a resume file').setInputFiles({
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('this is not a real pdf'),
  });
  await expect(page.getByText('Please upload a PDF or Word (.docx) file.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No resumes yet' })).toBeVisible();
});
