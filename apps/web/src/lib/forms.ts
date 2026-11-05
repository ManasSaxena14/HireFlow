import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/** Puts server field errors on their inputs; returns any message that belongs on the form. */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (!(error instanceof ApiError)) return 'Could not reach the server. Please try again.';
  const issues = error.fieldIssues.filter((issue) => issue.path);
  for (const issue of issues) {
    setError(issue.path as Path<T>, { type: 'server', message: issue.message });
  }
  return issues.length > 0 ? null : error.message;
}
