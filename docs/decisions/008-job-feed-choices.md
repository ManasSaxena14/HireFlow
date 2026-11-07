# 008: Choices made for the job feed and alerts

**Status:** accepted

The plan left a few things open. These are the choices we made.

- **Greenhouse and Lever, not Remotive.** The plan gave Remotive as an example. Its API notice says showing its jobs in order to collect sign-ups or email addresses breaks its terms, and our feed is behind sign-in. Greenhouse and Lever both offer public APIs that companies use to share their jobs, so we read those. Check the terms of any new source before adding it.
- **Sources are data, not code.** `pnpm feed:sources` adds the starting list, and a migration does not. This keeps test databases free of sources, so tests never use the network.
- **Added `remote` to `feed_jobs`.** The API has a remote filter, but the plan's table has nowhere to keep the answer.
- **Added `last_seen_at`.** Sources do not tell us when a job closes, it just stops being listed. Jobs not seen for 7 days are hidden, and rows not seen for 30 days are deleted. The hide is a week so that a source being down for a day or two does not empty the feed.
- **Added `matched_at`.** The plan runs the matcher after new jobs are saved. If we passed it a list of new job ids, a crash between the two steps would lose those jobs. Instead it looks for every job with no `matched_at`, and sets it in the same transaction as the delivery rows.
- **Added `last_error` and a unique `name` to `feed_sources`.** The first says why a source failed. The second lets the sources script run twice safely.
- **A new alert only looks at new jobs.** The plan says the matcher runs after new jobs come in, and sending someone hundreds of old jobs the moment they save an alert would be a bad start.
- **Whole words only.** A `java` alert does not match JavaScript jobs.
- **One email per person, not per alert.** Everything waiting goes in one email, grouped by alert, with at most 20 jobs and a link to see the rest. A job that fits two alerts of the same frequency is listed once.
- **Daily emails go in the hour after 8 am.** The job runs every 15 minutes because some time zones are not on the hour. If the worker is down for that whole hour, jobs wait for the next morning.
- **Alerts go to confirmed addresses only.** Otherwise anyone could sign a stranger up for job emails. The screen tells people to confirm first.
- **Pausing or changing the search clears waiting jobs.** They were found with the old search, or the person asked for a break. Changing only the name or frequency keeps them.
- **Descriptions are plain text.** We remove the HTML when saving and show the result as text, so a source can never put code on our page. Links must start with http or https.
- **Added `GET /feed/jobs/:id`.** The list only carries a short summary, to keep it small. "Read more" loads the full text.
- **Fixtures are written by hand in the real shape.** We checked the shape against the live APIs. Using made-up companies keeps real job posts out of the repo.
