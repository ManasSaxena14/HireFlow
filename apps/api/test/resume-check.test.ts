import { describe, expect, it } from 'vitest';
import { checkResume, detectResumeType, safeFileName } from '../src/files/resume-check.js';
import { FileLinks } from '../src/files/file-links.js';
import type { ConfigService } from '../src/config/config.service.js';

const PDF = Buffer.from('%PDF-1.7 test');

describe('safeFileName', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\windows\\evil.pdf', 'evil.pdf'],
    ['cv"\r\n.pdf', 'cv.pdf'],
    ['/', 'resume'],
    ['', 'resume'],
  ])('turns %j into %j', (input, output) => {
    expect(safeFileName(input)).toBe(output);
  });

  it('keeps the file ending on a very long name', () => {
    const name = safeFileName(`${'a'.repeat(500)}.pdf`);
    expect(name).toHaveLength(200);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('detectResumeType', () => {
  it('reads the bytes and not the name', () => {
    expect(detectResumeType(PDF)).toBe('pdf');
    expect(detectResumeType(Buffer.from('MZ....'))).toBeNull();
    expect(detectResumeType(Buffer.alloc(0))).toBeNull();
  });
});

describe('checkResume', () => {
  const file = (buffer: Buffer, originalname = 'cv.pdf') => ({
    buffer,
    originalname,
    size: buffer.length,
  });

  it('sets the type from the bytes', () => {
    expect(checkResume(file(PDF)).mimeType).toBe('application/pdf');
  });

  it('refuses no file, an empty file and a file that is too big', () => {
    expect(() => checkResume(undefined)).toThrow('Please add your resume.');
    expect(() => checkResume(file(Buffer.alloc(0)))).toThrow('Please add your resume.');
    const big = { ...file(PDF), size: 6 * 1024 * 1024 };
    expect(() => checkResume(big)).toThrow('too big');
  });
});

describe('FileLinks', () => {
  const links = new FileLinks({
    env: { JWT_REFRESH_SECRET: 'a-secret-that-is-long-enough-for-this-test' },
  } as ConfigService);
  const id = '4e7f6c1e-0d8e-4a53-8a55-1a2b3c4d5e6f';

  const parts = (url: string) => {
    const params = new URL(url, 'http://x').searchParams;
    return { expires: Number(params.get('expires')), signature: params.get('signature') as string };
  };

  it('accepts a fresh link and ends it after five minutes', () => {
    const now = 1_000_000;
    const { expires, signature } = parts(links.create(id, now).url);
    expect(links.isValid(id, expires, signature, now)).toBe(true);
    expect(links.isValid(id, expires, signature, now + 5 * 60 * 1000 + 1)).toBe(false);
  });

  it('refuses a link for another file or with a changed time', () => {
    const { expires, signature } = parts(links.create(id).url);
    expect(links.isValid('another-file', expires, signature)).toBe(false);
    expect(links.isValid(id, expires + 1000, signature)).toBe(false);
    expect(links.isValid(id, expires, 'short')).toBe(false);
  });
});
