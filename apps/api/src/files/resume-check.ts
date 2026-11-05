import { DomainError } from '../common/domain-error.js';
import { MAX_RESUME_BYTES } from '@hireflow/shared';

const PDF_SIGNATURE = Buffer.from('%PDF-');
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
// A .docx file is a zip that always holds this file.
const DOCX_ENTRY = Buffer.from('word/document.xml');

const MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export type ResumeType = keyof typeof MIME_TYPES;

/** Looks at the bytes of the file. The name and type sent by the browser can say anything. */
export function detectResumeType(content: Buffer): ResumeType | null {
  if (content.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) return 'pdf';
  if (content.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE)) {
    return content.includes(DOCX_ENTRY) ? 'docx' : null;
  }
  return null;
}

/** Keeps only the last part of the name, so a name like ../../x cannot point anywhere else. */
export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return clean.slice(-200) || 'resume';
}

export interface UploadedFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

export interface CheckedResume {
  originalName: string;
  mimeType: string;
  content: Buffer;
}

const invalid = (message: string) =>
  new DomainError('VALIDATION_ERROR', message, [{ path: 'resume', message }]);

export function checkResume(file: UploadedFile | undefined): CheckedResume {
  if (!file || file.size === 0) throw invalid('Please add your resume.');
  if (file.size > MAX_RESUME_BYTES) throw invalid('This file is too big. The limit is 5 MB.');

  const type = detectResumeType(file.buffer);
  const originalName = safeFileName(file.originalname);
  if (!type || !originalName.toLowerCase().endsWith(`.${type}`)) {
    throw invalid('Please upload a PDF or Word (.docx) file.');
  }
  return { originalName, mimeType: MIME_TYPES[type], content: file.buffer };
}
