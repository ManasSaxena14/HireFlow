// Runs the API and the worker together, for free hosting that allows one process.
// If one stops, this stops the other too, so the host restarts both.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { COMPILE_CACHE } from './compile-cache.mjs';

const env = {
  ...process.env,
  // Both need the same folder, because the API saves resumes and the worker reads them.
  UPLOAD_DIR: resolve(process.env.UPLOAD_DIR ?? 'uploads'),
};
// Code compiled during the build is reused, so Node does less work on every wake.
if (existsSync(COMPILE_CACHE)) env.NODE_COMPILE_CACHE ??= COMPILE_CACHE;

// Memory caps in MB, so both fit on a 512 MB free server with room for reading a resume.
const API = ['apps/api/dist/main.js', process.env.API_MEMORY_MB ?? '256'];
const WORKER = ['apps/worker/dist/main.js', process.env.WORKER_MEMORY_MB ?? '160'];
// The worker starts after the API answers, or after this long if that never comes.
const WORKER_DELAY_MS = 20_000;

const children = [];
let stopping = false;

const run = ([entry, memory]) => {
  const child = spawn(process.execPath, [`--max-old-space-size=${memory}`, entry], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env,
  });
  child.on('exit', (code) => stopAll(code));
  children.push(child);
  return child;
};

const stopAll = (code) => {
  // The first reason is the real one. The other process only stopped because we asked it to.
  process.exitCode ??= code ?? 1;
  stopping = true;
  clearTimeout(fallback);
  for (const child of children) child.kill('SIGTERM');
};

// A free server has a small slice of one CPU. The API starts alone so the first visitor after
// a wake is served sooner. The worker only runs background jobs, so it can wait a few seconds.
const startWorker = () => {
  clearTimeout(fallback);
  if (!stopping && children.length === 1) run(WORKER);
};
const api = run(API);
api.once('message', (message) => {
  if (message === 'ready') startWorker();
});
const fallback = setTimeout(startWorker, WORKER_DELAY_MS);

process.on('SIGTERM', () => stopAll(0));
process.on('SIGINT', () => stopAll(0));
