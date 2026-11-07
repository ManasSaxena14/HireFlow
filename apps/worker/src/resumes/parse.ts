import { MAX_RESUME_TEXT_LENGTH } from '@hireflow/shared';
import { findSkills } from '@hireflow/shared/matcher';
import type pg from 'pg';

export const READ_FAILED =
  'We could not read this file. Please check that it opens, and try saving it again as a new PDF.';
const NO_TEXT =
  'We found no text in this file. It may be a scan or a photo. Please upload a PDF with real text.';

export type ReadStored = (storageKey: string) => Promise<Uint8Array>;
export type ExtractText = (content: Uint8Array, mimeType: string) => Promise<string>;

/** PostgreSQL refuses the NUL character, and PDFs can hold broken text. */
const cleanText = (text: string) =>
  Buffer.from(text.replaceAll('\u0000', '').trim().slice(0, MAX_RESUME_TEXT_LENGTH)).toString();

export async function markResumeFailed(pool: pg.Pool, resumeId: string, message: string) {
  await pool.query(
    `UPDATE resumes SET status = 'failed', parse_error = $2 WHERE id = $1 AND status = 'pending'`,
    [resumeId, message],
  );
}

/**
 * Reads the text and skills of one resume. It only acts while the resume is pending, so a job
 * that runs twice changes nothing, and a resume deleted in the meantime is simply skipped.
 */
export async function parseResume(
  pool: pg.Pool,
  read: ReadStored,
  extract: ExtractText,
  resumeId: string,
): Promise<'ready' | 'no-text' | 'skipped'> {
  const { rows } = await pool.query<{ storage_key: string; mime_type: string }>(
    `SELECT f.storage_key, f.mime_type
       FROM resumes r JOIN files f ON f.id = r.file_id
      WHERE r.id = $1 AND r.status = 'pending'`,
    [resumeId],
  );
  const file = rows[0];
  if (!file) return 'skipped';

  const text = cleanText(await extract(await read(file.storage_key), file.mime_type));
  if (!text) {
    await markResumeFailed(pool, resumeId, NO_TEXT);
    return 'no-text';
  }
  await pool.query(
    `UPDATE resumes SET status = 'ready', parse_error = NULL, parsed_text = $2, parsed_skills = $3
      WHERE id = $1 AND status = 'pending'`,
    [resumeId, text, findSkills(text)],
  );
  return 'ready';
}
