# Security checklist

This checks the code against the plan's security rules (section 8.8) and the launch tasks. It was last checked on 2026-11-08.

| Rule                                                                                                                        | Status     | Where                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| A tenant guard checks company membership and role on every company route                                                    | Done       | `TenantGuard` in `apps/api/src/common/guards.ts`                                 |
| Company queries always take the checked company id                                                                          | Done       | Every service filters on `tenant.companyId`                                      |
| Row-level security in PostgreSQL (optional in the plan)                                                                     | Not done   | The guard and the queries do this job. See below                                 |
| Passwords hashed with Argon2id                                                                                              | Done       | OWASP settings: 19 MiB, 2 passes, 1 lane                                         |
| Access token lasts 15 minutes                                                                                               | Done       | `ACCESS_TOKEN_TTL_SECONDS` in `auth/tokens.ts`                                   |
| Refresh token lasts 30 days, changes on each use, is stored hashed                                                          | Done       | `auth.service.ts`                                                                |
| Using an old refresh token ends that whole login                                                                            | Done       | Logged as `auth.refresh_reuse_detected`                                          |
| JWTs only accept HS256                                                                                                      | Done       | `app.module.ts`                                                                  |
| Extension tokens                                                                                                            | Not needed | There is no browser extension                                                    |
| Uploads: PDF or DOCX only, up to 5 MB, bytes checked, random name                                                           | Done       | `files/resume-check.ts`                                                          |
| Short-lived signed download links                                                                                           | Done       | `files/file-links.ts`, 5 minutes                                                 |
| A bad upload cannot hang the worker or use all its memory                                                                   | Done       | Read on a separate thread with limits                                            |
| 100 requests a minute for each person                                                                                       | Done       | `RATE_LIMIT_USER_PER_MIN`                                                        |
| 10 a minute for each address on login, sign up, forgotten password, apply                                                   | Done       | `@AuthRateLimit()`, also on reset, confirm and booking                           |
| Audit entries for failed logins (grouped), role changes, job publish and close, step moves, feedback and candidate deletion | Done       | `AuditService`. Nobody can change or delete entries, because a trigger stops it  |
| Admins can read the audit log                                                                                               | Done       | `GET /companies/:cid/audit-logs` and the Activity page                           |
| Security headers                                                                                                            | Done       | `helmet` on the API, and headers in `apps/web/next.config.ts`                    |
| Sign-in limits see the real visitor address behind proxies                                                                  | Done       | `TRUST_PROXY_HOPS`                                                               |
| CORS only from listed sites                                                                                                 | Done       | `CORS_ORIGINS`                                                                   |
| No known holes in dependencies                                                                                              | Done       | `pnpm audit` found none. CI fails on high ones                                   |
| Production refuses unsafe settings                                                                                          | Done       | Example secrets, the same secret twice, or cookies without `Secure` stop the API |
| Logs never hold passwords, tokens or resume text                                                                            | Done       | Only ids and results are logged                                                  |

## Why there is no row-level security

The plan calls it optional. Every company route already goes through the tenant guard, and every company query takes the company id the guard checked, which the tests check for each role. Adding row-level security would mean setting a database value on every request inside a transaction. That is a larger change than a launch check should make, so it is left as a later step.

## Error tracking

Errors are written as JSON logs with a request id, which also goes back to the browser in the error body. There is no paid error tracking service. A free hosted log viewer, or the host's own logs, is enough to find an error from the id a person reports. See `runbook.md`.
