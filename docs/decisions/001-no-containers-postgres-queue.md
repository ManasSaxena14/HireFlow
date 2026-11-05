# 001: Run natively, and keep the queue in PostgreSQL

**Status:** accepted

The project should run on a laptop and on free hosting without extra services.

- **No containers.** `scripts/local-db.sh` runs a private PostgreSQL cluster from `.pgdata/`, so a new developer needs only Node and PostgreSQL, and nothing touches their system database. CI uses a Postgres service container because GitHub provides one.
- **pg-boss instead of Redis and BullMQ.** Jobs enqueue inside the same transaction as the change that caused them, which removes a whole category of "row saved, job lost" bugs. It is also one less service to pay for. If job volume ever outgrows Postgres, the queue sits behind a small interface and can be swapped.
- **In-memory rate limits and cache.** Enough for one API instance. A shared store becomes necessary at the same moment a second instance does.
