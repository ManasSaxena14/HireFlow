import type { MailMessage } from '@hireflow/shared';
import type pg from 'pg';

export type EnqueueMail = (message: MailMessage, client: pg.PoolClient) => Promise<void>;

interface DueReminder {
  id: string;
  user_id: string;
  tracked_application_id: string | null;
  message: string;
  email: string;
  full_name: string;
}

const BATCH_SIZE = 100;

/**
 * Picks up reminders that are due. SKIP LOCKED means two workers never take the same one.
 * The notification, the email job and sent_at are saved together. If the worker crashes
 * half way, nothing is saved and the next run picks up the reminder again.
 */
export async function scanReminders(
  pool: pg.Pool,
  enqueue: EnqueueMail,
  appUrl: string,
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<DueReminder>(
      `SELECT r.id, r.user_id, r.tracked_application_id, r.message, u.email, u.full_name
         FROM reminders r
         JOIN users u ON u.id = r.user_id
        WHERE r.remind_at <= now() AND r.sent_at IS NULL
        ORDER BY r.remind_at
        LIMIT $1
          FOR UPDATE OF r SKIP LOCKED`,
      [BATCH_SIZE],
    );

    for (const reminder of rows) {
      const path = reminder.tracked_application_id
        ? `/app/tracker/${reminder.tracked_application_id}`
        : '/app/notifications';
      await client.query(
        `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'reminder', $2)`,
        [
          reminder.user_id,
          JSON.stringify({
            message: reminder.message,
            trackedApplicationId: reminder.tracked_application_id,
          }),
        ],
      );
      await enqueue(
        {
          template: 'reminder',
          to: reminder.email,
          name: reminder.full_name,
          message: reminder.message,
          link: `${appUrl}${path}`,
          dedupeKey: `reminder:${reminder.id}`,
        },
        client,
      );
      await client.query('UPDATE reminders SET sent_at = now() WHERE id = $1', [reminder.id]);
    }

    await client.query('COMMIT');
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
