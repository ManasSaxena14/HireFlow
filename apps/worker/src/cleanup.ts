import type pg from 'pg';

/**
 * Removes rows nobody can use any more, so these tables do not grow forever.
 * Delivery rows only matter while an email job can still retry, which ends long before 30 days.
 */
export async function cleanUp(pool: pg.Pool) {
  const remove = async (sql: string) => (await pool.query(sql)).rowCount ?? 0;
  return {
    refreshTokens: await remove(
      `DELETE FROM refresh_tokens WHERE expires_at < now() - interval '1 day'`,
    ),
    emailTokens: await remove(
      `DELETE FROM email_tokens WHERE expires_at < now() - interval '1 day'`,
    ),
    emailDeliveries: await remove(
      `DELETE FROM email_deliveries WHERE sent_at < now() - interval '30 days'`,
    ),
  };
}
