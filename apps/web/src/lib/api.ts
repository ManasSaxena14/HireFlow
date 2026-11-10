import type { ErrorBody, ErrorCode, FieldIssue } from '@hireflow/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
  }

  get fieldIssues(): FieldIssue[] {
    return this.details.filter(
      (detail): detail is FieldIssue =>
        typeof detail === 'object' && detail !== null && 'path' in detail && 'message' in detail,
    );
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Set to false for routes that should not try again with a new token on a 401. */
  auth?: boolean;
}

/**
 * A free host puts the API to sleep when nobody uses it, and the first request wakes it.
 * That can take up to a minute, so reads and session checks wait and try again, and the
 * screen says what is happening. These are the waits between tries, about 70 seconds in all.
 */
const WAKE_DELAYS_MS = [1000, 2000, 3000, 4000, 5000, 5000, 10_000, 10_000, 10_000, 10_000, 10_000];
const STARTING_UP = new Set([502, 503, 504]);

/**
 * A 502, 503 or 504, or a 500 that did not come from our API. Our API always answers errors
 * with JSON, so a plain 500 means the proxy in front of it could not reach it yet.
 */
const isStartingUp = (response: Response) =>
  STARTING_UP.has(response.status) ||
  (response.status === 500 && !response.headers.get('content-type')?.includes('application/json'));

type WakeListener = (waking: boolean) => void;
const wakeListeners = new Set<WakeListener>();
let waitingRequests = 0;

/** Lets the screen show a note while the server is starting. Returns a function to stop. */
export function onServerWaking(listener: WakeListener): () => void {
  wakeListeners.add(listener);
  return () => wakeListeners.delete(listener);
}

function setWaiting(change: 1 | -1) {
  const before = waitingRequests > 0;
  waitingRequests += change;
  const after = waitingRequests > 0;
  if (before !== after) for (const listener of wakeListeners) listener(after);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs the request again while the server is starting up. A clear answer ends it at once. */
async function whileWaking(
  attempt: () => Promise<Response>,
  tryAgain: (response: Response) => boolean = isStartingUp,
): Promise<Response> {
  let waiting = false;
  try {
    for (let index = 0; ; index++) {
      try {
        const response = await attempt();
        if (!tryAgain(response) || index === WAKE_DELAYS_MS.length) return response;
      } catch (error) {
        if (index === WAKE_DELAYS_MS.length) throw error;
      }
      if (!waiting) {
        waiting = true;
        setWaiting(1);
      }
      await sleep(WAKE_DELAYS_MS[index] as number);
    }
  } finally {
    if (waiting) setWaiting(-1);
  }
}

/** Starts waking the server as soon as a page opens, while the person is still reading. */
export function wakeServer(): void {
  void fetch('/api/v1/health', { cache: 'no-store' }).catch(() => undefined);
}

/**
 * Gives the short-lived Neon Auth token for the signed-in person. It is set while someone is
 * signed in, so a visitor who is not signed in never asks Neon Auth for a session.
 */
type TokenSource = (fresh: boolean) => Promise<string | null>;
let tokenSource: TokenSource | null = null;

export const setTokenSource = (source: TokenSource | null) => {
  tokenSource = source;
};

async function send(path: string, options: RequestOptions, fresh = false): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = tokenSource ? await tokenSource(fresh).catch(() => null) : null;
  const isForm = options.body instanceof FormData;
  // The browser sets the type itself for a form, because it has to add the boundary.
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'same-origin',
    body: isForm
      ? (options.body as FormData)
      : options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
  });
}

async function toError(response: Response): Promise<ApiError> {
  try {
    const { error } = (await response.json()) as ErrorBody;
    return new ApiError(response.status, error.code, error.message, error.details);
  } catch {
    const message = isStartingUp(response)
      ? 'The server is starting up. Please try again in a moment.'
      : 'Something went wrong. Please try again.';
    return new ApiError(response.status, 'INTERNAL', message);
  }
}

async function request(path: string, options: RequestOptions): Promise<Response> {
  // Reads are safe to repeat. A change is sent once, so it can never be saved twice.
  let response =
    (options.method ?? 'GET') === 'GET'
      ? await whileWaking(() => send(path, options))
      : await send(path, options);

  // The token may have run out a moment ago. Ask Neon Auth for a new one and try once more.
  if (response.status === 401 && options.auth !== false && tokenSource) {
    response = await send(path, options, true);
  }

  if (!response.ok) throw await toError(response);
  return response;
}

/** For routes that send back a file and not JSON. */
export async function apiText(path: string): Promise<string> {
  return (await request(path, {})).text();
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
