import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import pg from 'pg';
import { registerNewUser } from './helpers';

const connectionString =
  process.env.E2E_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_e2e';

const PDF = {
  name: 'resume.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7\nA test resume\n'),
};

/** Stands in for clicking the link in the confirmation email. */
async function confirmEmail(email: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('UPDATE users SET email_verified_at = now() WHERE email = $1', [email]);
  } finally {
    await client.end();
  }
}

async function createCompanyAndLiveJob(page: Page, jobTitle: string) {
  await page.getByRole('link', { name: 'Hiring' }).first().click();
  await page.getByLabel('Company name').fill(`Tessera ${randomUUID().slice(0, 6)}`);
  await page.getByRole('button', { name: 'Create company' }).click();
  await expect(page.getByRole('heading', { name: 'No jobs yet' })).toBeVisible();
  await page.getByRole('link', { name: 'Post your first job' }).click();
  await page.getByLabel('Job title').fill(jobTitle);
  await page.getByLabel('About this job').fill('Build the services that run our whole product.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByRole('button', { name: 'Make it live' }).click();
  await expect(page.getByTestId('job-status')).toHaveText('Live');
  const jobPath = await page.getByRole('link', { name: 'See public page' }).getAttribute('href');
  return { jobPath: jobPath as string };
}

const WAIT = { timeout: 60_000 };

test('both job boards follow the hiring process, with no reload', async ({ browser, page }) => {
  test.setTimeout(240_000);

  // The recruiter has the hiring board open and leaves it alone from here on.
  await registerNewUser(page);
  const { jobPath } = await createCompanyAndLiveJob(page, 'Backend Developer');
  await expect(page.getByRole('region', { name: 'New', exact: true })).toBeVisible();

  // The candidate has a confirmed account and watches their own job board.
  const candidate = await browser.newContext();
  const board = await candidate.newPage();
  const email = await registerNewUser(board);
  await confirmEmail(email);
  await board.reload();
  await expect(board.getByTestId('board-card')).toHaveCount(0);

  // They apply on the public page, using the same email.
  const apply = await candidate.newPage();
  await apply.goto(jobPath);
  await apply.getByLabel('Full name').fill('Riya Menon');
  await apply.getByLabel('Email').fill(email);
  await apply.getByLabel('Your resume').setInputFiles(PDF);
  await apply.getByRole('button', { name: 'Send my application' }).click();
  await expect(apply.getByText('You applied!')).toBeVisible();
  await expect(apply.getByText('It is on your job board too')).toBeVisible();
  await apply.close();

  // Their board shows it by itself.
  await board.bringToFront();
  const card = board.getByTestId('board-card').filter({ hasText: 'Backend Developer' });
  await expect(card).toBeVisible(WAIT);
  await expect(card).toHaveAttribute('data-card-status', 'applied');
  await expect(card.getByText('Live', { exact: true })).toBeVisible();
  await expect(board.getByText(/is on your job board\./)).toBeVisible();

  // The recruiter's board shows the new person by itself too.
  await page.bringToFront();
  const person = page
    .getByRole('region', { name: 'New', exact: true })
    .getByRole('link', { name: 'Riya Menon', exact: true });
  await expect(person).toBeVisible(WAIT);

  // The recruiter moves them on. The candidate's card follows without a reload.
  await page.getByLabel('Move Riya Menon to').selectOption({ label: 'Interview' });
  await expect(
    page.getByRole('region', { name: 'Interview', exact: true }).getByRole('link', {
      name: 'Riya Menon',
      exact: true,
    }),
  ).toBeVisible();

  await board.bringToFront();
  await expect(card).toHaveAttribute('data-card-status', 'interview', WAIT);
  await expect(board.getByText(/to the interview step\./)).toBeVisible();
  await expect(board.getByTestId('stats')).toContainText('1');

  // The card's own page tells the story.
  await card.getByRole('button', { name: 'Backend Developer', exact: true }).click();
  await expect(board.getByText(/follows .* hiring on HireFlow/)).toBeVisible();
  await expect(board.getByText(/: Interview$/)).toBeVisible(WAIT);
  await candidate.close();
});
