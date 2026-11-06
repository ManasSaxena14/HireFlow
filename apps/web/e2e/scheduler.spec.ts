import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { registerNewUser } from './helpers';

const PDF = {
  name: 'resume.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7\nA test resume\n'),
};
const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

async function createCompanyWithJob(page: Page) {
  await page.getByRole('link', { name: 'Hiring' }).first().click();
  await page.getByLabel('Company name').fill(`Tessera ${randomUUID().slice(0, 6)}`);
  await page.getByRole('button', { name: 'Create company' }).click();
  await expect(page.getByRole('heading', { name: 'No jobs yet' })).toBeVisible();
  await page.getByRole('link', { name: 'Post your first job' }).click();
  await page.getByLabel('Job title').fill('Backend Developer');
  await page.getByLabel('About this job').fill('Build the services that run our whole product.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByRole('button', { name: 'Make it live' }).click();
  await expect(page.getByTestId('job-status')).toHaveText('Live');
  const jobPath = await page.getByRole('link', { name: 'See public page' }).getAttribute('href');
  return { jobPath: jobPath as string, boardUrl: page.url() };
}

async function applyAs(browser: Browser, path: string, name: string) {
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await page.goto(path);
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(`${randomUUID()}@example.com`);
  await page.getByLabel('Your resume').setInputFiles(PDF);
  await page.getByRole('button', { name: 'Send my application' }).click();
  await expect(page.getByText('You applied!')).toBeVisible();
  await visitor.close();
}

async function setHoursForEveryDay(page: Page) {
  await page.getByRole('link', { name: 'My hours' }).click();
  await expect(page.getByRole('heading', { name: 'My hours' })).toBeVisible();
  for (const day of WEEK) await page.getByTestId(`day-${day}`).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save my hours' }).click();
  await expect(page.getByText('Your hours are saved')).toBeVisible();
}

const pickDayAfterTomorrow = (scheduler: ReturnType<Page['getByRole']>) =>
  scheduler.getByRole('group', { name: 'Day' }).getByRole('button').nth(2).click();

test('a recruiter books, moves and cancels, and a candidate picks their own time', async ({
  browser,
  page,
}) => {
  await registerNewUser(page);
  const { jobPath, boardUrl } = await createCompanyWithJob(page);
  await applyAs(browser, jobPath, 'Asha Menon');
  await applyAs(browser, jobPath, 'Kabir Singh');

  await setHoursForEveryDay(page);
  await page.reload();
  await expect(page.getByTestId('day-monday').getByLabel('Monday start')).toHaveValue('09:00');

  // Book a time directly.
  await page.goto(boardUrl);
  await page.getByRole('link', { name: 'Asha Menon' }).first().click();
  const block = page.getByTestId('interviews-block');
  await expect(block.getByText('No interviews yet.')).toBeVisible();
  await block.getByRole('button', { name: 'Book an interview' }).click();

  const scheduler = page.getByRole('dialog', { name: 'Interview with Asha Menon' });
  await pickDayAfterTomorrow(scheduler);
  await scheduler
    .getByTestId('slots')
    .getByRole('button', { name: '9:00 am', exact: true })
    .click();
  await scheduler.getByLabel('Meeting link').fill('https://meet.example.com/room');
  await scheduler.getByRole('button', { name: 'Book interview' }).click();
  await expect(scheduler).toBeHidden();
  await expect(page.getByText('Interview booked.')).toBeVisible();
  const row = block.getByTestId('interview-row');
  await expect(row).toContainText('9:00 am');
  await expect(row.getByRole('link', { name: 'Join' })).toBeVisible();

  // The calendar file downloads for the interviewer.
  const download = page.waitForEvent('download');
  await row.getByRole('button', { name: 'Add to calendar' }).click();
  expect((await download).suggestedFilename()).toBe('interview.ics');

  // Move it to a later time.
  await row.getByRole('button', { name: 'Change time' }).click();
  const mover = page.getByRole('dialog', { name: 'New time for Asha Menon' });
  await pickDayAfterTomorrow(mover);
  await mover.getByTestId('slots').getByRole('button', { name: '2:00 pm', exact: true }).click();
  await mover.getByRole('button', { name: 'Move interview' }).click();
  await expect(mover).toBeHidden();
  await expect(row).toContainText('2:00 pm');

  // It shows on both interview lists.
  await page.getByRole('link', { name: 'Interviews' }).last().click();
  await expect(page.getByRole('heading', { name: 'Interviews', exact: true })).toBeVisible();
  await expect(page.getByTestId('interview-row')).toContainText('Asha Menon');
  await page.getByRole('link', { name: 'Interviews' }).first().click();
  await expect(page).toHaveURL(/\/app\/interviews$/);
  await expect(page.getByTestId('interview-row')).toContainText('Asha Menon');
  await page.goBack();

  // Cancel it, and the row stays as a record.
  await page.getByTestId('interview-row').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Cancel interview' }).click();
  await expect(page.getByText('No interviews coming up')).toBeVisible();
  await page.getByRole('button', { name: 'Past' }).click();
  await expect(page.getByTestId('interview-row')).toContainText('cancelled');

  // Let the other person choose from two times.
  await page.goto(boardUrl);
  await page.getByRole('link', { name: 'Kabir Singh' }).first().click();
  const kabir = page.getByTestId('interviews-block');
  await kabir.getByRole('button', { name: 'Book an interview' }).click();
  const offerSheet = page.getByRole('dialog', { name: 'Interview with Kabir Singh' });
  await offerSheet.getByRole('button', { name: 'Let them choose' }).click();
  await pickDayAfterTomorrow(offerSheet);
  await offerSheet
    .getByTestId('slots')
    .getByRole('button', { name: '10:00 am', exact: true })
    .click();
  await offerSheet
    .getByTestId('slots')
    .getByRole('button', { name: '11:00 am', exact: true })
    .click();
  await expect(offerSheet.getByTestId('picked-count')).toHaveText('2 times picked');
  await offerSheet.getByRole('button', { name: 'Send times by email' }).click();
  const bookingUrl = await offerSheet.getByTestId('booking-link').textContent();
  await offerSheet.getByRole('button', { name: 'Done' }).click();
  await expect(kabir.getByTestId('open-offer')).toContainText('Waiting for Kabir Singh');

  // The candidate has no account and opens the link in their own browser.
  const visitor = await browser.newContext();
  const candidate = await visitor.newPage();
  await candidate.goto(bookingUrl as string);
  await expect(candidate.getByRole('heading', { name: 'Kabir, pick a time' })).toBeVisible();
  await candidate.getByRole('button', { name: '11:00 am', exact: true }).click();
  await candidate.getByRole('button', { name: 'Book this time' }).click();
  await expect(candidate.getByRole('heading', { name: 'You are booked' })).toBeVisible();
  await expect(candidate.getByTestId('booked')).toContainText('11:00 am');
  await expect(candidate.getByRole('link', { name: 'Add to calendar' })).toBeVisible();

  // Opening the link again shows the booking, and a changed link shows a clear message.
  await candidate.reload();
  await expect(candidate.getByRole('heading', { name: 'You are booked' })).toBeVisible();
  await candidate.goto(`${bookingUrl}x`);
  await expect(candidate.getByRole('heading', { name: 'This link does not work' })).toBeVisible();
  await visitor.close();

  await page.reload();
  await expect(page.getByTestId('interviews-block').getByTestId('interview-row')).toContainText(
    '11:00 am',
  );
  await expect(page.getByTestId('open-offer')).toBeHidden();
});

test('someone with no hours set gives a clear message', async ({ browser, page }) => {
  await registerNewUser(page);
  const { jobPath, boardUrl } = await createCompanyWithJob(page);
  await applyAs(browser, jobPath, 'Asha Menon');
  await page.goto(boardUrl);
  await page.getByRole('link', { name: 'Asha Menon' }).first().click();
  await page.getByRole('button', { name: 'Book an interview' }).click();
  const scheduler = page.getByRole('dialog', { name: 'Interview with Asha Menon' });
  await expect(scheduler.getByText('No free times on this day')).toBeVisible();
  await scheduler.getByRole('button', { name: 'Book interview' }).click();
  await expect(scheduler.getByRole('alert')).toHaveText('Please pick a time.');
});
