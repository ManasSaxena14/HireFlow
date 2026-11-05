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

## Checking the app

- `GET /api/v1/health` answers if the app is running.
- `GET /api/v1/ready` also checks the database. A 503 means the app is running but cannot reach PostgreSQL.

## Common problems

**Emails are not arriving.** Look for `mail job done` in the worker log. A failed email is tried five more times, with longer waits. To see stuck emails, look in `pgboss.job` where `name = 'mail'`.

**Reminders are late.** The worker checks for reminders once a minute. If the worker was down, reminders go out when it comes back, once each.

**Someone keeps getting signed out.** Look for `auth.refresh_reuse_detected` in `audit_logs`. It means an old login token was used, which can mean a stolen cookie.

**PostgreSQL will not start on a Mac.** Read `.pgdata/server.log`. A locale error means `LC_ALL` is not set correctly. `scripts/local-db.sh` sets a default for you.
