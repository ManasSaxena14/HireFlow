import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOpenApi } from '../src/openapi/build-openapi.js';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

describe('API docs', () => {
  const document = buildOpenApi(read('package.json').version);
  const paths = document.paths as Record<string, Record<string, Record<string, unknown>>>;

  it('matches docs/openapi.json, so the docs never drift from the code', () => {
    expect(read('docs/openapi.json')).toEqual(document);
  });

  it('lists routes with their bodies, queries and who may call them', () => {
    const apply = paths['/public/companies/{slug}/jobs/{jobSlug}/apply']?.post;
    expect(apply?.description).toBe('Who: Anyone');
    expect(apply?.security).toBeUndefined();
    expect(paths['/me']?.get?.security).toBeDefined();
    expect(paths['/auth/login']).toBeUndefined();

    const feed = paths['/feed/jobs']?.get;
    expect((feed?.parameters as { name: string }[]).map((p) => p.name)).toEqual(
      expect.arrayContaining(['q', 'location', 'remote', 'limit', 'cursor']),
    );
    expect(paths['/companies/{cid}/audit-logs']?.get?.description).toBe('Who: Company admin');
    expect(paths['/resumes']?.post?.requestBody).toMatchObject({
      content: { 'multipart/form-data': {} },
    });
    expect(Object.keys(paths['/resumes/{id}'] ?? {}).sort()).toEqual(['delete', 'get']);
  });
});
