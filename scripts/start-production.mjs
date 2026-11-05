// Runs the API and the worker together, for free hosting that allows one process.
// If one stops, this stops the other too, so the host restarts both.
import { spawn } from 'node:child_process';

const children = ['apps/worker/dist/main.js', 'apps/api/dist/main.js'].map((entry) =>
  spawn(process.execPath, [entry], { stdio: 'inherit' }),
);

const stopAll = (code) => {
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code ?? 1;
};

for (const child of children) child.on('exit', stopAll);
process.on('SIGTERM', () => stopAll(0));
process.on('SIGINT', () => stopAll(0));
