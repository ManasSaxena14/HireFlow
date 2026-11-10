# Deploying HireFlow for free

This is a guide. The app has not been deployed yet, so there is no live address, and these steps have not been followed on a real host. Free plans change often, so check each one before you start.

## The shape

| Part           | Where                                     | Why                                                         |
| -------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Web (Next.js)  | A free Next.js host, such as Vercel       | Pages are served fast from many places and do not sleep     |
| API and worker | One free Node web service, such as Render | `pnpm start` runs both in one service                       |
| Database       | A free PostgreSQL host, such as Neon      | Needs the `btree_gist`, `pgcrypto` and `pg_trgm` extensions |

The browser only talks to the web site. The web site passes `/api/v1` requests on to the API, so the login cookie works without any cross-site setup.

## Keeping the free backend fast

Free web services sleep after about 15 minutes with no visits, and the first visit after that waits for it to wake. The app is built to make this as short and smooth as it can be:

- **Fast start.** The API answers about 0.7 seconds after Node starts, measured on a laptop. A free server has a much smaller CPU, so expect it to be several times slower there. Most of a wake is the host starting the machine, which the app cannot change. The start is kept short by:
  - starting the API first and the worker only once the API answers, so the two do not share the small CPU at the worst moment
  - saving Node's compiled code during the build (`pnpm build:render`), so each wake skips that work
  - starting Node directly instead of through `pnpm`
  - connecting the job queue in the background, and doing slow one-time work, such as the skill patterns and the spare password hash, on first use instead of at start
  - waiting two minutes after a wake before fetching the job feed
- **Waking starts early.** Every page asks the server to wake as soon as it opens, while the person is still reading.
- **Nothing fails while it wakes.** Reads and session checks wait and try again for up to about 70 seconds, and a small note says the server is starting. A change, like saving a job, is never sent twice.
- **Small enough for 512 MB.** `pnpm start` caps the API at 256 MB and the worker at 160 MB, and a resume is read on a thread capped at 128 MB. Change them with `API_MEMORY_MB` and `WORKER_MEMORY_MB`.
- **Light on a small CPU.** Passwords use Argon2id with the OWASP settings, which needs about a fifth of the work of the library default.
- **Safe with a sleeping database.** Free databases close idle links and sleep too. A closed link no longer stops the app, and a sleeping database gets 15 seconds to wake.
- **Few database links.** The API and worker use at most 21 links together.

**Open tabs keep it awake.** Screens ask the server again every 15 to 60 seconds while a tab is open and in view, so job boards stay current. A tab in the background does not ask. While someone has HireFlow open, the server does not sleep, and when everyone has left, it can.

**To stop it sleeping at all,** add a free uptime check that calls `https://<your-api>/api/v1/health` every 10 minutes, such as cron-job.org or UptimeRobot. One always-on service uses about 744 of the 750 free hours a month on Render. The health route does not touch the database, so it does not keep the database awake as well.

**While the backend sleeps, background jobs wait too.** Reminder emails, job alerts and the job feed run again when it wakes, and nothing is lost, but they can be late. The uptime check above avoids this.

## Steps

### 1. Database

Create a free PostgreSQL database. Use the direct connection string, not a pooled one. Then, from your own computer, run the database changes once:

```bash
DATABASE_URL="<the direct connection string>" pnpm db:migrate
```

Run this again after each release that adds a migration. It is not run on start, so that waking from sleep stays fast.

### 2. API and worker

Create a free Node web service from the GitHub repository.

| Setting       | Value                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Build command | `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build:render` |
| Start command | `node scripts/start-production.mjs`                                                   |
| Health check  | `/api/v1/health`                                                                      |

The repository has a `render.yaml` with these values, so on Render you can choose New, then Blueprint, and pick the repository. Render then asks only for the settings below that it cannot fill itself, and makes the two JWT secrets for you. `--prod=false` is needed because the build uses developer tools, and Render installs without them when `NODE_ENV` is `production`.

Settings:

| Name                                                            | Value                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                                                      | `production`                                                  |
| `APP_URL`                                                       | The web site's address, like https://hireflow.example         |
| `CORS_ORIGINS`                                                  | The same address                                              |
| `DATABASE_URL`                                                  | The direct connection string                                  |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                       | Two different values from `openssl rand -base64 48`           |
| `COOKIE_SECURE`                                                 | `true`. The API will not start without it                     |
| `TRUST_PROXY_HOPS`                                              | `2`, because requests pass the web host and then the API host |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | A free mail service. The worker will not start without a host |

**About resumes:** a free service has no lasting disk, so uploaded resumes are lost when it restarts or sleeps. Leave `UPLOAD_DIR` unset to use the default folder. To keep resumes, use a paid disk and point `UPLOAD_DIR` at it, or add a new `FileStorage` class for a free object store. Everything else works without it.

**About `TRUST_PROXY_HOPS`:** sign-in limits count by visitor address. If it is too low, every visitor shares the web host's address, and ten sign-ins a minute would lock everyone out. After deploying, sign in from two networks and check the API log shows two different addresses.

Then add the job boards once, from your own computer:

```bash
DATABASE_URL="<the direct connection string>" pnpm feed:sources
```

### 3. Web

Create a free Next.js project from the same repository.

| Setting          | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Root directory   | The repository root                                  |
| Install command  | `corepack enable && pnpm install --frozen-lockfile`  |
| Build command    | `pnpm build:web`                                     |
| Output directory | `apps/web/.next`                                     |
| `API_URL`        | The API's address, like https://hireflow-api.example |

`API_URL` must be set **before the build**, because Next.js writes the forwarding rule into the build.

### 4. Check it

1. Open `https://<your-api>/api/v1/ready`. It should say `{"status":"ready"}`.
2. Open the web site, sign up, and confirm the email.
3. Add the uptime check from above.

`pnpm db:seed` only runs in development, so a live site has no demo accounts until you add them yourself.

## After each release

CI runs on every push to `main` and on every pull request. Check that it is green before you release. If the release adds a migration, run `pnpm db:migrate` against the live database first, then let the hosts deploy.
