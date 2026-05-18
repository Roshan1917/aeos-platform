/**
 * Connector Document Service — manages document storage on disk for document_only connectors.
 *
 * Storage layout:
 *   {DOCUMENT_STORAGE_PATH}/{connectorId}/{sanitizedFilename}
 *   {DOCUMENT_STORAGE_PATH}/{connectorId}/{sanitizedFilename}.meta.json
 *
 * Ported from fuzebox-intelligence/discovery-service.
 */

import { mkdir, readdir, readFile, writeFile, unlink, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { extractText } from '../lib/document-converter.js';
import type { ConnectorDocument } from '../types.js';

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

export interface DocumentMeta {
  filename: string;
  original_name: string;
  media_type: string;
  size_bytes: number;
  uploaded_at: string;
}

function getStorageRoot(): string {
  return config.DOCUMENT_STORAGE_PATH;
}

function getConnectorDir(connectorId: string): string {
  return path.join(getStorageRoot(), connectorId);
}

function sanitizeFilename(rawName: string): string {
  const base = path.basename(rawName);
  return base.replace(/[^\w\-.]/g, '_');
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function listDocuments(connectorId: string): Promise<DocumentMeta[]> {
  const dir = getConnectorDir(connectorId);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const metaFiles = entries.filter((f) => f.endsWith('.meta.json'));
  const metas: DocumentMeta[] = [];

  for (const metaFile of metaFiles) {
    try {
      const raw = await readFile(path.join(dir, metaFile), 'utf-8');
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.filename !== 'string' ||
        !parsed.filename ||
        typeof parsed.size_bytes !== 'number'
      )
        continue;
      metas.push(parsed as DocumentMeta);
    } catch {
      // skip corrupt meta files
    }
  }

  return metas.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
}

export async function uploadDocument(
  connectorId: string,
  originalName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<DocumentMeta> {
  const existing = await listDocuments(connectorId);

  if (existing.length >= MAX_FILES) {
    throw new Error(
      `Maximum ${MAX_FILES} documents per connector. Remove a document before uploading.`,
    );
  }

  const existingTotalBytes = existing.reduce((sum, d) => sum + d.size_bytes, 0);
  if (existingTotalBytes + buffer.length > MAX_TOTAL_BYTES) {
    const remainingMb = ((MAX_TOTAL_BYTES - existingTotalBytes) / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Total document size would exceed 10 MB limit. Remaining capacity: ${remainingMb} MB.`,
    );
  }

  const sanitized = sanitizeFilename(originalName);

  let filename = sanitized;
  const existingNames = new Set(existing.map((d) => d.filename));
  if (existingNames.has(filename)) {
    const ext = path.extname(sanitized);
    const stem = sanitized.slice(0, -ext.length || undefined);
    let counter = 1;
    do {
      filename = `${stem}_${counter}${ext}`;
      counter++;
    } while (existingNames.has(filename));
  }

  const dir = getConnectorDir(connectorId);
  await ensureDir(dir);

  const meta: DocumentMeta = {
    filename,
    original_name: originalName,
    media_type: mimeType,
    size_bytes: buffer.length,
    uploaded_at: new Date().toISOString(),
  };

  await writeFile(path.join(dir, filename), buffer);
  await writeFile(path.join(dir, `${filename}.meta.json`), JSON.stringify(meta, null, 2));

  return meta;
}

export async function deleteDocument(connectorId: string, filename: string): Promise<void> {
  const dir = getConnectorDir(connectorId);
  const sanitized = sanitizeFilename(filename);

  if (!sanitized) {
    throw new Error(`Document '${filename}' not found.`);
  }

  const filePath = path.join(dir, sanitized);

  if (!filePath.startsWith(dir + path.sep)) {
    throw new Error(`Document '${filename}' not found.`);
  }

  const metaPath = path.join(dir, `${sanitized}.meta.json`);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('not a file');
  } catch {
    throw new Error(`Document '${filename}' not found.`);
  }

  await unlink(filePath);
  try {
    await unlink(metaPath);
  } catch {
    // meta file may be missing
  }
}

export async function deleteAllDocuments(connectorId: string): Promise<void> {
  const dir = getConnectorDir(connectorId);
  await rm(dir, { recursive: true, force: true });
}

export async function loadDocumentsForRun(connectorId: string): Promise<ConnectorDocument[]> {
  const metas = await listDocuments(connectorId);
  const docs: ConnectorDocument[] = [];

  const dir = getConnectorDir(connectorId);

  for (const meta of metas) {
    const filePath = path.join(dir, meta.filename);
    if (!filePath.startsWith(dir + path.sep)) continue;

    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      continue;
    }

    const extracted = await extractText(buffer, meta.media_type);

    const doc: ConnectorDocument = {
      filename: meta.original_name,
      base64: buffer.toString('base64'),
      size_bytes: meta.size_bytes,
      media_type: meta.media_type,
    };
    if (extracted !== undefined) {
      doc.extracted_text = extracted;
    }
    docs.push(doc);
  }

  return docs;
}
