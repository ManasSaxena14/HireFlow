// Drops, recreates and migrates a throwaway test database.
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('../apps/api/', import.meta.url));
const require = createRequire(`${apiRoot}package.json`);
const { Client } = require('pg');

export async function resetTestDb(connectionString) {
  const url = new URL(connectionString);
  const name = url.pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  execFileSync('node_modules/.bin/node-pg-migrate', ['up', '--migrations-dir', 'migrations'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}

// Run directly before the end-to-end suite, which needs the database in place
// before Playwright starts the servers.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await resetTestDb(
    process.env.E2E_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_e2e',
  );
  await rm(fileURLToPath(new URL('../.mail-preview', import.meta.url)), {
    recursive: true,
    force: true,
  });
}
