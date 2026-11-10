import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { addJob, card, cardIn, dragCard, registerNewUser } from './helpers';

const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_e2e';
const previewDir = fileURLToPath(new URL('../../../.mail-preview', import.meta.url));

test('candidate journey: add a job, move it to applied, see the reminder', async ({ page }) => {
  await registerNewUser(page);
  await expect(page.getByText('Your board is empty')).toBeVisible();

  await page.getByRole('button', { name: 'Add your first job' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a job' });
  await dialog.getByLabel('Job title').fill('Platform Engineer');
  await dialog.getByLabel('Company').fill('Northwind');
  await dialog.getByLabel('Location').fill('Bengaluru');
  await dialog.getByLabel('Tags').fill('remote, infra');
  await dialog.getByRole('button', { name: 'Add to board' }).click();
  await expect(dialog).toBeHidden();

  await expect(cardIn(page, 'saved', 'Platform Engineer')).toBeVisible();

  await dragCard(page, 'Platform Engineer', 'applied');
  await expect(cardIn(page, 'applied', 'Platform Engineer')).toBeVisible();
  await expect(page.getByTestId('stats').getByText('Applied this week')).toBeVisible();

  await card(page, 'Platform Engineer')
    .getByRole('button', { name: 'Platform Engineer', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Job details' });
  await expect(sheet.getByTestId('reminders')).toContainText(
    'Time to follow up on Platform Engineer at Northwind.',
  );
  await expect(sheet.getByTestId('timeline')).toContainText('Saved → Applied');

  await sheet.getByLabel('Add a note').fill('Spoke to the recruiter on Monday.');
  await sheet.getByRole('button', { name: 'Save note' }).click();
  await expect(sheet.getByText('Spoke to the recruiter on Monday.')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.reload();
  await expect(cardIn(page, 'applied', 'Platform Engineer')).toBeVisible();
});

test('a card can be moved without dragging', async ({ page }) => {
  await registerNewUser(page);
  await addJob(page, 'Data Engineer', 'Tessera');

  await page.getByLabel('Move Data Engineer to').selectOption('interview');

  await expect(cardIn(page, 'interview', 'Data Engineer')).toBeVisible();
  await expect(cardIn(page, 'saved', 'Data Engineer')).toBeHidden();
});

test('adding a duplicate opens the existing card', async ({ page }) => {
  await registerNewUser(page);
  await addJob(page, 'Site Reliability Engineer', 'Meridian');

  await page.getByRole('button', { name: 'Add a job', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a job' });
  await dialog.getByLabel('Job title').fill('site reliability engineer');
  await dialog.getByLabel('Company').fill('MERIDIAN');
  await dialog.getByRole('button', { name: 'Add to board' }).click();

  await expect(page.getByText('Already on your board')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Job details' })).toContainText(
    'Site Reliability Engineer',
  );
  await expect(page.getByTestId('board-card')).toHaveCount(1);
});

test('searching and archiving', async ({ page }) => {
  await registerNewUser(page);
  await addJob(page, 'Backend Developer', 'Halcyon');
  await addJob(page, 'Product Designer', 'Quill');

  await page.getByLabel('Search by title or company').fill('quill');
  await expect(card(page, 'Backend Developer')).toBeHidden();
  await expect(card(page, 'Product Designer')).toBeVisible();
  await page.getByLabel('Search by title or company').fill('');

  await card(page, 'Backend Developer')
    .getByRole('button', { name: 'Backend Developer', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Job details' })
    .getByRole('button', { name: 'Archive' })
    .click();
  await expect(card(page, 'Backend Developer')).toBeHidden();

  await page.getByLabel('Show archived').check();
  await expect(card(page, 'Backend Developer')).toBeVisible();
});

test('a due reminder reaches the notification list and is emailed once', async ({ page }) => {
  const email = await registerNewUser(page);
  await addJob(page, 'Machine Operator', 'Lumen');
  await page.getByLabel('Move Machine Operator to').selectOption('applied');
  await expect(cardIn(page, 'applied', 'Machine Operator')).toBeVisible();

  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  const { rowCount } = await db.query(
    `UPDATE reminders r SET remind_at = now() - interval '1 minute'
       FROM users u
      WHERE u.id = r.user_id AND u.email = $1`,
    [email],
  );
  await db.end();
  expect(rowCount).toBe(1);

  // The scan is scheduled once a minute, so allow for a full cycle.
  await page.goto('/app/notifications');
  await expect(async () => {
    await page.reload();
    await expect(page.getByText('Time to follow up on Machine Operator at Lumen.')).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 100_000, intervals: [5_000] });

  await expect(page.getByRole('link', { name: /Notifications\s*1 unread/ })).toBeVisible();

  // One reminder email for this address, and no more. The sign-up code comes from Neon Auth,
  // not from the worker, so it is not in this count.
  const prefix = email.replace(/[^a-z0-9]+/gi, '-');
  await expect
    .poll(async () => (await readdir(previewDir)).filter((f) => f.includes(prefix)).length, {
      timeout: 20_000,
    })
    .toBe(1);
});
