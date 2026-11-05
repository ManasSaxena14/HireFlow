import { randomBytes } from 'node:crypto';

export function slugify(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return slug.length >= 2 ? slug : `${fallback}-${randomBytes(2).toString('hex')}`;
}
