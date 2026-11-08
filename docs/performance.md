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

Measured with `pnpm start`, which runs the API and the worker together, three times in a row.

| What                             | Result                                                    |
| -------------------------------- | --------------------------------------------------------- |
| From start to `/ready` answering | 1.9 s, 1.1 s, 1.0 s                                       |
| API memory once started          | 232 MB                                                    |
| Worker memory once started       | 100 MB                                                    |
| Checking one password            | 27 ms with the OWASP settings, 42 ms with the old default |

## Data in the database

`scripts/load/seed-volume.sql` added 5,000 people, 200,000 jobs on their boards, 200,000 notifications, 50,000 job feed posts and 30,000 practice sessions, so that slow queries would show up.

## Load tests

The plan's target is that 95% of requests finish in under 300 ms, with under 1% errors. Each test ramps up for 20 seconds, holds for 1 minute and ramps down for 10 seconds. Every person waits 1 second between rounds. The numbers below are for 95% of requests.

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

To run the tests yourself, start the API on a database you can throw away, then:

```bash
k6 run scripts/load/read-heavy.js
k6 run scripts/load/mixed.js
VUS=200 k6 run scripts/load/read-heavy.js
```

`API_URL` sets the address, and the default is http://localhost:4100. `VUS` and `DURATION` change the load.

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
| API         | 309   | 97.4% | 91.5%    |
| Worker      | 58    | 70.1% | 72.1%    |
| Shared code | 38    | 65.1% | 66.9%    |

The worker's start-up file and the thread that reads files are covered by the browser tests, not these. Many shared checks are tested through the API tests, which this number does not count.

There are also 24 browser tests, which run in CI on every pull request.

## Not measured

- **Lighthouse scores.** Running Lighthouse needs it downloaded from npm, and that was not allowed on this machine during this check. To measure them, run Lighthouse from Chrome's DevTools on the public pages.
- **A live server.** The app is not deployed yet, so nothing here was measured over a real network. See `deployment.md`.
