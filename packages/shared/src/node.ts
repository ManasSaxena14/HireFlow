import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Loads the repository's .env when one exists; real environment variables win. */
export function loadEnvFile(start = process.cwd()): void {
  let dir = start;
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
