import { ERROR_STATUS, type ErrorCode } from '@hireflow/shared';

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export const notFound = (what = 'Resource') => new DomainError('NOT_FOUND', `${what} not found.`);
export const unauthenticated = (message = 'Please sign in.') =>
  new DomainError('UNAUTHENTICATED', message);
