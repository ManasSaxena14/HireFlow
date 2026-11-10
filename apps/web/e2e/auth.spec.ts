import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { authEmail, confirmWithCode, PASSWORD, registerNewUser } from './helpers';

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

test('signing up again with a used email gives nothing away', async ({ page, context }) => {
  const email = await registerNewUser(page);
  await context.clearCookies();
  await page.goto('/register');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Full name').fill('Someone Else');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('another-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  // Neon Auth answers the same way as for a new email, so nobody can test which emails exist.
  await expect(page).toHaveURL(/\/verify-email/);

  // The first account is untouched: only its own password works.
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('another-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/tracker$/);
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

test('reloading again and again keeps the session', async ({ page }) => {
  await registerNewUser(page);
  // Each reload cancels the session check the previous load started.
  for (let i = 0; i < 4; i++) await page.reload({ waitUntil: 'commit' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My job board' })).toBeVisible();
});

test('two tabs opening together both stay signed in', async ({ page, context }) => {
  await registerNewUser(page);
  const second = await context.newPage();
  await Promise.all([page.reload(), second.goto('/app/tracker')]);
  await expect(page.getByRole('heading', { name: 'My job board' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'My job board' })).toBeVisible();
});

test('a sleeping server is waited for, with a note on screen', async ({ page }) => {
  await registerNewUser(page);
  let calls = 0;
  // The first two answers act like a free host that is still waking up.
  await page.route('**/api/v1/tracker/stats', async (route) => {
    calls += 1;
    // A proxy says 503, or a plain 500 when it cannot reach the API at all.
    if (calls === 1) await route.fulfill({ status: 503, body: 'starting' });
    else if (calls === 2) await route.fulfill({ status: 500, body: 'Internal Server Error' });
    else await route.continue();
  });
  await page.reload();
  await expect(page.getByText('Starting the server.')).toBeVisible();
  await expect(page.getByTestId('stats')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Starting the server.')).toBeHidden();
  expect(calls).toBeGreaterThanOrEqual(3);
});

test('a wrong code is refused, and a new code works', async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.com`;
  await page.goto('/register');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Full name').fill('Riya Menon');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify-email/);

  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByText('This code is not right. Please check the email.')).toBeVisible();

  const first = await authEmail(email, 'email-verification');
  await page.getByRole('button', { name: 'Send me a new code' }).click();
  await expect(page.getByText('We sent a new code.')).toBeVisible();
  await expect
    .poll(async () => (await authEmail(email, 'email-verification')).code)
    .not.toBe(first.code);
  await page.getByLabel('Code').fill('');
  await confirmWithCode(page, email);
  await expect(page).toHaveURL(/\/app\/tracker$/);
});

test('signing in before confirming asks for the code first', async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.com`;
  await page.goto('/register');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Full name').fill('Riya Menon');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify-email/);

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await confirmWithCode(page, email);
  await expect(page).toHaveURL(/\/app\/tracker$/);
});

test('a forgotten password can be reset with the emailed link', async ({ page, context }) => {
  const email = await registerNewUser(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await expect(page.getByRole('link', { name: 'Forgot your password?' })).toBeVisible();
  await page.goto('/forgot-password');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send me a link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const { link } = await authEmail(email, 'reset-password');
  await page.goto(link ?? '');
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  const newPassword = 'a-brand-new-password-1';
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();

  // The same link does not work twice.
  await page.goto(link ?? '');
  await expect(page.getByRole('heading', { name: 'This link does not work' })).toBeVisible();

  await context.clearCookies();
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/tracker$/);
});

test('signing out on all devices ends the other sessions', async ({ browser, page }) => {
  const email = await registerNewUser(page);
  const other = await (await browser.newContext()).newPage();
  await other.goto('/login');
  await other.waitForLoadState('networkidle');
  await other.getByLabel('Email').fill(email);
  await other.getByLabel('Password').fill(PASSWORD);
  await other.getByRole('button', { name: 'Sign in' }).click();
  await expect(other).toHaveURL(/\/app\/tracker$/);

  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Sign out on all devices' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The other browser keeps a signed copy of its session for up to a minute. Once that copy
  // runs out, Neon Auth is asked again and says the session has ended.
  const context = other.context();
  const kept = (await context.cookies()).filter((c) => !c.name.endsWith('.local.session_data'));
  await context.clearCookies();
  await context.addCookies(kept);
  await other.reload();
  await expect(other).toHaveURL(/\/login$/);
});
