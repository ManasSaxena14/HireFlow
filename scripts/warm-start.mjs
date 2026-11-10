// Run after the server build. It loads the code once so Node saves the compiled form, which
// makes every later start, including each wake from sleep, do less work. Nothing is started.
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { enableCompileCache, flushCompileCache } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COMPILE_CACHE } from './compile-cache.mjs';

rmSync(COMPILE_CACHE, { recursive: true, force: true });
enableCompileCache(COMPILE_CACHE);

// The two entry files start the servers, so the code they use is loaded instead.
const SKIP = new Set(['main.js', 'extract-thread.js', 'write-openapi.js']);
const files = (dir) =>
  readdirSync(dir, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'))
    .filter((file) => !SKIP.has(file.split('/').pop()))
    .map((file) => join(dir, file));

const entries = [...files('apps/api/dist'), ...files('apps/worker/dist')];
for (const file of entries) await import(pathToFileURL(file).href);
flushCompileCache();

// The worker's own packages, which only its entry file loads. They are found from its folder.
execFileSync(
  process.execPath,
  ['--input-type=module', '-e', "import 'pg-boss'; import 'pino'; import 'nodemailer';"],
  { cwd: 'apps/worker', env: { ...process.env, NODE_COMPILE_CACHE: COMPILE_CACHE } },
);

console.log(`Saved compiled code for ${entries.length} files.`);
