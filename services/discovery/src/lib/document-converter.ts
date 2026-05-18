/**
 * Document converter — transforms file buffers into Anthropic content blocks.
 *
 * Handles PDF, JPG, PNG (native binary blocks) and DOCX, XLSX, TXT, CSV
 * (text extraction).
 */

import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type {
  LLMContentBlockParam,
  LLMDocumentBlockParam,
  LLMImageBlockParam,
  LLMTextBlockParam,
} from './anthropic.js';
import type { ConnectorDocument } from '../types.js';

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

export const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const ACCEPTED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.txt',
  '.csv',
  '.docx',
  '.xlsx',
]);

export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<string | undefined> {
  switch (mimeType) {
    case 'text/plain':
    case 'text/csv':
      return buffer.toString('utf-8');

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `[Failed to extract text from DOCX: ${msg}]`;
      }
    }

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
      try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const parts: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const csv = XLSX.utils.sheet_to_csv(sheet);
          parts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
        }
        return parts.join('\n\n');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `[Failed to extract text from XLSX: ${msg}]`;
      }
    }

    default:
      return undefined;
  }
}

export function toContentBlock(doc: ConnectorDocument): LLMContentBlockParam {
  if (doc.media_type === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 },
      title: doc.filename,
    } as LLMDocumentBlockParam;
  }

  if (IMAGE_MIME_TYPES.has(doc.media_type)) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: doc.media_type as 'image/jpeg' | 'image/png',
        data: doc.base64,
      },
    } as LLMImageBlockParam;
  }

  if (TEXT_MIME_TYPES.has(doc.media_type) && doc.extracted_text) {
    return {
      type: 'text',
      text: `[Document: ${doc.filename}]\n\n${doc.extracted_text}`,
    } as LLMTextBlockParam;
  }

  return {
    type: 'text',
    text: `[Document: ${doc.filename} — unsupported format, no content extracted]`,
  } as LLMTextBlockParam;
}
