import { DomainError } from './domain-error.js';

export interface Cursor {
  at: string;
  id: string;
}

/**
 * `at` holds created_at as PostgreSQL's own text. A JS Date would cut microseconds to
 * milliseconds, and the page boundary would then repeat rows.
 */
export const encodeCursor = (cursor: Cursor) =>
  Buffer.from(JSON.stringify(cursor)).toString('base64url');

export function decodeCursor(raw: string): Cursor {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Partial<Cursor>;
    if (typeof value.at === 'string' && typeof value.id === 'string') {
      return { at: value.at, id: value.id };
    }
  } catch {
    // Reported below with the same error as a well-formed but wrong payload.
  }
  throw new DomainError('VALIDATION_ERROR', 'That page link is not valid.');
}
