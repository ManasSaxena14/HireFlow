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
| `SLOT_TAKEN`       | 409    |
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

## Interviews

| Method | Path                                            | Who    | What it does                                                                      |
| ------ | ----------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| GET    | `/me/availability?companyId=`                   | Member | Your weekly hours and days off in that company                                    |
| PUT    | `/me/availability?companyId=`                   | Member | Body `{ timezone, rules[], blocks[] }`. Replaces them all                         |
| GET    | `/me/interviews`                                | User   | Your interviews coming up, as interviewer or candidate                            |
| GET    | `/interviews/:id/ics`                           | User   | Calendar file. Only for the people in the interview                               |
| GET    | `/companies/:cid/interviews`                    | Member | `scope=upcoming` or `past`. Interviewers see only their own                       |
| POST   | `/companies/:cid/interviews/suggest-slots`      | Team   | Body `{ applicationId, interviewerIds[], durationMin, from, to }`. Up to 50 times |
| POST   | `/companies/:cid/interviews`                    | Team   | Books a time. `SLOT_TAKEN` if someone is already busy                             |
| POST   | `/companies/:cid/interviews/:id/reschedule`     | Team   | Body `{ start, durationMin? }`. Same rules as booking                             |
| POST   | `/companies/:cid/interviews/:id/cancel`         | Team   | Cancels, removes reminders that were not sent and tells everyone                  |
| GET    | `/companies/:cid/applications/:id/interviews`   | Member | Interviews and offers for one person. Interviewers do not see offers              |
| POST   | `/companies/:cid/interview-offers`              | Team   | Emails the candidate a link to choose from up to 10 times                         |
| POST   | `/companies/:cid/interview-offers/:id/withdraw` | Team   | Stops the link working                                                            |
| GET    | `/interview-offers/:token`                      | Public | What the booking page shows                                                       |
| POST   | `/interview-offers/:token/book`                 | Public | Body `{ start, timezone? }`. Rate limited                                         |
| GET    | `/public/interviews/:id/calendar?signature=`    | Public | Calendar file for the signed link in a candidate's email                          |

## Careers pages

| Method | Path                                          | Who    | What it does                                       |
| ------ | --------------------------------------------- | ------ | -------------------------------------------------- |
| GET    | `/public/companies/:slug/jobs`                | Public | Lists open jobs                                    |
| GET    | `/public/companies/:slug/jobs/:jobSlug`       | Public | Reads one open job                                 |
| POST   | `/public/companies/:slug/jobs/:jobSlug/apply` | Public | Form upload. See below. Limited to 10 a minute     |
| GET    | `/files/:id?expires=&signature=`              | Public | Downloads a file using a link from the route above |

To apply, send a multipart form with `fullName`, `email`, optional `phone` and `source`, and a `resume` file. If the request is signed in as a confirmed account with the same email, the application also appears on that person's job board, and the answer has `onYourBoard: true`. From then on, every move the company makes changes that card too. The file must be a PDF or DOCX of 5 MB or less. We check the bytes of the file, so a renamed `.exe` is refused. Applying to the same job twice gives a `CONFLICT`.

## Job feed and alerts

| Method | Path                  | Who  | What it does                                                                        |
| ------ | --------------------- | ---- | ----------------------------------------------------------------------------------- |
| GET    | `/feed/jobs`          | User | Search jobs. Filters: `q`, `location`, `remote=true`. Newest first                  |
| GET    | `/feed/jobs/:id`      | User | One job with its full description                                                   |
| POST   | `/feed/jobs/:id/save` | User | Copies the job to your board as saved. Gives `DUPLICATE_JOB` if it is there already |
| GET    | `/alerts`             | User | Your alerts                                                                         |
| POST   | `/alerts`             | User | Add an alert. You can keep up to 20                                                 |
| PATCH  | `/alerts/:id`         | User | Change an alert, or pause it with `active: false`                                   |
| DELETE | `/alerts/:id`         | User | Delete an alert                                                                     |

## Resumes

| Method | Path                   | Who  | What it does                                                                   |
| ------ | ---------------------- | ---- | ------------------------------------------------------------------------------ |
| GET    | `/resumes`             | User | Your resumes, without their text                                               |
| POST   | `/resumes`             | User | Upload as a multipart form with a `resume` file and optional `label`           |
| GET    | `/resumes/:id`         | User | One resume. `status` is `pending`, `ready` or `failed`                         |
| DELETE | `/resumes/:id`         | User | Deletes the resume, its checks and the file                                    |
| GET    | `/resumes/:id/file`    | User | A short-lived download link                                                    |
| POST   | `/resumes/:id/match`   | User | Body has `jobDescription` (with optional `jobLabel`) or `trackedApplicationId` |
| GET    | `/resumes/:id/matches` | User | The last 20 checks                                                             |

A check gives `{ score, matched, missing, sectionsFound, suggestions, breakdown }`. While a resume is being read, or if it could not be read, a check gives a `CONFLICT`.

## Practice

| Method | Path                      | Who  | What it does                                                      |
| ------ | ------------------------- | ---- | ----------------------------------------------------------------- |
| POST   | `/prep/sessions`          | User | Log practice. A new topic is added to the reviews, due tomorrow   |
| GET    | `/prep/sessions`          | User | Your practice, newest first, a page at a time                     |
| DELETE | `/prep/sessions/:id`      | User | Delete one                                                        |
| GET    | `/prep/stats`             | User | Days in a row, and the last 30 days by type, topic and result     |
| GET    | `/prep/reviews`           | User | All review topics, the ones due first                             |
| GET    | `/prep/reviews/due`       | User | Topics due today or earlier, in your time zone                    |
| POST   | `/prep/reviews/:id/grade` | User | Body `{ quality }` from 0 to 5. Works out the next date with SM-2 |
| DELETE | `/prep/reviews/:id`       | User | Stop reviewing a topic                                            |

## Hiring numbers

All three take optional `from` and `to` dates, like `2026-01-31`, and an optional `jobId`. The default is the last 90 days.

| Method | Path                                     | Who                              | What it does                                     |
| ------ | ---------------------------------------- | -------------------------------- | ------------------------------------------------ |
| GET    | `/companies/:cid/analytics/funnel`       | Admin, recruiter, hiring manager | How many people reached each step                |
| GET    | `/companies/:cid/analytics/time-to-hire` | Admin, recruiter, hiring manager | Days from applying to hired, overall and by job  |
| GET    | `/companies/:cid/analytics/sources`      | Admin, recruiter, hiring manager | Applications and hires by where people came from |

## Activity log

| Method | Path                         | Who   | What it does                                                                                          |
| ------ | ---------------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/companies/:cid/audit-logs` | Admin | What changed and who did it, newest first. Filters: `actorId`, `entityType`, `entityId`, `from`, `to` |

The full list of routes, with every field they accept, is in [openapi.json](openapi.json).

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
