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
  /** Set to false for routes that should not try to refresh the session on a 401. */
  auth?: boolean;
}

/**
 * A free host puts the API to sleep when nobody uses it, and the first request wakes it.
 * That can take up to a minute, so reads and session checks wait and try again, and the
 * screen says what is happening. These are the waits between tries, about 70 seconds in all.
 */
const WAKE_DELAYS_MS = [1000, 2000, 3000, 4000, 5000, 5000, 10_000, 10_000, 10_000, 10_000, 10_000];
const STARTING_UP = new Set([502, 503, 504]);

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
  tryAgain = (status: number) => STARTING_UP.has(status),
): Promise<Response> {
  let waiting = false;
  try {
    for (let index = 0; ; index++) {
      try {
        const response = await attempt();
        if (!tryAgain(response.status) || index === WAKE_DELAYS_MS.length) return response;
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

// The access token is kept only in memory and is never saved to disk.
let accessToken: string | null = null;
let refreshInFlight: Promise<SessionPayload | null> | null = null;

export interface SessionPayload {
  accessToken: string;
  user: { id: string; email: string; fullName: string; timezone: string };
}

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  const isForm = options.body instanceof FormData;
  // The browser sets the type itself for a form, because it has to add the boundary.
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
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
    const message = STARTING_UP.has(response.status)
      ? 'The server is starting up. Please try again in a moment.'
      : 'Something went wrong. Please try again.';
    return new ApiError(response.status, 'INTERNAL', message);
  }
}

async function requestRefresh(): Promise<SessionPayload | null> {
  // Only a clear "no" from the server ends the session. A 5xx means it is starting up.
  const response = await whileWaking(
    () => fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' }),
    (status) => status >= 500,
  );
  return response.ok ? ((await response.json()) as SessionPayload) : null;
}

/**
 * Gets a new access token using the refresh cookie. A refresh token works only once, and
 * using an old one can end the session. So calls in one tab share a single request, and
 * open tabs take turns using a Web Lock.
 */
export function refreshSession(): Promise<SessionPayload | null> {
  refreshInFlight ??= (async () => {
    try {
      const session = navigator.locks
        ? await navigator.locks.request('hireflow-refresh', requestRefresh)
        : await requestRefresh();
      accessToken = session?.accessToken ?? null;
      return session;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request(path: string, options: RequestOptions): Promise<Response> {
  // Reads are safe to repeat. A change is sent once, so it can never be saved twice.
  let response =
    (options.method ?? 'GET') === 'GET'
      ? await whileWaking(() => send(path, options))
      : await send(path, options);

  if (response.status === 401 && options.auth !== false) {
    const session = await refreshSession();
    if (session) response = await send(path, options);
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
