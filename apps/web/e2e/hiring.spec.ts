import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { registerNewUser } from './helpers';

const PDF = {
  name: 'resume.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7\nA test resume\n'),
};
const FAKE_PDF = {
  name: 'resume.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 1)]),
};

async function createCompanyAndLiveJob(page: Page, jobTitle: string) {
  const companyName = `Tessera ${randomUUID().slice(0, 6)}`;
  await page.getByRole('link', { name: 'Hiring' }).first().click();
  await page.getByLabel('Company name').fill(companyName);
  await page.getByRole('button', { name: 'Create company' }).click();
  await expect(page.getByRole('heading', { name: 'No jobs yet' })).toBeVisible();

  await page.getByRole('link', { name: 'Post your first job' }).click();
  await page.getByLabel('Job title').fill(jobTitle);
  await page.getByLabel('Location').fill('Pune');
  await page.getByLabel('Skills').fill('TypeScript, SQL');
  await page.getByLabel('About this job').fill('Build the services that run our whole product.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByTestId('job-status')).toHaveText('Draft');

  await page.getByRole('button', { name: 'Make it live' }).click();
  await expect(page.getByTestId('job-status')).toHaveText('Live');

  const careersHref = await page
    .getByRole('link', { name: 'See public page' })
    .getAttribute('href');
  return { companyName, jobPath: careersHref as string, boardUrl: page.url() };
}

async function applyAs(browser: Browser, path: string, name: string, email: string) {
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await page.goto(path);
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Your resume').setInputFiles(PDF);
  await page.getByRole('button', { name: 'Send my application' }).click();
  await expect(page.getByText('You applied!')).toBeVisible();
  await visitor.close();
}

async function dragTo(page: Page, name: string, stage: string) {
  const card = page.getByTestId('pipeline-card').filter({ hasText: name });
  const column = page.getByRole('region', { name: stage, exact: true });
  const from = await card.boundingBox();
  const to = await column.boundingBox();
  if (!from || !to) throw new Error('card or column is not on screen');
  await page.mouse.move(from.x + 90, from.y + 62);
  await page.mouse.down();
  await page.mouse.move(from.x + 110, from.y + 72, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 15 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

const cardInStage = (page: Page, stage: string, name: string) =>
  page.getByRole('region', { name: stage, exact: true }).getByRole('link', { name, exact: true });

test('recruiter journey: post a job, take applications and run the board', async ({
  page,
  browser,
}) => {
  await registerNewUser(page);
  const { companyName, jobPath, boardUrl } = await createCompanyAndLiveJob(
    page,
    'Backend Developer',
  );

  const visitor = await browser.newContext();
  const careers = await visitor.newPage();
  await careers.goto(jobPath);
  await expect(careers.getByRole('heading', { name: 'Backend Developer' })).toBeVisible();
  await expect(careers.getByText('TypeScript')).toBeVisible();

  const email = `asha-${randomUUID()}@example.com`;
  await careers.getByLabel('Full name').fill('Asha Rao');
  await careers.getByLabel('Email').fill(email);
  await careers.getByRole('button', { name: 'Send my application' }).click();
  await expect(careers.getByText('Please add your resume.')).toBeVisible();

  await careers.getByLabel('Your resume').setInputFiles(FAKE_PDF);
  await careers.getByRole('button', { name: 'Send my application' }).click();
  await expect(careers.getByText('Please upload a PDF or Word (.docx) file.')).toBeVisible();

  await careers.getByLabel('Your resume').setInputFiles(PDF);
  await careers.getByRole('button', { name: 'Send my application' }).click();
  await expect(careers.getByText('You applied!')).toBeVisible();

  await careers.reload();
  await careers.getByLabel('Full name').fill('Asha Rao');
  await careers.getByLabel('Email').fill(email);
  await careers.getByLabel('Your resume').setInputFiles(PDF);
  await careers.getByRole('button', { name: 'Send my application' }).click();
  await expect(careers.getByText('You have already applied to this job.')).toBeVisible();

  const slug = jobPath.split('/')[2] as string;
  await careers.goto(`/c/${slug}`);
  await expect(careers.getByRole('heading', { name: companyName })).toBeVisible();
  await expect(careers.getByRole('link', { name: /Backend Developer/ })).toBeVisible();
  await visitor.close();

  await page.goto(boardUrl);
  await expect(cardInStage(page, 'New', 'Asha Rao')).toBeVisible();

  await dragTo(page, 'Asha Rao', 'First call');
  await expect(cardInStage(page, 'First call', 'Asha Rao')).toBeVisible();

  // Without dragging, for people who use a keyboard.
  await page.getByLabel('Move Asha Rao to').selectOption({ label: 'Interview' });
  await expect(cardInStage(page, 'Interview', 'Asha Rao')).toBeVisible();

  // This step can be off screen on a small window, so it is reached through the menu.
  await page.getByLabel('Move Asha Rao to').selectOption({ label: 'Not selected' });
  const reason = page.getByRole('dialog', { name: 'Not selecting Asha Rao' });
  await reason.getByRole('button', { name: 'Confirm' }).click();
  await expect(reason.getByText('Please write a reason.')).toBeVisible();
  await reason.getByRole('button', { name: 'Cancel' }).click();
  await expect(reason).toBeHidden();
  await expect(cardInStage(page, 'Interview', 'Asha Rao')).toBeVisible();

  await cardInStage(page, 'Interview', 'Asha Rao').click();
  await expect(page.getByRole('heading', { name: 'Asha Rao' })).toBeVisible();

  await page.getByRole('radio', { name: '4 out of 5' }).check({ force: true });
  await page.getByLabel('Notes').fill('Very clear thinker.');
  await page.getByRole('button', { name: 'Send my score' }).click();
  await expect(page.getByTestId('scorecards')).toContainText('Very clear thinker.');
  await expect(page.getByRole('button', { name: 'Send my score' })).toBeHidden();
  await expect(page.getByText('Team score')).toBeVisible();

  await page.getByLabel('Add a comment').fill('Let us call her again.');
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.getByTestId('comments')).toContainText('Let us call her again.');

  await page.getByRole('button', { name: 'Not selected', exact: true }).click();
  const again = page.getByRole('dialog', { name: 'Not selecting Asha Rao' });
  await again.getByLabel('Why not?').fill('Needs more backend work.');
  await again.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Needs more backend work.')).toBeVisible();
  await expect(page.getByTestId('history')).toContainText('Interview → Not selected');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Get resume' }).click();
  expect((await download).suggestedFilename()).toBe('resume.pdf');
});

test('steps can be changed, and the board follows', async ({ page }) => {
  await registerNewUser(page);
  await createCompanyAndLiveJob(page, 'Designer');

  await page.getByRole('button', { name: 'Steps' }).click();
  const sheet = page.getByRole('dialog', { name: 'Steps for this job' });
  await sheet.getByRole('button', { name: 'Add a step' }).click();
  const row = sheet.getByTestId('stage-row').nth(4);
  await row.getByLabel('Name').fill('Take-home task');
  await sheet.getByRole('button', { name: 'Save steps' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('region', { name: 'Take-home task' })).toBeVisible();
});

test('an interviewer sees only the people given to them', async ({ page, browser }) => {
  const otherContext = await browser.newContext();
  const interviewer = await otherContext.newPage();
  const interviewerEmail = await registerNewUser(interviewer);

  await registerNewUser(page);
  const { jobPath, boardUrl } = await createCompanyAndLiveJob(page, 'Data Analyst');
  await applyAs(browser, jobPath, 'Given Person', `given-${randomUUID()}@example.com`);
  await applyAs(browser, jobPath, 'Hidden Person', `hidden-${randomUUID()}@example.com`);

  await page.getByRole('link', { name: 'Team' }).click();
  await page.getByLabel('Their email').fill(interviewerEmail);
  await page.getByRole('button', { name: 'Add to team' }).click();
  await expect(page.getByTestId('team')).toContainText(interviewerEmail);

  await interviewer.getByRole('link', { name: 'Hiring' }).first().click();
  await interviewer.reload();
  await interviewer.getByRole('link', { name: 'Hiring' }).first().click();
  await expect(interviewer.getByRole('heading', { name: 'Nobody for you yet' })).toBeVisible();

  await page.goto(boardUrl);
  await cardInStage(page, 'New', 'Given Person').click();
  await page.getByLabel('Give to').selectOption({ label: 'Riya Menon (Interviewer)' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('assignees')).toContainText('Riya Menon');

  await interviewer.reload();
  await interviewer.getByRole('link', { name: /Data Analyst/ }).click();
  await expect(cardInStage(interviewer, 'New', 'Given Person')).toBeVisible();
  await expect(interviewer.getByText('Hidden Person')).toBeHidden();
  await expect(interviewer.getByLabel('Move Given Person to')).toBeHidden();
  await expect(interviewer.getByRole('button', { name: 'Make it live' })).toBeHidden();
  await expect(interviewer.getByRole('button', { name: 'Close job' })).toBeHidden();

  await cardInStage(interviewer, 'New', 'Given Person').click();
  await expect(interviewer.getByRole('button', { name: 'First call' })).toBeDisabled();
  await interviewer.getByRole('radio', { name: '3 out of 5' }).check({ force: true });
  await interviewer.getByRole('button', { name: 'Send my score' }).click();
  await expect(interviewer.getByTestId('scorecards')).toContainText('Riya Menon');
  await otherContext.close();
});

test('a person who is not on the team cannot open the company', async ({ page, browser }) => {
  await registerNewUser(page);
  const { boardUrl } = await createCompanyAndLiveJob(page, 'Support Lead');

  const stranger = await browser.newContext();
  const other = await stranger.newPage();
  await registerNewUser(other);
  await other.goto(boardUrl);
  await expect(other.getByRole('heading', { name: 'Company not found' })).toBeVisible();
  await stranger.close();
});
