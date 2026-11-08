import type { PipeTransform } from '@nestjs/common';
import type { FieldIssue } from '@hireflow/shared';
import type { output, ZodType } from 'zod';
import { DomainError } from './domain-error.js';

export class ZodPipe<T extends ZodType> implements PipeTransform<unknown, output<T>> {
  // Public, so the API docs script can read which schema each route uses.
  constructor(readonly schema: T) {}

  transform(value: unknown): output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const details: FieldIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new DomainError('VALIDATION_ERROR', 'Please check the fields below.', details);
  }
}
