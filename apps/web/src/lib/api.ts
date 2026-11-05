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
  /** Set to false for endpoints that must not trigger a session refresh on 401. */
  auth?: boolean;
}

// The access token lives only in memory, out of reach of anything persisted to disk.
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
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
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

async function requestRefresh(): Promise<SessionPayload | null> {
  const response = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!response.ok) return null;
  return (await response.json()) as SessionPayload;
}

/**
 * Exchanges the refresh cookie for a new access token. Refresh tokens are single use and
 * replaying one revokes the session, so concurrent callers share one request and open
 * tabs take turns through a Web Lock.
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
