import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';

export const PASSWORD = 'end-to-end-password';

export async function registerNewUser(page: Page): Promise<string> {
  const email = `e2e-${randomUUID()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Riya Menon');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app\/tracker$/);
  return email;
}

export async function addJob(page: Page, title: string, company: string): Promise<void> {
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add application' });
  await dialog.getByLabel('Job title').fill(title);
  await dialog.getByLabel('Company').fill(company);
  await dialog.getByRole('button', { name: 'Add to board' }).click();
  await expect(dialog).toBeHidden();
}

export const column = (page: Page, status: string): Locator => page.getByTestId(`column-${status}`);

export const card = (page: Page, title: string): Locator =>
  page.getByTestId('board-card').filter({ hasText: title });

export const cardIn = (page: Page, status: string, title: string): Locator =>
  column(page, status).getByRole('button', { name: title, exact: true });

/** Drags with real mouse events, in small steps so the drag library registers movement. */
export async function dragCard(page: Page, title: string, status: string): Promise<void> {
  const from = await card(page, title).boundingBox();
  const to = await column(page, status).boundingBox();
  if (!from || !to) throw new Error('card or column is not on screen');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height - 40);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height - 30, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 15 });
  await page.mouse.up();
}
