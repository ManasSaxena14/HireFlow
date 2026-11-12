# Deploying HireFlow for free

This is a guide. The app has not been deployed yet, so there is no live address, and these steps have not been followed on a real host. Free plans change often, so check each one before you start.

## The shape

| Part           | Where                                     | Why                                                         |
| -------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Web (Next.js)  | A free Next.js host, such as Vercel       | Pages are served fast from many places and do not sleep     |
| API and worker | One free Node web service, such as Render | `pnpm start` runs both in one service                       |
| Database       | A free PostgreSQL host, such as Neon      | Needs the `btree_gist`, `pgcrypto` and `pg_trgm` extensions |
| Sign-in        | Neon Auth, in the same Neon project       | Free for up to 60,000 users a month                         |

The browser only talks to the web site. The web site passes `/api/v1` requests on to the API, and `/api/auth` requests on to Neon Auth, so nothing needs cross-site setup.

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

**To keep it awake,** the repository has a GitHub Actions workflow, `.github/workflows/keep-alive.yml`, that runs every 12 minutes and asks `/api/v1/health`, but only inside the hours the free plans can pay for. It is free because the repository is public.

**How the hours are chosen.** The worker runs in the same Render service and asks the database for work every few seconds, so while Render is awake, the Neon database is awake too. Render's 750 free hours cover a whole month. Neon's free 100 compute hours do not: that is 400 hours at the smallest size, and Neon stops the database until the next month when they run out. So each run of `scripts/keep-alive.mjs`:

1. Reads Neon's real usage for this month through the Neon API.
2. Keeps 8% back for visits at other times, and works out how many awake hours a day are still affordable until the month ends.
3. Pings only inside that many hours, counted from the daily start (08:00 in India by default).

At the start of a month that is about 12 hours a day. Unused hours make later days longer, heavy use makes them shorter, and when the budget is spent it stops pinging. Visits at other times still wake both, and their cost is counted on the next run. Without a Neon API key it uses a fixed 10 hour window, which also fits.

Set it up once Render is live. In GitHub, open the repository, then **Settings**, **Secrets and variables**, **Actions**:

| Kind     | Name                 | Value                                                                                                                                                |
| -------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret   | `RENDER_BACKEND_URL` | The Render address with no path, like `https://hireflow-api.onrender.com`                                                                            |
| Secret   | `NEON_API_KEY`       | A Neon API key. In the Neon console, create a project-scoped key for HireFlow under the organization's **API keys**, so it can only see this project |
| Variable | `NEON_PROJECT_ID`    | `orange-tooth-36639358`                                                                                                                              |
| Variable | `KEEP_ALIVE_START`   | Optional. The daily start in UTC as `HH:MM`. The default `02:30` is 08:00 in India                                                                   |

Then open the **Actions** tab, choose **Keep the backend awake**, and press **Run workflow**. The log shows this month's Neon usage, the affordable hours a day, and `Try 1: HTTP 200` when it is inside them.

Also set the Neon compute's largest size to 0.25 CU (Branches, production, compute settings). The script measures the real cost of an awake hour either way, but a fixed size makes every day the same length.

Some things to know:

- GitHub can start a scheduled run a few minutes late when it is busy, so the server may still sleep now and then. The browser waits for a waking server, so a late run only means one slow first visit.
- GitHub turns scheduled workflows off after 60 days with no pushes to a public repository. Push a change, or turn it on again in the Actions tab.
- Only one free Render service fits in Render's 750 hours a month.
- Outside the awake hours, the server sleeps, so reminder emails, job alerts and the job feed can wait until the next visit or the next morning.

**While the backend sleeps, background jobs wait too.** Reminder emails, job alerts and the job feed run again when it wakes, and nothing is lost, but they can be late. The uptime check above avoids this.

## Steps

### 1. Database

Create a free PostgreSQL database. Use the direct connection string, not a pooled one. Then, from your own computer, run the database changes once:

```bash
DATABASE_URL="<the direct connection string>" pnpm db:migrate
```

Run this again after each release that adds a migration. It is not run on start, so that waking from sleep stays fast.

### 2. Sign-in (Neon Auth)

Turn on Auth in the Neon project, under **Auth**. Then set these on the live branch. The `neon` command line tool can do the first four, as shown:

