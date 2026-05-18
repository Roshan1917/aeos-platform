/**
 * Connectors CRUD — v1 only supports document_only.
 * Tenant scoping: tenant_id from JWT only, never from body/path.
 */
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { Prisma } from '../../prisma/generated/index.js';
import { prisma } from '../db/prisma.js';
import { deleteAllDocuments } from '../services/connector-document-service.js';

export const connectorsRouter: ExpressRouter = Router();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  connector_type: z.literal('document_only').default('document_only'),
  config: z.record(z.unknown()).default({}),
  prompt_config: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  prompt_config: z.record(z.unknown()).optional(),
});

function serialize(c: {
  id: string;
  tenantId: string;
  name: string;
  connectorType: string;
  config: unknown;
  status: string;
  promptConfig: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    tenant_id: c.tenantId,
    name: c.name,
    connector_type: c.connectorType,
    config: c.config,
    status: c.status,
    prompt_config: c.promptConfig,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

connectorsRouter.post('/', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  try {
    const created = await prisma.discoveryConnector.create({
      data: {
        tenantId: req.auth.tenantId,
        name: parsed.data.name,
        connectorType: parsed.data.connector_type,
        config: parsed.data.config as Prisma.InputJsonValue,
        promptConfig:
          parsed.data.prompt_config !== undefined
            ? (parsed.data.prompt_config as Prisma.InputJsonValue)
            : undefined,
        createdBy: req.auth.userId,
        status: 'active',
      },
    });
    return res.status(201).json(serialize(created));
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return res
        .status(409)
        .json({ error: 'conflict', message: 'A connector with that name already exists.' });
    }
    throw err;
  }
});

connectorsRouter.get('/', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const rows = await prisma.discoveryConnector.findMany({
    where: { tenantId: req.auth.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return res.json({ data: rows.map(serialize) });
});

connectorsRouter.get('/:id', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const row = await prisma.discoveryConnector.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!row) return res.status(404).json({ error: 'not_found' });
  return res.json(serialize(row));
});

connectorsRouter.patch('/:id', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  const existing = await prisma.discoveryConnector.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const updated = await prisma.discoveryConnector.update({
    where: { id: existing.id },
    data: {
      name: parsed.data.name,
      config:
        parsed.data.config !== undefined
          ? (parsed.data.config as Prisma.InputJsonValue)
          : undefined,
      status: parsed.data.status,
      promptConfig:
        parsed.data.prompt_config !== undefined
          ? (parsed.data.prompt_config as Prisma.InputJsonValue)
          : undefined,
    },
  });
  return res.json(serialize(updated));
});

connectorsRouter.delete('/:id', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const existing = await prisma.discoveryConnector.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!existing) return res.status(404).json({ error: 'not_found' });

  await prisma.discoveryConnector.delete({ where: { id: existing.id } });
  await deleteAllDocuments(existing.id);
  return res.status(204).send();
});
