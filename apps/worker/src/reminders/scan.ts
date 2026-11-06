import { formatInterviewTime, type MailMessage } from '@hireflow/shared';
import type pg from 'pg';

export type EnqueueMail = (message: MailMessage, client: pg.PoolClient) => Promise<void>;

interface DueReminder {
  id: string;
  user_id: string;
  tracked_application_id: string | null;
  message: string;
  email: string;
  full_name: string;
  timezone: string;
  company_id: string | null;
  company_name: string | null;
  company_slug: string | null;
  application_id: string | null;
  job_title: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  candidate_timezone: string | null;
  meeting_url: string | null;
  starts_at: Date | null;
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
      `SELECT r.id, r.user_id, r.tracked_application_id, r.message, u.email, u.full_name, u.timezone,
              i.company_id, co.name AS company_name, co.slug AS company_slug,
              i.application_id, j.title AS job_title,
              c.full_name AS candidate_name, c.email AS candidate_email,
              i.candidate_timezone, i.meeting_url, lower(i.during) AS starts_at
         FROM reminders r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN interviews i ON i.id = r.interview_id
         LEFT JOIN companies co ON co.id = i.company_id
         LEFT JOIN applications a ON a.id = i.application_id
         LEFT JOIN jobs j ON j.id = a.job_id
         LEFT JOIN candidates c ON c.id = i.candidate_id
        WHERE r.remind_at <= now() AND r.sent_at IS NULL
        ORDER BY r.remind_at
        LIMIT $1
          FOR UPDATE OF r SKIP LOCKED`,
      [BATCH_SIZE],
    );

    for (const reminder of rows) {
      const path = reminder.application_id
        ? `/company/${reminder.company_id}/candidates/${reminder.application_id}`
        : reminder.tracked_application_id
          ? `/app/tracker/${reminder.tracked_application_id}`
          : '/app/notifications';
      await client.query(
        `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'reminder', $2)`,
        [
          reminder.user_id,
          JSON.stringify({
            message: reminder.message,
            trackedApplicationId: reminder.tracked_application_id,
            ...(reminder.application_id ? { link: path } : {}),
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
      if (reminder.starts_at) {
        // Candidates usually have no account, so they only get the email.
        await enqueue(
          {
            template: 'interview',
            kind: 'reminder',
            to: reminder.candidate_email as string,
            dedupeKey: `reminder:${reminder.id}:candidate`,
            name: reminder.candidate_name as string,
            jobTitle: reminder.job_title as string,
            companyName: reminder.company_name as string,
            when: formatInterviewTime(
              reminder.starts_at,
              reminder.candidate_timezone ?? reminder.timezone,
            ),
            withName: reminder.full_name,
            meetingUrl: reminder.meeting_url,
            link: reminder.meeting_url ?? `${appUrl}/c/${reminder.company_slug}`,
            linkLabel: reminder.meeting_url ? 'Join interview' : `See ${reminder.company_name}`,
          },
          client,
        );
      }
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
