import { createHash } from 'node:crypto';

const normalize = (value: string) => value.trim().toLowerCase();

export const normalizeLocation = (location: string | null | undefined) =>
  normalize(location ?? '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export const jobHash = (title: string, company: string, location?: string | null) =>
  createHash('sha256')
    .update(`${normalize(title)}|${normalize(company)}|${normalizeLocation(location)}`)
    .digest('hex');
