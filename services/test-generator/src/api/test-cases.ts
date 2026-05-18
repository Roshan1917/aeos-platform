/**
 * CRUD for saved test cases. All endpoints scope by JWT tenant_id — never
 * accept a tenant_id from request bodies or path params.
 *
 *   POST   /v1/test-cases         — save plan (returns id)
 *   GET    /v1/test-cases         — list for caller's tenant
 *   GET    /v1/test-cases/:id     — fetch one
 *   DELETE /v1/test-cases/:id     — remove
 */
import { Router, type Router as ExpressRouter } from 'express';
import { Prisma } from '../../prisma/generated/index.js';
import { saveRequestSchema } from '../lib/schema.js';
import { prisma } from '../db/prisma.js';

export const testCasesRouter: ExpressRouter = Router();

testCasesRouter.post('/', async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const parsed = saveRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    return;
  }
  const plan = parsed.data;
  const created = await prisma.testCase.create({
    data: {
      tenantId: req.auth.tenantId,
      title: plan.title,
      description: plan.description,
      agentHint: plan.agent_hint,
      uopHint: plan.uop_hint,
      planJson: plan as unknown as Prisma.InputJsonValue,
      createdBy: req.auth.userId,
    },
  });
  res.status(201).json(serialize(created));
});

testCasesRouter.get('/', async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const rows = await prisma.testCase.findMany({
    where: { tenantId: req.auth.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(rows.map(serialize));
});

testCasesRouter.get('/:id', async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const row = await prisma.testCase.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(serialize(row));
});

testCasesRouter.delete('/:id', async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const result = await prisma.testCase.deleteMany({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (result.count === 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(204).end();
});

function serialize(row: {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  agentHint: string;
  uopHint: string;
  planJson: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    title: row.title,
    description: row.description,
    agent_hint: row.agentHint,
    uop_hint: row.uopHint,
    plan: row.planJson,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
