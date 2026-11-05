import { DomainError } from './domain-error.js';

export interface Cursor {
  at: string;
  id: string;
}

/**
 * `at` keeps created_at as text from PostgreSQL. A JS Date would lose the microseconds,
 * and the same rows would then show up again on the next page.
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
    // A broken cursor gets the same error as the one below.
  }
  throw new DomainError('VALIDATION_ERROR', 'That page link is not valid.');
}
