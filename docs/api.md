# API list

All routes start with `/api/v1`. They use JSON.

Who can use a route: **Public** (anyone), **User** (signed in), **Member** (in the company in the path), **Team** (admin, recruiter or hiring manager), **Admin** (company admin).

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

Lists come in pages: `?limit=20&cursor=…` returns `{ items, nextCursor }`.

## Account

| Method | Path                    | Who    | What it does                                      |
| ------ | ----------------------- | ------ | ------------------------------------------------- |
| POST   | `/auth/register`        | Public | Creates an account and sends a confirm email      |
| POST   | `/auth/login`           | Public | Returns an access token and sets the login cookie |
| POST   | `/auth/refresh`         | Public | Swaps the cookie for a new one                    |
| POST   | `/auth/logout`          | User   | Signs out on this device                          |
| POST   | `/auth/logout-all`      | User   | Signs out on all devices                          |
| POST   | `/auth/verify-email`    | Public | Body `{ token }`. Works once                      |
| POST   | `/auth/forgot-password` | Public | Always answers 200                                |
| POST   | `/auth/reset-password`  | Public | Body `{ token, password }`. Signs out everywhere  |
| GET    | `/me`                   | User   | Your profile and companies                        |
| PATCH  | `/me`                   | User   | Change your name or time zone                     |

## Companies

| Method | Path                           | Who    | What it does                                        |
| ------ | ------------------------------ | ------ | --------------------------------------------------- |
| POST   | `/companies`                   | User   | Creates a company. You become the admin             |
| GET    | `/companies/:cid`              | Member | Reads the company                                   |
| PATCH  | `/companies/:cid`              | Admin  | Changes the company                                 |
| GET    | `/companies/:cid/members`      | Team   | Lists the people in the company                     |
| POST   | `/companies/:cid/members`      | Admin  | Body `{ email, role }`. The person needs an account |
| PATCH  | `/companies/:cid/members/:uid` | Admin  | Changes a role. One admin must stay                 |
| DELETE | `/companies/:cid/members/:uid` | Admin  | Removes a member. One admin must stay               |

## Job board

You can only reach your own jobs. Anyone else's job id returns a 404.

| Method | Path                                  | What it does                                          |
| ------ | ------------------------------------- | ----------------------------------------------------- |
| GET    | `/tracker/applications`               | Lists jobs. Filters: `status`, `q`, `tag`, `archived` |
| POST   | `/tracker/applications`               | Adds a job. A copy returns 409 `DUPLICATE_JOB`        |
| GET    | `/tracker/applications/:id`           | Reads a job and its reminders                         |
| PATCH  | `/tracker/applications/:id`           | Edits a job. `{ archived: false }` brings it back     |
| POST   | `/tracker/applications/:id/move`      | Body `{ toStatus, note? }`. Saves to history          |
| DELETE | `/tracker/applications/:id`           | Archives the job and cancels its reminders            |
| GET    | `/tracker/applications/:id/events`    | History, oldest first                                 |
| GET    | `/tracker/applications/:id/notes`     | Notes, newest first                                   |
| POST   | `/tracker/applications/:id/notes`     | Body `{ body }`                                       |
| POST   | `/tracker/applications/:id/reminders` | Body `{ remindAt, message }`                          |
| GET    | `/tracker/stats`                      | Counts, jobs per week, reply rate and steps           |

The `screening` and `withdrawn` statuses show as "First round" and "Dropped" on screen.

## Hiring

Everything below starts with `/companies/:cid`. Someone from another company always gets a 404.

| Method | Path                                | Who    | What it does                                                                     |
| ------ | ----------------------------------- | ------ | -------------------------------------------------------------------------------- |
| GET    | `/jobs`                             | Member | Lists jobs. Filter with `status`                                                 |
| POST   | `/jobs`                             | Team   | Creates a draft job with the normal steps                                        |
| GET    | `/jobs/:id`                         | Member | Reads a job and its steps                                                        |
| PATCH  | `/jobs/:id`                         | Team   | Changes a job. A hiring manager can only change their own                        |
| POST   | `/jobs/:id/publish`                 | Team   | Makes the job live                                                               |
| POST   | `/jobs/:id/close`                   | Team   | Closes the job                                                                   |
| GET    | `/jobs/:id/stages`                  | Member | Reads the steps in order                                                         |
| PUT    | `/jobs/:id/stages`                  | Team   | Replaces the steps. A step with people in it cannot be taken away or change type |
| GET    | `/applications`                     | Member | Filters: `jobId`, `stageId`, `q`, `minScore`                                     |
| GET    | `/applications/:aid`                | Member | The person, history, comments and scores                                         |
| POST   | `/applications/:aid/move`           | Team   | Body `{ toStageId, reason? }`. A reason is needed to reject                      |
| POST   | `/applications/:aid/comments`       | Member | Body `{ body }`                                                                  |
| POST   | `/applications/:aid/scorecards`     | Member | Body `{ rating, recommendation, comments? }`. One per person                     |
| POST   | `/applications/:aid/assignees`      | Team   | Body `{ userId }`. Gives this person to a team member                            |
| DELETE | `/applications/:aid/assignees/:uid` | Team   | Takes this person away from a team member                                        |
| GET    | `/applications/:aid/resume`         | Member | Gives a download link that works for 5 minutes                                   |
| DELETE | `/candidates/:id`                   | Admin  | Removes the person and their files for good                                      |

Interviewers only see the applications given to them, and the jobs those belong to. They see their own score only, and never the average.

## Careers pages

| Method | Path                                          | Who    | What it does                                       |
| ------ | --------------------------------------------- | ------ | -------------------------------------------------- |
| GET    | `/public/companies/:slug/jobs`                | Public | Lists open jobs                                    |
| GET    | `/public/companies/:slug/jobs/:jobSlug`       | Public | Reads one open job                                 |
| POST   | `/public/companies/:slug/jobs/:jobSlug/apply` | Public | Form upload. See below. Limited to 10 a minute     |
| GET    | `/files/:id?expires=&signature=`              | Public | Downloads a file using a link from the route above |

To apply, send a multipart form with `fullName`, `email`, optional `phone` and `source`, and a `resume` file. The file must be a PDF or DOCX of 5 MB or less. We check the bytes of the file, so a renamed `.exe` is refused. Applying to the same job twice gives a `CONFLICT`.

## Notifications

| Method | Path                      | What it does                       |
| ------ | ------------------------- | ---------------------------------- |
| GET    | `/notifications`          | Lists them, and adds `unreadCount` |
| POST   | `/notifications/:id/read` | Marks one as read                  |
| POST   | `/notifications/read-all` | Marks all as read                  |

## Health

| Method | Path      | What it does                        |
| ------ | --------- | ----------------------------------- |
| GET    | `/health` | Says the app is running             |
| GET    | `/ready`  | Says the app can reach the database |
