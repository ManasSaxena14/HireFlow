import { fileURLToPath } from 'node:url';

/** Where Node keeps compiled code between starts. It is made during the build. */
export const COMPILE_CACHE = fileURLToPath(
  new URL('../node_modules/.cache/hireflow-compile', import.meta.url),
);
