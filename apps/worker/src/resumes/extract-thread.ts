import { parentPort, workerData } from 'node:worker_threads';
import { extractResumeText } from './extract.js';

const { content, mimeType } = workerData as { content: Uint8Array; mimeType: string };
parentPort?.postMessage(await extractResumeText(content, mimeType));
