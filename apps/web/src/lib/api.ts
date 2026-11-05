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
    return new ApiError(response.status, 'INTERNAL', 'Something went wrong. Please try again.');
  }
}

const REFRESH_ATTEMPTS = 5;
const RETRY_DELAY_MS = 1500;

async function requestRefresh(): Promise<SessionPayload | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (response.ok) return (await response.json()) as SessionPayload;
      // Only a clear "no" from the server ends the session. A 5xx means it is starting up.
      if (response.status < 500 || attempt === REFRESH_ATTEMPTS) return null;
    } catch (error) {
      if (attempt === REFRESH_ATTEMPTS) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
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

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);

  if (response.status === 401 && options.auth !== false) {
    const session = await refreshSession();
    if (session) response = await send(path, options);
  }

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
