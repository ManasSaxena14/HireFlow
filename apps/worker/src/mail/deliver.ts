import type { MailMessage } from '@hireflow/shared';
import type pg from 'pg';
import type { MailSender } from './sender.js';
import { renderMail } from './templates.js';

/**
 * Sends a message at most once per dedupe key. The delivery row and the send share a
 * transaction: a failed send rolls the row back so the retry goes through, while a retry
 * of a message that already went out finds the committed row and stops. The one remaining
 * gap is a crash after SMTP accepted the mail but before the commit, which no SMTP
 * client can close.
 */
export async function deliverMail(
  pool: pg.Pool,
  sender: MailSender,
  message: MailMessage,
): Promise<'sent' | 'duplicate'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `INSERT INTO email_deliveries (dedupe_key, template) VALUES ($1, $2)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [message.dedupeKey, message.template],
    );
    if (rowCount === 0) {
      await client.query('COMMIT');
      return 'duplicate';
    }
    await sender.send(message.to, renderMail(message));
    await client.query('COMMIT');
    return 'sent';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
