# Help for running the app

## What runs

| Part           | Command                             | Notes                               |
| -------------- | ----------------------------------- | ----------------------------------- |
| Web app        | `pnpm --filter @hireflow/web start` | Needs `API_URL` when you build it   |
| API            | `node apps/api/dist/main.js`        | Uses `PORT`                         |
| Worker         | `node apps/worker/dist/main.js`     | Needs `SMTP_HOST` in production     |
| API and worker | `pnpm start`                        | For hosting that allows one process |

## Where resumes are saved

Resumes are files in the `UPLOAD_DIR` folder, and the database only keeps their names. Back up this folder together with the database. On a host that wipes its disk when it restarts, point `UPLOAD_DIR` at a lasting disk.

## Releasing a new version

Run the database changes before you start the new API:

```bash
pnpm db:migrate
```

To undo the last database change:

```bash
pnpm db:rollback
```

## Job sources

Add the starting list once, after the first release. It is safe to run again:

```bash
pnpm feed:sources
```

To see how each source is doing, or turn one off:

```sql
SELECT name, enabled, last_run_at, last_status, last_error FROM feed_sources ORDER BY name;
UPDATE feed_sources SET enabled = false WHERE name = 'Stripe';
```

A source marked `failed` does not stop the others, and it is tried again 30 minutes later. Turning a source off hides its jobs. Before adding a source, check that its terms allow this use.

## Settings the app refuses in production

The API will not start in production if `COOKIE_SECURE` is not `true`, or if a secret still has the example value. The two secrets must always be different.

## Old rows

Each night at 03:00 the worker removes login tokens and email links that ran out over a day ago, email delivery rows older than 30 days, and jobs not seen at their source for 30 days. The log line is `old rows removed`.

## Checking the app

- `GET /api/v1/health` answers if the app is running.
- `GET /api/v1/ready` also checks the database. A 503 means the app is running but cannot reach PostgreSQL.

## Common problems

**Emails are not arriving.** Look for `mail job done` in the worker log. A failed email is tried five more times, with longer waits. To see stuck emails, look in `pgboss.job` where `name = 'mail'`.

**Reminders are late.** The worker checks for reminders once a minute. If the worker was down, reminders go out when it comes back, once each. Reminders for an interview that has already started are skipped.

**Someone keeps getting signed out.** Look for `auth.refresh_reuse_detected` in `audit_logs`. It means an old login token was used, which can mean a stolen cookie.

**PostgreSQL will not start on a Mac.** Read `.pgdata/server.log`. A locale error means `LC_ALL` is not set correctly. `scripts/local-db.sh` sets a default for you.
