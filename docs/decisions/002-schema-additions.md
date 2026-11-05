# 002: Small additions to the database

**Status:** accepted

We added three things that were not in the first plan. Each one was needed to make a rule work.

- **`reminders.kind`** (`follow_up`, `custom`, `interview`). Moving a job to rejected, dropped or offer must cancel the automatic follow-up, but keep the reminders the user wrote. Matching on the message text would break easily. A database rule also makes sure each job has only one waiting follow-up.
- **`email_deliveries`.** The queue can run a job more than once, but a reminder must be sent only once. This table remembers what was sent.
- **A trigger on the audit log.** The first plan was to block changes with `REVOKE`. A trigger works no matter which database user connects, which matters on hosted databases.
