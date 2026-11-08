// Runs the API and the worker together, for free hosting that allows one process.
// If one stops, this stops the other too, so the host restarts both.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

// Both need the same folder, because the API saves resumes and the worker reads them.
const env = { ...process.env, UPLOAD_DIR: resolve(process.env.UPLOAD_DIR ?? 'uploads') };

// Memory caps in MB, so both fit on a 512 MB free server with room for reading a resume.
const PARTS = [
  ['apps/worker/dist/main.js', process.env.WORKER_MEMORY_MB ?? '160'],
  ['apps/api/dist/main.js', process.env.API_MEMORY_MB ?? '256'],
];

const children = PARTS.map(([entry, memory]) =>
  spawn(process.execPath, [`--max-old-space-size=${memory}`, entry], { stdio: 'inherit', env }),
);

const stopAll = (code) => {
  for (const child of children) child.kill('SIGTERM');
  // The first reason is the real one. The other process only stopped because we asked it to.
  process.exitCode ??= code ?? 1;
};

for (const child of children) child.on('exit', stopAll);
process.on('SIGTERM', () => stopAll(0));
process.on('SIGINT', () => stopAll(0));
