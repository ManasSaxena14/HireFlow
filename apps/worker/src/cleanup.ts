import type pg from 'pg';

/**
 * Removes rows nobody can use any more, so these tables do not grow forever.
 * Delivery rows only matter while an email job can still retry, which ends long before 30 days.
 */
export async function cleanUp(pool: pg.Pool) {
  const remove = async (sql: string) => (await pool.query(sql)).rowCount ?? 0;
  return {
    emailDeliveries: await remove(
      `DELETE FROM email_deliveries WHERE sent_at < now() - interval '30 days'`,
    ),
    // A job gone from its source for this long is closed. Its alert rows go with it.
    feedJobs: await remove(`DELETE FROM feed_jobs WHERE last_seen_at < now() - interval '30 days'`),
  };
}
