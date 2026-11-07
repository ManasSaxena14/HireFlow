// Adds the public job boards the worker reads. Safe to run again.
// Check that a company's board is public and that its terms allow this before adding it here.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('../apps/api/', import.meta.url));
const { Client } = createRequire(`${apiRoot}package.json`)('pg');

const SOURCES = [
  { name: 'GitLab', kind: 'greenhouse', config: { board: 'gitlab', companyName: 'GitLab' } },
  { name: 'Figma', kind: 'greenhouse', config: { board: 'figma', companyName: 'Figma' } },
  { name: 'Stripe', kind: 'greenhouse', config: { board: 'stripe', companyName: 'Stripe' } },
  { name: 'Spotify', kind: 'lever', config: { site: 'spotify', companyName: 'Spotify' } },
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  for (const source of SOURCES) {
    await client.query(
      `INSERT INTO feed_sources (name, kind, config) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      [source.name, source.kind, JSON.stringify(source.config)],
    );
  }
  console.log(`${SOURCES.length} job sources are ready. The worker reads them every 30 minutes.`);
} finally {
  await client.end();
}
