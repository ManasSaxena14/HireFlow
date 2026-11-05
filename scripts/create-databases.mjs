// Creates the development and test databases named in .env if they do not exist yet.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');

if (existsSync('.env')) process.loadEnvFile('.env');

const urls = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL].filter(Boolean);
if (urls.length === 0) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

for (const raw of urls) {
  const url = new URL(raw);
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
    console.log(`created ${name}`);
  } else {
    console.log(`${name} already exists`);
  }
  await client.end();
}
