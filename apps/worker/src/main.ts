import { fileURLToPath } from 'node:url';
import { MAIL_QUEUE, type MailMessage } from '@hireflow/shared';
import { loadEnvFile } from '@hireflow/shared/node';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { loadConfig } from './config.js';
import { deliverMail } from './mail/deliver.js';
import { type MailSender, PreviewSender, SmtpSender } from './mail/sender.js';

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

// Job payloads hold links and addresses, so only the job id and template are logged.
await boss.work<MailMessage>(MAIL_QUEUE, async ([job]) => {
  if (!job) return;
  const outcome = await deliverMail(pool, sender, job.data);
  log.info({ jobId: job.id, template: job.data.template, outcome }, 'mail job done');
});

log.info('worker started');

const shutdown = async () => {
  log.info('worker stopping');
  await boss.stop({ graceful: true, timeout: 10_000 });
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
