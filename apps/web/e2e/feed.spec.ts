import { randomUUID } from 'node:crypto';
import { jobHash } from '@hireflow/shared/node';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerNewUser } from './helpers';

const connectionString =
  process.env.E2E_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_e2e';

/** The worker reads real job boards, so these tests add their jobs directly and stay offline. */
async function addFeedJob() {
  const suffix = randomUUID().slice(0, 8);
  const word = `zephyr${suffix}`;
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO feed_sources (name, kind) VALUES ($1, 'greenhouse') RETURNING id`,
      [`Larkspur board ${suffix}`],
    );
    await client.query(
      `INSERT INTO feed_jobs (source_id, external_id, title, company_name, location, remote, url,
                              description, posted_at, job_hash, matched_at)
       VALUES ($1, $2, $3, 'Larkspur', 'Remote, India', true, 'https://example.com/job',
               $4, now(), $5, now())`,
      [
        rows[0]?.id,
        suffix,
        `Backend Engineer ${word}`,
        `You will build ${word} services.\n\nThe last line of the description.${' More text.'.repeat(40)}`,
        jobHash(`Backend Engineer ${word}`, 'Larkspur', 'Remote, India'),
      ],
    );
  } finally {
    await client.end();
  }
  return { word, title: `Backend Engineer ${word}` };
}

test('finds a job in the feed and saves it to the board', async ({ page }) => {
  const { word, title } = await addFeedJob();
  await registerNewUser(page);
  await page.getByRole('link', { name: 'Find jobs' }).first().click();
  await expect(page.getByRole('heading', { name: 'Find jobs' })).toBeVisible();

  await page.getByLabel('Search jobs').fill('nothing-will-match-this-search');
  await expect(page.getByRole('heading', { name: 'No jobs found' })).toBeVisible();

  await page.getByLabel('Search jobs').fill(word);
  await page.getByLabel('Location').fill('india');
  await page.getByLabel('Remote only').check();
  const job = page.getByTestId('feed-job').filter({ hasText: title });
  await expect(job).toBeVisible();
  await expect(job).toHaveCount(1);
  await expect(job.getByRole('link', { name: /Apply/ })).toHaveAttribute(
    'href',
    'https://example.com/job',
  );

  await job.getByRole('button', { name: /Read more/ }).click();
  await expect(job.getByText('The last line of the description.')).toBeVisible();

  await job.getByRole('button', { name: 'Save to board' }).click();
  await expect(page.getByText('Saved to your job board')).toBeVisible();
  await job.getByRole('link', { name: 'On your board' }).click();
  await expect(page).toHaveURL(/\/app\/tracker\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('sets up, changes, pauses and deletes a job alert', async ({ page }) => {
  await registerNewUser(page);
  await page.getByRole('link', { name: 'Job alerts' }).first().click();
  await expect(page.getByRole('heading', { name: 'No alerts yet' })).toBeVisible();
  await expect(page.getByText('Please confirm your email to get alerts.')).toBeVisible();

  await page.getByRole('button', { name: 'Set up your first alert' }).click();
  const dialog = page.getByRole('dialog', { name: 'New job alert' });
  await dialog.getByRole('button', { name: 'Save alert' }).click();
  await expect(dialog.getByText('Give this alert a name')).toBeVisible();
  await expect(dialog.getByText('Enter at least one keyword')).toBeVisible();

  await dialog.getByLabel('Alert name').fill('Backend jobs');
  await dialog.getByLabel('Keywords').fill('node, postgres');
  await dialog.getByLabel('Places').fill('London');
  await dialog.getByLabel('When should we email you?').selectOption('instant');
  await dialog.getByLabel('Only remote jobs').check();
  await dialog.getByRole('button', { name: 'Save alert' }).click();
  await expect(dialog).toBeHidden();

  const card = page.getByTestId('alert-card');
  await expect(card.getByRole('heading', { name: 'Backend jobs' })).toBeVisible();
  await expect(card.getByText('Emails right away · In London · Remote only')).toBeVisible();
  await expect(card.getByRole('listitem').filter({ hasText: 'postgres' })).toBeVisible();

  await card.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit job alert' });
  await expect(edit.getByLabel('Keywords')).toHaveValue('node, postgres');
  await edit.getByLabel('Alert name').fill('Node jobs');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(card.getByRole('heading', { name: 'Node jobs' })).toBeVisible();

  await card.getByRole('button', { name: 'Pause' }).click();
  await expect(card.getByText('Paused')).toBeVisible();
  await card.getByRole('button', { name: 'Turn on' }).click();
  await expect(card.getByText('Paused')).toBeHidden();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Node jobs' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete alert' }).click();
  await expect(page.getByRole('heading', { name: 'No alerts yet' })).toBeVisible();
});
