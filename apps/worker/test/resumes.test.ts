import { randomUUID } from 'node:crypto';
import { MAX_RESUME_TEXT_LENGTH } from '@hireflow/shared';
import { strToU8, zipSync } from 'fflate';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { extractResumeText, PDF_TYPE } from '../src/resumes/extract.js';
import { markResumeFailed, parseResume, READ_FAILED } from '../src/resumes/parse.js';
import { makeDocx, makePdf } from './helpers/resume-files.js';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const pool = new pg.Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_test',
});

async function addResume() {
  const { rows: users } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name) VALUES ($1, 'x', 'Riya') RETURNING id`,
    [`resume-${randomUUID()}@example.com`],
  );
  const { rows: files } = await pool.query<{ id: string }>(
    `INSERT INTO files (owner_user_id, storage_key, original_name, mime_type, size_bytes, sha256)
     VALUES ($1, $2, 'resume.pdf', $3, 1, 'x') RETURNING id`,
    [users[0]?.id, randomUUID(), PDF_TYPE],
  );
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO resumes (user_id, file_id, label) VALUES ($1, $2, 'Mine') RETURNING id`,
    [users[0]?.id, files[0]?.id],
  );
  return rows[0]?.id as string;
}

const row = async (id: string) => {
  const { rows } = await pool.query<{
    status: string;
    parse_error: string | null;
    parsed_text: string | null;
    parsed_skills: string[];
  }>('SELECT status, parse_error, parsed_text, parsed_skills FROM resumes WHERE id = $1', [id]);
  return rows[0];
};

const reading = async () => new Uint8Array();

afterAll(async () => {
  await pool.end();
});

describe('extracting text', () => {
  it('reads a PDF and keeps its lines apart', async () => {
    const text = await extractResumeText(
      makePdf(['Experience', 'Built APIs with NodeJS (and Postgres)']),
      PDF_TYPE,
    );
    expect(text).toContain('Experience');
    expect(text).toContain('Built APIs with NodeJS (and Postgres)');
    expect(text.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(2);
  });

  it('reads a Word file, its paragraphs and special letters', async () => {
    const text = await extractResumeText(
      makeDocx(['Skills', 'C++ & <Rust>', 'Second line']),
      DOCX_TYPE,
    );
    expect(text.trim().split('\n')).toEqual(['Skills', 'C++ & <Rust>', 'Second line']);
  });

  it('refuses a broken PDF and a zip that is not a Word file', async () => {
    await expect(
      extractResumeText(new Uint8Array(Buffer.from('%PDF-1.4 broken')), PDF_TYPE),
    ).rejects.toThrow();
    await expect(
      extractResumeText(zipSync({ 'a.txt': strToU8('x') }), DOCX_TYPE),
    ).rejects.toThrow();
  });

  it('refuses a small file that opens up to a huge one', async () => {
    const bomb = zipSync({ 'word/document.xml': new Uint8Array(21 * 1024 * 1024) }, { level: 9 });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(extractResumeText(bomb, DOCX_TYPE)).rejects.toThrow();
  });
});

describe('parsing a resume', () => {
  it('saves the text and the skills found', async () => {
    const id = await addResume();
    const outcome = await parseResume(pool, reading, async () => 'Skills\nNodeJS, k8s', id);
    expect(outcome).toBe('ready');
    expect(await row(id)).toMatchObject({
      status: 'ready',
      parse_error: null,
      parsed_text: 'Skills\nNodeJS, k8s',
      parsed_skills: ['Kubernetes', 'Node.js'],
    });
  });

  it('does nothing if the job runs twice', async () => {
    const id = await addResume();
    await parseResume(pool, reading, async () => 'First', id);
    const outcome = await parseResume(pool, reading, async () => 'Second', id);
    expect(outcome).toBe('skipped');
    expect((await row(id))?.parsed_text).toBe('First');
  });

  it('skips a resume that was deleted while it waited', async () => {
    expect(await parseResume(pool, reading, async () => 'x', randomUUID())).toBe('skipped');
  });

  it('says so when a file has no text, such as a scan', async () => {
    const id = await addResume();
    expect(await parseResume(pool, reading, async () => ' \n ', id)).toBe('no-text');
    const saved = await row(id);
    expect(saved?.status).toBe('failed');
    expect(saved?.parse_error).toContain('no text');
  });

  it('removes characters the database refuses and cuts very long text', async () => {
    const id = await addResume();
    await parseResume(pool, reading, async () => `a\u0000b${'x'.repeat(200_000)}`, id);
    const saved = await row(id);
    expect(saved?.parsed_text?.startsWith('abx')).toBe(true);
    expect(saved?.parsed_text?.length).toBe(MAX_RESUME_TEXT_LENGTH);
  });

  it('lets the job retry when reading fails, and can then be marked as failed', async () => {
    const id = await addResume();
    await expect(
      parseResume(pool, reading, async () => Promise.reject(new Error('broken')), id),
    ).rejects.toThrow('broken');
    expect((await row(id))?.status).toBe('pending');
    await markResumeFailed(pool, id, READ_FAILED);
    expect(await row(id)).toMatchObject({ status: 'failed', parse_error: READ_FAILED });
  });

  it('reads a real file from start to end', async () => {
    const id = await addResume();
    const pdf = makePdf(['Skills', 'Python, Django and AWS']);
    await parseResume(pool, async () => pdf, extractResumeText, id);
    expect((await row(id))?.parsed_skills).toEqual(['AWS', 'Django', 'Python']);
  });
});