| Setting                     | Value                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Email and password sign-in  | On                                                                                                                                                                             |
| Email confirmation          | Required, with a 6 digit code: `neon neon-auth config email-password update --require-email-verification --send-verification-email-on-sign-up --email-verification-method otp` |
| End other sessions on reset | On: `--revoke-sessions-on-password-reset` on the same command                                                                                                                  |
| Trusted domains             | Add the web site's address once you have it: `neon neon-auth domain add https://<your-site>`                                                                                   |
| Allow Localhost             | Off once the live site works, under Settings, Better Auth                                                                                                                      |
| Email provider              | Choose "Custom SMTP provider" under Settings, Better Auth, with the same SMTP settings as the API host below. The shared one works for a quick test                            |
| Auth URL                    | `neon neon-auth status` shows it as Base URL. It is `NEON_AUTH_BASE_URL` for both hosts below                                                                                  |

### 3. API and worker

Create a free Node web service from the GitHub repository, in the same region as the database. The HireFlow Neon project is in Singapore, so `render.yaml` uses Singapore.

| Setting       | Value                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Build command | `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build:render` |
| Start command | `node scripts/start-production.mjs`                                                   |
| Health check  | `/api/v1/health`                                                                      |

The repository has a `render.yaml` with these values, so on Render you can choose New, then Blueprint, and pick the repository. Render then asks only for the settings below that it cannot fill itself. It makes `LINK_SECRET` for you, and `render.yaml` already holds the Auth URL and the SMTP port. `--prod=false` is needed because the build uses developer tools, and Render installs without them when `NODE_ENV` is `production`.

Settings:

| Name                                                            | Value                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                                                      | `production`                                                  |
| `APP_URL`                                                       | The web site's address, like https://hireflow.example         |
| `CORS_ORIGINS`                                                  | The same address                                              |
| `DATABASE_URL`                                                  | The direct connection string                                  |
| `NEON_AUTH_BASE_URL`                                            | The Auth URL from step 2                                      |
| `LINK_SECRET`                                                   | Made by Render. Or any value from `openssl rand -base64 48`   |
| `TRUST_PROXY_HOPS`                                              | `2`, because requests pass the web host and then the API host |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | A free mail service. The worker will not start without a host |

**About resumes:** a free service has no lasting disk, so uploaded resumes are lost when it restarts or sleeps. Leave `UPLOAD_DIR` unset to use the default folder. To keep resumes, use a paid disk and point `UPLOAD_DIR` at it, or add a new `FileStorage` class for a free object store. Everything else works without it.

**About `TRUST_PROXY_HOPS`:** the limits on the public apply and booking forms count by visitor address. If it is too low, every visitor shares the web host's address, and ten applications a minute would lock everyone out. After deploying, apply from two networks and check the API log shows two different addresses.

Then add the job boards once, from your own computer:

```bash
DATABASE_URL="<the direct connection string>" pnpm feed:sources
```

### 4. Web

Create a free Next.js project on Vercel from the same repository, and set **Root Directory** to `apps/web`. The `apps/web/vercel.json` file tells Vercel to install from the repository root and to build with `pnpm build:web`, so leave the commands as they are.

Settings on the web host:

| Name                           | Value                                                               |
| ------------------------------ | ------------------------------------------------------------------- |
| `API_URL`                      | The API's address on Render, like https://hireflow-api.onrender.com |
| `NEON_AUTH_BASE_URL`           | The same Auth URL as the API                                        |
| `NEON_AUTH_COOKIE_SECRET`      | A value from `openssl rand -base64 32`, at least 32 long            |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`, so Vercel uses the pnpm version the repository names           |

All of them must be set **before the build**. Next.js writes the forwarding rule for `API_URL` into the build, and the build stops with a clear message if the Neon settings are missing.

When the site is live, put its address in `APP_URL` and `CORS_ORIGINS` on Render, and add it to Neon's trusted domains (step 2).

### 5. Check it

1. Open `https://<your-api>/api/v1/ready`. It should say `{"status":"ready"}`.
2. Open the web site, sign up, and type the code Neon Auth emails you.
3. Add the `RENDER_BACKEND_URL` secret so the keep-alive workflow runs (see above).

`pnpm db:seed` only runs in development, so a live site has no demo accounts until you add them yourself.

## After each release

CI runs on every push to `main` and on every pull request. Check that it is green before you release. If the release adds a migration, run `pnpm db:migrate` against the live database first, then let the hosts deploy.
