import { readFileSync, writeFileSync } from 'node:fs';
import { buildOpenApi } from './build-openapi.js';

const root = new URL('../../../../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
  version: string;
};
writeFileSync(
  new URL('docs/openapi.json', root),
  `${JSON.stringify(buildOpenApi(version), null, 2)}\n`,
);
console.log('docs/openapi.json is up to date.');
