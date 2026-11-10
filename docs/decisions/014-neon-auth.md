# 014: Sign-in moves to Neon Auth

**Status:** accepted

HireFlow used to run its own sign-in: Argon2id passwords, a 15 minute access token, a rotating refresh cookie, and its own emails to confirm an address or reset a password. The project now uses Neon for its database, and Neon Auth is free for up to 60,000 users a month, so sign-in moved there. HireFlow no longer stores passwords or sessions.

- **Neon Auth owns the account login.** Sign-up, sign-in, sign-out, sessions, email confirmation and password reset all run in Neon Auth. The web site passes `/api/auth` on to it with the Neon Next.js package, so the session cookie belongs to the site.
- **The API checks Neon Auth tokens.** The browser sends a short-lived token (15 minutes) as a bearer token. The API checks it against Neon Auth's public keys with `jose`: Ed25519 only, and the issuer and audience must be the Neon Auth address. The keys are fetched once in the background at start, so a wake from sleep does not wait for them.
- **HireFlow keeps its own account table.** Roles, companies, boards and everything else still point at `users.id`. Neon Auth cannot hold custom roles, so a `users.auth_id` column links the two. The first request with a new token makes the account. Its email and confirmed state follow the token after that. A known account is remembered for one minute, so most requests need no extra database read.
- **An older account is taken over only with a confirmed email.** Accounts made before this, such as the demo team, have no `auth_id`. The first sign-in with the same email takes one over, but only when Neon Auth says the email is confirmed. Otherwise anyone could sign up with someone else's address and get into their account. An unconfirmed sign-in with that email gets a clear error instead.
- **Email confirmation uses a 6 digit code.** Neon Auth's shared mail service can send codes, but links need your own mail service in Neon. The code works without any setup. Live boards still only follow applications from confirmed emails, as decision 013 says.
- **Neon's emails can come from our own address.** By default Neon sends codes and reset links from its shared address. In the Neon console, under Settings, Better Auth, choose a custom SMTP provider and enter the same SMTP settings the worker uses. Then every email, from Neon and from the worker, comes from one sender. The deploy guide lists this step.
- **Password reset keeps the HireFlow pages.** Neon's docs suggest its ready-made forms, which would not match the design. The site uses Better Auth's own calls instead: `requestPasswordReset` sends the link, the link comes back to `/reset-password` on this site, and `resetPassword` saves the new password. A browser test runs the whole flow, and checks that a link works only once.
- **Booking and file links keep their own secret.** They were signed with a key made from the old refresh secret. They now use `LINK_SECRET`, which Render makes for you. Changing it stops links that are already open, as before.
- **Sign-up no longer says an email is taken.** With email codes on, Better Auth answers a second sign-up with a used email just like a new one, so nobody can test which emails have accounts. The first account is untouched, and a browser test checks this.
- **The API token comes from `/token`.** The site keeps a signed copy of the session in a cookie for one minute, and that copy holds only the session id. So the browser asks `/api/auth/token`, which always reaches Neon Auth, for the signed token the API checks. It keeps the token in memory until a minute before it runs out.
- **Sign-in limits are Neon Auth's.** The API's stricter per-address limit now covers only the public apply and booking forms.

What we gave up:

- **Neon Auth has no offline mode, so we added one.** `packages/local-auth` runs the same open source Better Auth that Neon runs, with Neon's cookie names, Ed25519 tokens at `/.well-known/jwks.json`, UUID user ids and email codes. `pnpm dev` and the browser tests start it when `NEON_AUTH_BASE_URL` points at localhost, and it saves its emails in `.mail-preview/`. So local work and every browser test run without the internet, and the tests type the real email code. It refuses to run in production. The API tests do not need it: they sign their own tokens with a test key, checked by the same code.
- **Signing out everywhere is not instant for the API.** Neon Auth ends every session at once, but a token already given out still works with the API until it runs out, at most 15 minutes later.
- **Failed sign-ins are no longer in the audit log.** Neon Auth sees them, and HireFlow does not.
- **Load tests use a stand-in.** `scripts/load/auth-stub.mjs` serves a test key and makes tokens, so a load test never touches the real Neon Auth.
- **Roles stay in HireFlow.** Neon Auth cannot hold custom roles, so company roles stay in `memberships`, as before. Nothing about roles changed.
