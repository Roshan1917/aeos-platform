/**
 * Document upload/list/delete for document_only connectors.
 *
 * POST   /v1/discovery/connectors/:id/documents          (multipart/form-data, "file")
 * GET    /v1/discovery/connectors/:id/documents
 * DELETE /v1/discovery/connectors/:id/documents/:filename
 */
import { Router, type Router as ExpressRouter } from 'express';
import multer from 'multer';
import { prisma } from '../db/prisma.js';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
} from '../services/connector-document-service.js';
import { ACCEPTED_MIME_TYPES } from '../lib/document-converter.js';

export const connectorDocumentsRouter: ExpressRouter = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function assertConnectorOwned(
  tenantId: string,
  connectorId: string,
): Promise<{ id: string; connectorType: string } | null> {
  return prisma.discoveryConnector.findFirst({
    where: { id: connectorId, tenantId },
    select: { id: true, connectorType: true },
  });
}

connectorDocumentsRouter.post('/:id/documents', upload.single('file'), async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const conn = await assertConnectorOwned(req.auth.tenantId, req.params['id']!);
  if (!conn) return res.status(404).json({ error: 'not_found' });
  if (conn.connectorType !== 'document_only') {
    return res
      .status(400)
      .json({ error: 'invalid_connector_type', message: 'Documents only supported on document_only connectors.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'invalid_request', message: 'file is required (multipart field "file")' });
  }
  if (!ACCEPTED_MIME_TYPES.has(req.file.mimetype)) {
    return res
      .status(400)
      .json({ error: 'unsupported_media_type', message: `MIME type ${req.file.mimetype} is not supported.` });
  }
  try {
    const meta = await uploadDocument(
      conn.id,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype,
    );
    return res.status(201).json(meta);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: 'upload_failed', message: msg });
  }
});

connectorDocumentsRouter.get('/:id/documents', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const conn = await assertConnectorOwned(req.auth.tenantId, req.params['id']!);
  if (!conn) return res.status(404).json({ error: 'not_found' });
  const docs = await listDocuments(conn.id);
  return res.json({ data: docs });
});

connectorDocumentsRouter.delete('/:id/documents/:filename', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const conn = await assertConnectorOwned(req.auth.tenantId, req.params['id']!);
  if (!conn) return res.status(404).json({ error: 'not_found' });
  try {
    await deleteDocument(conn.id, req.params['filename']!);
    return res.status(204).send();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(404).json({ error: 'not_found', message: msg });
  }
});
