import type { MailMessage } from '@hireflow/shared';
import type pg from 'pg';
import type { MailSender } from './sender.js';
import { renderMail } from './templates.js';

/**
 * Sends each email only once. The delivery row and the send share a transaction:
 * - If sending fails, the row is undone, so the retry can send it.
 * - If the email was already sent, the retry finds the row and stops.
 * One small gap is left: a crash right after the mail server accepts the email but before
 * the row is saved. No mail client can fully fix this.
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
