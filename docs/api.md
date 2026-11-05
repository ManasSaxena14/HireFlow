# API reference

Base path `/api/v1`. JSON only.

Access levels: **Public**, **User** (signed in), **Member** (belongs to the company in the path), or a named role.

## Errors

```json
{
  "error": {
    "code": "DUPLICATE_JOB",
    "message": "This job is already on your board.",
    "details": [{ "existingId": "…" }],
    "requestId": "req_…"
  }
}
```

| Code               | Status |
| ------------------ | ------ |
| `VALIDATION_ERROR` | 400    |
| `UNAUTHENTICATED`  | 401    |
| `FORBIDDEN`        | 403    |
| `NOT_FOUND`        | 404    |
| `CONFLICT`         | 409    |
| `DUPLICATE_JOB`    | 409    |
| `RATE_LIMITED`     | 429    |
| `INTERNAL`         | 500    |

Lists are cursor based: `?limit=20&cursor=…` returns `{ items, nextCursor }`.

## Auth and account

| Method | Path                    | Access | Notes                                                     |
| ------ | ----------------------- | ------ | --------------------------------------------------------- |
| POST   | `/auth/register`        | Public | Creates the account and sends a verification email        |
| POST   | `/auth/login`           | Public | Returns an access token and sets the refresh cookie       |
| POST   | `/auth/refresh`         | Public | Rotates the cookie; reusing an old one revokes the family |
| POST   | `/auth/logout`          | User   | Ends this session                                         |
| POST   | `/auth/logout-all`      | User   | Ends every session                                        |
| POST   | `/auth/verify-email`    | Public | Body `{ token }`, single use                              |
| POST   | `/auth/forgot-password` | Public | Always answers 200                                        |
| POST   | `/auth/reset-password`  | Public | Body `{ token, password }`, ends all sessions             |
| GET    | `/me`                   | User   | Profile with company memberships                          |
| PATCH  | `/me`                   | User   | Name and time zone                                        |

## Companies

| Method | Path                           | Access | Notes                                          |
| ------ | ------------------------------ | ------ | ---------------------------------------------- |
| POST   | `/companies`                   | User   | The creator becomes admin                      |
| GET    | `/companies/:cid`              | Member |                                                |
| PATCH  | `/companies/:cid`              | Admin  | Audited                                        |
| POST   | `/companies/:cid/members`      | Admin  | Body `{ email, role }`, existing accounts only |
| PATCH  | `/companies/:cid/members/:uid` | Admin  | Audited; keeps at least one admin              |
| DELETE | `/companies/:cid/members/:uid` | Admin  | Audited; keeps at least one admin              |

## Tracker

All routes are limited to the signed-in user's own data. Anyone else's id returns 404.

| Method | Path                                  | Notes                                              |
| ------ | ------------------------------------- | -------------------------------------------------- |
| GET    | `/tracker/applications`               | Filters: `status`, `q`, `tag`, `archived`          |
| POST   | `/tracker/applications`               | 409 `DUPLICATE_JOB` with the existing card's id    |
| GET    | `/tracker/applications/:id`           | Includes reminders                                 |
| PATCH  | `/tracker/applications/:id`           | Edit fields, or `{ archived: false }` to restore   |
| POST   | `/tracker/applications/:id/move`      | Body `{ toStatus, note? }`, writes history         |
| DELETE | `/tracker/applications/:id`           | Archives and cancels pending reminders             |
| GET    | `/tracker/applications/:id/events`    | Status history, oldest first                       |
| GET    | `/tracker/applications/:id/notes`     | Newest first                                       |
| POST   | `/tracker/applications/:id/notes`     | Body `{ body }`                                    |
| POST   | `/tracker/applications/:id/reminders` | Body `{ remindAt, message }`                       |
| GET    | `/tracker/stats`                      | Counts, weekly applications, response rate, funnel |

## Notifications

| Method | Path                      | Notes                          |
| ------ | ------------------------- | ------------------------------ |
| GET    | `/notifications`          | Adds `unreadCount` to the page |
| POST   | `/notifications/:id/read` |                                |
| POST   | `/notifications/read-all` |                                |

## Operations

| Method | Path      | Notes                          |
| ------ | --------- | ------------------------------ |
| GET    | `/health` | Process is up                  |
| GET    | `/ready`  | Process can reach the database |
