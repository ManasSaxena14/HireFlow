# Speed and test results

Every number here was measured on 2026-11-08. Nothing is estimated. Where a target was missed, it says so.

## The machine

One laptop ran everything at once: the API, PostgreSQL and the load test tool.

| Part       | What                                        |
| ---------- | ------------------------------------------- |
| Computer   | Apple M3, 8 cores, 8 GB memory              |
| Node       | 22.16.0, one API process, 10 database links |
| PostgreSQL | 15.19                                       |
| Load tool  | k6 2.3.0                                    |

The API ran from its production build (`NODE_ENV=production`) on its own database. Rate limits were raised for the test, because k6 sends everything from one address and a few accounts.

## Start-up

Measured with `node scripts/start-production.mjs`, which runs the API and then the worker, after `pnpm build:render`, three times in a row.

| What                              | Result                                                                 |
| --------------------------------- | ---------------------------------------------------------------------- |
| From start to `/health` answering | 0.73 s, 0.71 s, 0.71 s (before the start-up work: 1.3 s, 0.9 s, 1.3 s) |
| API memory once started           | 232 MB                                                                 |
| Worker memory once started        | 100 MB                                                                 |

## Data in the database

`scripts/load/seed-volume.sql` added 5,000 people, 200,000 jobs on their boards, 200,000 notifications, 50,000 job feed posts and 30,000 practice sessions, so that slow queries would show up.

## Load tests

The plan's target is that 95% of requests finish in under 300 ms, with under 1% errors. Each test ramps up for 20 seconds, holds for 1 minute and ramps down for 10 seconds. Every person waits 1 second between rounds. The numbers below are for 95% of requests.

### After sign-in moved to Neon Auth, 50 people at once: passed

Measured on 2026-11-10 with the token stand-in, on the same laptop and the same data. The API now checks an Ed25519 signature on every request and remembers each account for a minute.

| Test                   | Requests | Errors | 95% under |
| ---------------------- | -------- | ------ | --------- |
| Read-heavy             | 25,303   | 0      | 23 ms     |
| Mixed reads and writes | 20,015   | 0      | 13 ms     |

The laptop was quieter than in the earlier runs below, so the drop from 106 ms is mostly the machine, not the change. The point is that checking the new tokens did not make anything slower. Start a new token stand-in for each run: the setup adds the same jobs again for the same people, and those answers count as errors.

### Read-heavy, 50 people at once: passed

20,836 requests, 222 a second, 0 errors.

| Request                   | 95% under |
| ------------------------- | --------- |
| All requests              | 106 ms    |
| Job board                 | 125 ms    |
| Board numbers             | 131 ms    |
| Practice numbers          | 144 ms    |
| Notifications             | 97 ms     |
| Job feed, search by words | 85 ms     |
| Job feed, remote only     | 96 ms     |
| Public careers page       | 69 ms     |

An earlier run of the same test, before the place index below, gave 57 ms for all requests. The laptop was doing other work during the run above, so the two runs show how much a shared machine can vary.

### Mixed reads and writes, 50 people at once: passed

19,687 requests, 212 a second, 0 errors. About a third of the rounds also add a job, move it, add a note and log practice.

| Request         | 95% under |
| --------------- | --------- |
| All requests    | 38 ms     |
| Add a job       | 49 ms     |
| Move a job      | 51 ms     |
| Add a note      | 36 ms     |
| Log practice    | 46 ms     |
| Job board       | 33 ms     |
| Board numbers   | 43 ms     |
| Job feed search | 20 ms     |
| Notifications   | 27 ms     |

### Read-heavy, 200 people at once: failed the speed target

48,822 requests, 522 a second, 0 errors. 95% of requests finished in under 525 ms, which misses the 300 ms target. The slowest kind was notifications at 627 ms. One request took 2.25 seconds.

The CPU was the limit. One Node process uses one core, and k6 and PostgreSQL were on the same laptop. The query plans below stay under a few milliseconds, so the time was spent waiting for the process, not in the database. Running two or more API processes behind a load balancer is the next step if this many people use it at once. Rate limits would then need a shared store, as the README says.

To run the tests yourself, start the stand-in for sign-in, which serves a test key and writes tokens for k6. Start the API on a database you can throw away with `NEON_AUTH_BASE_URL=http://127.0.0.1:4199/auth`, then run k6 with `TOKENS_FILE` set to the path the stand-in prints:

```bash
node scripts/load/auth-stub.mjs
TOKENS_FILE=<path> k6 run scripts/load/read-heavy.js
TOKENS_FILE=<path> k6 run scripts/load/mixed.js
TOKENS_FILE=<path> VUS=200 k6 run scripts/load/read-heavy.js
```

`API_URL` sets the address, and the default is http://localhost:4100. `VUS` and `DURATION` change the load, and `USERS` on the stand-in sets how many people sign in. These numbers were measured before sign-in moved to Neon Auth. The API now checks a token's signature instead of a shared secret, which costs a little more on each request.

## Query plans

`EXPLAIN ANALYZE` was run on the busiest queries with the data above.

| Query                                  | Plan                                        | Time    |
| -------------------------------------- | ------------------------------------------- | ------- |
| Job feed, newest first                 | Index scan on `feed_jobs_newest`            | 0.06 ms |
| Job feed, search by a common word      | Index scan on `feed_jobs_newest`            | 0.10 ms |
| Job feed, search by a rare word        | Bitmap scan on `feed_jobs_search`           | 0.10 ms |
| Job feed, place with no match (before) | **Read all 50,000 rows**                    | 37.4 ms |
| Job feed, place with no match (after)  | Bitmap scan on the new trigram index        | 0.13 ms |
| A person's job board                   | Bitmap scan on `ta_user_created`            | 3.8 ms  |
| Board numbers by status                | Index only scan on `ta_user_status`         | 0.8 ms  |
| Unread notifications count             | Bitmap scan on `notifications_user_created` | 0.3 ms  |
| Jobs waiting for the alert matcher     | Index scan on `feed_jobs_not_matched`       | 0.02 ms |
| Nightly clean-up of old feed jobs      | Index only scan on `feed_jobs_last_seen`    | 0.05 ms |

Only one index was added, because only one query needed it: searching the feed by place uses `ILIKE '%text%'`, which a normal index cannot help with. Migration `010_location_search_index.sql` adds a trigram index for it.

## Test coverage

From `pnpm coverage`, counting lines in each part's own `src` folder.

| Part        | Tests | Lines | Branches |
| ----------- | ----- | ----- | -------- |
| API         | 315   | 96.7% | 91.3%    |
| Worker      | 58    | 70.3% | 72.7%    |
| Shared code | 38    | 65.5% | 66.9%    |

The worker's start-up file and the thread that reads files are covered by the browser tests, not these. Many shared checks are tested through the API tests, which this number does not count.

There are also 30 browser tests, which run in CI on every push to `main` and on every pull request. They sign up through the local Neon Auth stand-in and type the real email code.

## Not measured

- **Lighthouse scores.** Running Lighthouse needs it downloaded from npm, and that was not allowed on this machine during this check. To measure them, run Lighthouse from Chrome's DevTools on the public pages.
- **A live server.** The app is not deployed yet, so nothing here was measured over a real network. See `deployment.md`.
