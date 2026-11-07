import { unzipSync } from 'fflate';
import { getDocumentProxy } from 'unpdf';
import { decodeEntities } from '../feed/text.js';

const MAX_PDF_PAGES = 30;
// A small zip can open up to a huge file, so we check the size before opening it.
const MAX_DOCX_XML_BYTES = 20 * 1024 * 1024;
const DOCX_BODY = 'word/document.xml';

export const PDF_TYPE = 'application/pdf';

async function pdfText(content: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(content);
  const pages: string[] = [];
  for (let number = 1; number <= Math.min(pdf.numPages, MAX_PDF_PAGES); number++) {
    const page = await pdf.getPage(number);
    const { items } = await page.getTextContent();
    let text = '';
    for (const item of items) {
      if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '');
    }
    pages.push(text);
  }
  return pages.join('\n');
}

/** Reads only the text tags, with no XML parser, so a file cannot ask us to load anything. */
function docxText(content: Uint8Array): string {
  let tooBig = false;
  const files = unzipSync(content, {
    filter: (file) => {
      if (file.name !== DOCX_BODY) return false;
      tooBig = file.originalSize > MAX_DOCX_XML_BYTES;
      return !tooBig;
    },
  });
  const body = files[DOCX_BODY];
  if (tooBig || !body) throw new Error('This Word file has no readable body.');
  const xml = Buffer.from(body).toString('utf8');
  let text = '';
  for (const [tag, words] of xml.matchAll(
    /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<\/w:p>|<w:br\s*\/>|<w:tab\s*\/>/g,
  )) {
    if (words !== undefined) text += decodeEntities(words);
    else text += tag.startsWith('<w:tab') ? ' ' : '\n';
  }
  return text;
}

export async function extractResumeText(content: Uint8Array, mimeType: string): Promise<string> {
  return mimeType === PDF_TYPE ? pdfText(content) : docxText(content);
}
