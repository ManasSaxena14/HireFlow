# 011: Choices made in the launch checks

**Status:** accepted

The plan's last phase adds no features. These are the choices made while checking the app.

- **One index, because only one query needed it.** Query plans on large test data were fast everywhere except searching the feed by place, which read the whole table. A trigram index fixed that. Other indexes were not added, because each one slows down writes.
- **The admin audit log route was added.** The plan lists `GET /companies/:cid/audit-logs`, but no earlier phase built it, and the security rules need admins to be able to read the log. It is read only, for admins, and has a page called Activity.
- **The API docs are made from the code.** `pnpm --filter @hireflow/api openapi` walks the Nest routes and the zod schemas their pipes check, and writes `docs/openapi.json`. A test fails if the file and the code ever differ. Answers are not described in detail, because their shapes are already the types in `packages/shared`.
- **Public careers pages may be kept for a minute.** They are the same for everyone, so they send `Cache-Control: public, max-age=60`. A closed job can show for up to a minute longer.
- **No paid error tracking.** Logs have a request id that also reaches the browser, which is enough to find an error. See `security.md`.
- **Not deployed.** Deploying needs accounts on hosting services, which only the owner can create. `deployment.md` is the guide.
- **The results are written down as measured,** including the 200-user test that missed the target, in `performance.md`.
