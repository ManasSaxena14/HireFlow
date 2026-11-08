# Deploying HireFlow

This is a guide. The app has not been deployed yet, so there is no live address, and these steps have not been followed on a real host.

## What runs

| Part     | What it is                     | Needs                                                  |
| -------- | ------------------------------ | ------------------------------------------------------ |
| Web      | Next.js on port 3000           | `API_URL`, the address of the API                      |
| API      | NestJS on `PORT`, default 4000 | PostgreSQL, the settings below, and a folder for files |
| Worker   | Node, no port                  | The same database and the same file folder as the API  |
| Database | PostgreSQL 15 or newer         | The `btree_gist`, `pgcrypto` and `pg_trgm` extensions  |

The API and the worker must share one file folder, because the API saves resumes and the worker reads them. `pnpm start` runs both in one process for this reason. There is no Docker.

## A free setup

Free plans change often, so check each one before you start.

1. **Database:** a free PostgreSQL host that allows the three extensions above.
2. **API and worker:** one Node web service that runs `pnpm start`, with a disk that survives a restart for `UPLOAD_DIR`. Without a lasting disk, uploaded resumes are lost when it restarts.
3. **Web:** a host for Next.js, with `API_URL` set to the API's address. The web app sends `/api/v1` requests on to the API, so the browser only talks to one site.

## Steps

1. Build: `pnpm install --frozen-lockfile && pnpm build`.
2. Set the settings below on the API service.
3. Run the database changes once: `pnpm db:migrate`.
4. Start: `pnpm start` for the API and worker, and `pnpm --filter @hireflow/web exec next start` for the web app.
5. Check that `GET /api/v1/ready` answers `{"status":"ready"}`.
6. Add the job boards once: `pnpm feed:sources`.
7. Set an uptime check on `/api/v1/health`.

`pnpm db:seed` only runs in development, so a live site has no demo accounts until you add them yourself.

## Settings

| Name                                                            | Value                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| `NODE_ENV`                                                      | `production`                                              |
| `APP_URL`                                                       | The web address people use, like https://hireflow.example |
| `CORS_ORIGINS`                                                  | The same address                                          |
| `DATABASE_URL`                                                  | The database address                                      |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                       | Two different values from `openssl rand -base64 48`       |
| `COOKIE_SECURE`                                                 | `true`. The API will not start without it                 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | A mail service. The worker will not start without a host  |
| `UPLOAD_DIR`                                                    | A full path on the lasting disk                           |
| `RATE_LIMIT_USER_PER_MIN`, `RATE_LIMIT_AUTH_PER_MIN`            | Keep the defaults, 100 and 10                             |

## After each release

CI runs on every pull request, and `main` only takes changes that pass it. Run `pnpm db:migrate` before starting the new version, then check `/api/v1/ready`.
