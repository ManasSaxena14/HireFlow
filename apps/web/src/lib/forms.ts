import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/** Shows server errors next to their fields, and returns any error for the whole form. */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (!(error instanceof ApiError)) return 'We could not reach the server. Please try again.';
  const issues = error.fieldIssues.filter((issue) => issue.path);
  for (const issue of issues) {
    setError(issue.path as Path<T>, { type: 'server', message: issue.message });
  }
  return issues.length > 0 ? null : error.message;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.fieldIssues[0]?.message ?? error.message;
  return 'We could not reach the server. Please try again.';
}
