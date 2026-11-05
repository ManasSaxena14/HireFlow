import { expect, test } from '@playwright/test';
import { PASSWORD, registerNewUser } from './helpers';

test('a signed-out visitor is sent to the login page', async ({ page }) => {
  await page.goto('/app/tracker');
  await expect(page).toHaveURL(/\/login$/);
});

test('the form shows validation errors from the shared schema', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(page.getByText('Use at least 10 characters')).toBeVisible();
});

test('registering twice shows the error on the email field', async ({ page, context }) => {
  const email = await registerNewUser(page);
  await context.clearCookies();
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Riya Menon');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Already registered')).toBeVisible();
});

test('a session survives a reload, and signing out ends it', async ({ page }) => {
  const email = await registerNewUser(page);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'My job board' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/app/tracker');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong-password-here');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrong email or password.')).toBeVisible();

  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/tracker$/);
});

test('reloading while a refresh is in flight keeps the session', async ({ page }) => {
  await registerNewUser(page);
  // Each reload cancels the refresh the previous load started.
  for (let i = 0; i < 4; i++) await page.reload({ waitUntil: 'commit' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My job board' })).toBeVisible();
});

test('two tabs refreshing together do not kill the session', async ({ page, context }) => {
  await registerNewUser(page);
  const second = await context.newPage();
  await Promise.all([page.reload(), second.goto('/app/tracker')]);
  await expect(page.getByRole('heading', { name: 'My job board' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'My job board' })).toBeVisible();
});
