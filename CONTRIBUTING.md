# Contributing to HireFlow

Thanks for taking the time to help. This guide covers how to set up the project, make a change and get it merged.

## Set up

Follow [Getting started](README.md#getting-started) in the README. Everything runs offline, including sign-in, so you do not need any accounts.

## Make a change

1. Create a branch from `main`, named for the change, such as `fix/booking-time-zone` or `feat/panel-interviews`.
2. Keep each pull request to one change. Small pull requests are reviewed faster.
3. Add or update tests for anything you change. API routes are tested in `apps/api/test`, background jobs in `apps/worker/test`, and user journeys in `apps/web/e2e`.
4. Run the checks before you push:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm test:e2e   # stop pnpm dev first
   ```

5. Open a pull request against `main` and fill in the template. CI must pass before it is merged.

## Conventions

- **Commits** follow `type: short summary`, for example `fix: keep the reminder when a card is archived`. Use `feat`, `fix`, `docs`, `chore`, `refactor` or `test`.
- **Database changes** are new numbered SQL files in `apps/api/migrations`, with both an up and a down step. Never edit a migration that has been released.
- **API changes** need the spec updated with `pnpm --filter @hireflow/api openapi`. A test fails if `apps/api/openapi.json` does not match the code.
- **Text** on screens, in errors and in emails uses plain, simple English.
- **Formatting** is handled by Prettier and ESLint. A pre-commit hook runs them on the files you change.

## Reporting bugs and ideas

Use the issue templates on GitHub. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
