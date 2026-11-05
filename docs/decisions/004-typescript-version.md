# 004: Stay on TypeScript 5.9 for now

**Status:** accepted

TypeScript 7 removed the JavaScript API that Next.js and typescript-eslint need. So the project stays on `~5.9.3` until those tools are ready. The whole project uses ES modules, because NestJS 12, pg-boss and Kysely all need them.
