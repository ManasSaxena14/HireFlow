# Runbook

## Processes

| Process      | Command                             | Notes                              |
| ------------ | ----------------------------------- | ---------------------------------- |
| Web          | `pnpm --filter @hireflow/web start` | Needs `API_URL` at build           |
| API          | `node apps/api/dist/main.js`        | Reads `PORT`                       |
| Worker       | `node apps/worker/dist/main.js`     | Requires `SMTP_HOST` in production |
| API + worker | `pnpm start`                        | For hosts with one process slot    |

## Releasing

Run migrations before starting the new API version:

```bash
pnpm db:migrate
```

To undo the most recent migration:

```bash
pnpm db:rollback
```

## Checks

- `GET /api/v1/health` answers while the process is up.
- `GET /api/v1/ready` also checks the database. A 503 here means the API is up but cannot reach PostgreSQL.

## Common problems

**Emails are not arriving.** Check the worker log for `mail job done`. Failed sends retry five times with backoff. To see what is stuck, query `pgboss.job` where `name = 'mail'`.

**Reminders are late.** The scan runs once a minute inside the worker. If the worker is down, reminders wait and go out when it returns, in order and only once.

**A user keeps being signed out.** Look for `auth.refresh_reuse_detected` in `audit_logs`. It means an already-used refresh token was presented, usually a stolen cookie or a client bypassing the browser's refresh lock.

**PostgreSQL will not start locally on macOS.** See `.pgdata/server.log`. A locale error means `LC_ALL` is unset or invalid; `scripts/local-db.sh` sets a default.
