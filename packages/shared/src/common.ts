import { z } from 'zod';

export const uuidSchema = z.uuid();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const timezoneSchema = z.string().refine(isTimeZone, 'Unknown time zone');
