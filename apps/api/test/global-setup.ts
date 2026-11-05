import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));

export default async function setup(): Promise<void> {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_test',
  );
  const name = url.pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
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
