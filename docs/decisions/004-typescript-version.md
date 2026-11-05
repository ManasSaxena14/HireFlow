# 004: Stay on TypeScript 5.9 for now

**Status:** accepted

TypeScript 7 no longer exposes the JavaScript compiler API that Next.js and typescript-eslint depend on, so the repo pins `~5.9.3` until those tools catch up. The whole repo is otherwise native ESM, because NestJS 12, pg-boss and Kysely all ship as ES modules.
