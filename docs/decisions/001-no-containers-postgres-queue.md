# 001: No Docker, and the job queue lives in PostgreSQL

**Status:** accepted

The project should run on a laptop and on free hosting, with no extra services.

- **No Docker.** `scripts/local-db.sh` runs a private database from `.pgdata/`. A new developer needs only Node and PostgreSQL, and no other database on their computer is touched. CI uses a Postgres container because GitHub provides one for free.
- **pg-boss, not Redis and BullMQ.** A job can be added in the same transaction as the change that caused it, so a saved change can never lose its job. It is also one less service to pay for. If there are ever too many jobs for Postgres, the queue can be swapped because it sits behind a small interface.
- **Rate limits in memory.** This is enough for one API server. A shared store is only needed when there is a second server.
