import { fileURLToPath } from 'node:url';
import {
  ALERTS_DIGEST_QUEUE,
  ALERTS_MATCH_QUEUE,
  CLEANUP_QUEUE,
  FEED_FETCH_QUEUE,
  MAIL_QUEUE,
  type MailMessage,
  REMINDERS_SCAN_QUEUE,
} from '@hireflow/shared';
import { loadEnvFile } from '@hireflow/shared/node';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { matchNewJobs } from './alerts/match.js';
import { sendAlerts } from './alerts/send.js';
import { loadConfig } from './config.js';
import { cleanUp } from './cleanup.js';
import { ADAPTERS } from './feed/adapters.js';
import { fetchSources } from './feed/fetch.js';
import { createFeedHttp } from './feed/http.js';
import { deliverMail } from './mail/deliver.js';
import { type MailSender, PreviewSender, SmtpSender } from './mail/sender.js';
import { type EnqueueMail, scanReminders } from './reminders/scan.js';

loadEnvFile();
const env = loadConfig();
const log = pino({ level: env.LOG_LEVEL, name: 'worker' });

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
const boss = new PgBoss(env.DATABASE_URL);
boss.on('error', (err) => log.error({ err }, 'job queue error'));

const previewDir = fileURLToPath(new URL('../../../.mail-preview', import.meta.url));
const sender: MailSender = env.SMTP_HOST
  ? new SmtpSender(env, env.MAIL_FROM)
  : new PreviewSender(previewDir, (path) => log.info({ path }, 'email written to preview folder'));

await boss.start();
await boss.createQueue(MAIL_QUEUE, { retryLimit: 5, retryBackoff: true, retryDelay: 30 });

// Job data holds links and email addresses, so log only the job id and template.
await boss.work<MailMessage>(MAIL_QUEUE, async ([job]) => {
  if (!job) return;
  const outcome = await deliverMail(pool, sender, job.data);
  log.info({ jobId: job.id, template: job.data.template, outcome }, 'mail job done');
});

const enqueueInTransaction: EnqueueMail = async (message, client) => {
  await boss.send(MAIL_QUEUE, message, {
    db: {
      executeSql: async (text, values) => {
        const { rows } = await client.query(text, values as unknown[]);
        return { rows } as never;
      },
    },
  });
};

await boss.createQueue(REMINDERS_SCAN_QUEUE);
await boss.schedule(REMINDERS_SCAN_QUEUE, '* * * * *');
await boss.work(REMINDERS_SCAN_QUEUE, async () => {
  const count = await scanReminders(pool, enqueueInTransaction, env.APP_URL);
  if (count > 0) log.info({ count }, 'reminders processed');
});

await boss.createQueue(CLEANUP_QUEUE);
await boss.schedule(CLEANUP_QUEUE, '0 3 * * *');
await boss.work(CLEANUP_QUEUE, async () => {
  log.info(await cleanUp(pool), 'old rows removed');
});

const feedHttp = createFeedHttp();

await boss.createQueue(FEED_FETCH_QUEUE, { policy: 'stately', expireInSeconds: 1500 });
await boss.schedule(FEED_FETCH_QUEUE, '*/30 * * * *');
await boss.work(FEED_FETCH_QUEUE, async () => {
  const result = await fetchSources(pool, ADAPTERS, feedHttp, (problem) =>
    log.warn(problem, 'job source failed'),
  );
  log.info(result, 'job sources fetched');
  // Sent even with no new jobs, so jobs left over from a crash still get matched.
  await boss.send(ALERTS_MATCH_QUEUE, {});
});

await boss.createQueue(ALERTS_MATCH_QUEUE, {
  policy: 'stately',
  retryLimit: 2,
  retryDelay: 60,
});
await boss.work(ALERTS_MATCH_QUEUE, async () => {
  const matched = await matchNewJobs(pool);
  const sent = await sendAlerts(pool, enqueueInTransaction, env.APP_URL, 'instant');
  if (matched.jobs > 0 || sent > 0) log.info({ ...matched, sent }, 'job alerts matched');
});

// Runs every 15 minutes because some time zones are 30 or 45 minutes off the hour.
await boss.createQueue(ALERTS_DIGEST_QUEUE, {
  policy: 'stately',
  retryLimit: 2,
  retryDelay: 60,
});
await boss.schedule(ALERTS_DIGEST_QUEUE, '*/15 * * * *');
await boss.work(ALERTS_DIGEST_QUEUE, async () => {
  const instant = await sendAlerts(pool, enqueueInTransaction, env.APP_URL, 'instant');
  const daily = await sendAlerts(pool, enqueueInTransaction, env.APP_URL, 'daily');
  if (instant > 0 || daily > 0) log.info({ instant, daily }, 'job alert emails added');
});

// Sources fetched in the last 25 minutes are skipped, so a restart does not call them again.
await boss.send(FEED_FETCH_QUEUE, {});

log.info('worker started');

const shutdown = async () => {
  log.info('worker stopping');
  await boss.stop({ graceful: true, timeout: 10_000 });
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
