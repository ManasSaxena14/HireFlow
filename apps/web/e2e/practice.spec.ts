import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerNewUser } from './helpers';

const connectionString =
  process.env.E2E_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_e2e';

/** Makes a review due today, as if a day had passed. */
async function makeDue(email: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      `UPDATE review_items SET due_on = current_date - 1
        WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
  } finally {
    await client.end();
  }
}

test('logs practice, keeps a streak and grades a review', async ({ page }) => {
  const email = await registerNewUser(page);
  await page.getByRole('link', { name: 'Practice' }).first().click();
  await expect(page.getByRole('heading', { name: 'Practice', level: 1 })).toBeVisible();
  await expect(page.getByText('Nothing saved yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Save practice' }).click();
  await expect(page.getByText('Enter what you practised')).toBeVisible();

  await page.getByLabel('What did you practise?').fill('Binary search');
  await page.getByLabel('Type').selectOption('dsa');
  await page.getByLabel('Minutes').fill('45');
  await page.getByLabel('How did it go?').selectOption('solved');
  await page.getByRole('button', { name: 'Save practice' }).click();
  await expect(page.getByText('We will ask you about Binary search again tomorrow.')).toBeVisible();

  const stats = page.getByTestId('prep-stats');
  await expect(stats).toContainText('Days in a row');
  await expect(stats.getByText('1', { exact: true }).first()).toBeVisible();
  await expect(stats).toContainText('45 minutes');
  await expect(page.getByText('Nothing to review today. Well done.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Sessions by type' })).toContainText(
    'Coding problems',
  );

  await makeDue(email);
  await page.reload();
  const review = page.getByTestId('review-card').filter({ hasText: 'Binary search' });
  await expect(review.getByText('How well do you remember it?')).toBeVisible();
  await review.getByRole('button', { name: 'Easy' }).click();
  await expect(page.getByText('We will ask about Binary search again tomorrow.')).toBeVisible();
  await expect(page.getByText('Nothing to review today. Well done.')).toBeVisible();

  await page.getByRole('button', { name: 'Delete practice: Binary search' }).click();
  await expect(page.getByText('Nothing saved yet.')).toBeVisible();
});

test('shows a company its hiring numbers and its activity', async ({ page }) => {
  await registerNewUser(page);
  await page.getByRole('link', { name: 'Hiring' }).first().click();
  await page.getByLabel('Company name').fill('Numbers Test Co');
  await page.getByRole('button', { name: 'Create company' }).click();
  await expect(page.getByRole('heading', { name: 'No jobs yet' })).toBeVisible();

  await page.getByRole('link', { name: 'Numbers' }).click();
  await expect(page.getByRole('heading', { name: 'Numbers', level: 1 })).toBeVisible();
  await expect(page.getByText('Nobody applied in this time.').first()).toBeVisible();
  await expect(page.getByText('Nobody was hired in this time.')).toBeVisible();
  await page.getByLabel('Time').selectOption('365');
  await expect(page.getByText('Nobody applied in this time.').first()).toBeVisible();

  // The admin can also see who changed what.
  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
  await expect(page.getByText('Created the company')).toBeVisible();
});
