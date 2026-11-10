# 012: Built for a free host that sleeps

**Status:** accepted

The app will run on free plans: a web host, a Node service that sleeps when idle, and a database that also sleeps. These choices keep it fast and stable there.

- **The browser waits for the server to wake.** Reads and session checks try again on 502, 503 and 504 for about 70 seconds, with a note on screen. Changes are sent once and never repeated, so nothing can be saved twice. Before this, a slow wake could sign people out, because a session check gave up after about 8 seconds.
- **Every page starts the wake.** It calls `/api/v1/health` when it opens, so the server is waking while the person reads.
- **Database links that close while idle are handled.** Free databases close them, and the `pg` pool raises an error for each. With no listener, Node stops the whole process. Both pools now log it and carry on.
- **Fewer links.** pg-boss opens its own pool of 10 by default. The API now uses 2 and the worker 4, so the app needs at most 21 links in all.
- **(Replaced by decision 014, which moved passwords to Neon Auth.) Argon2id with the OWASP settings** (19 MiB, 2 passes, 1 lane) instead of the library default (64 MiB, 3 passes, 4 lanes). It is still the recommended setting, and it needs about a fifth of the work, which matters on a small shared CPU. Old hashes still check, because each one stores its own settings.
- **Memory caps.** `pnpm start` limits the API to 256 MB and the worker to 160 MB, and a resume is read on a thread limited to 128 MB, so all of it fits in 512 MB.
- **The proxy count is a setting.** Sign-in limits count by address. Behind two proxies, the old fixed value of 1 would have given every visitor the same address.
- **Migrations are not run on start.** That would slow every wake. They are run once per release from the owner's computer.
- **No response compression in the API.** Answers are small, and a free plan's CPU is scarcer than its bandwidth. Hosts usually compress at their edge anyway.
- **Separate build scripts.** `build:server` skips the web build on the backend host, and `build:web` skips the API on the web host, so each deploy is shorter.
