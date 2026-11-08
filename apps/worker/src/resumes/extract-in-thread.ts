import { Worker } from 'node:worker_threads';

const TIME_LIMIT_MS = 30_000;

/**
 * Reads a file on its own thread with a time and memory limit. Resumes come from strangers,
 * and a file made to hang or eat memory must not stop the emails running on the main thread.
 */
export function extractInThread(content: Uint8Array, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const thread = new Worker(new URL('./extract-thread.js', import.meta.url), {
      workerData: { content, mimeType },
      // Small enough to fit next to the API and worker on a 512 MB free server.
      resourceLimits: { maxOldGenerationSizeMb: 128 },
      stdout: true,
      stderr: true,
    });
    const timer = setTimeout(() => {
      void thread.terminate();
      reject(new Error('Reading this file took too long.'));
    }, TIME_LIMIT_MS);
    const finish = (action: () => void) => {
      clearTimeout(timer);
      action();
    };
    thread.once('message', (text: string) => finish(() => resolve(text)));
    thread.once('error', (error) => finish(() => reject(error)));
    thread.once('exit', () => finish(() => reject(new Error('The file reader stopped early.'))));
  });
}
