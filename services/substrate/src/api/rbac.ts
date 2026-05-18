/**
 * POST /v1/rbac/check  — OpenFGA permission check (called by @aeos/auth-client)
 * POST /v1/rbac/write  — write OpenFGA relationship tuples (admin only)
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAccessToken, requireAdminToken } from '../lib/jwt.js';
import { checkRelation, writeTuples, deleteTuples } from '../lib/openfga.js';
import { prisma } from '../db/prisma.js';

export const rbacRouter = Router();

// ── POST /v1/rbac/check ───────────────────────────────────────────────────────

const checkSchema = z.object({
  user: z.string().min(1),    // e.g. "user:usr_xxx"
  relation: z.string().min(1),
  object: z.string().min(1),  // e.g. "tenant:ten_xxx"
});

rbacRouter.post('/check', requireAccessToken, async (req, res) => {
  const body = checkSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  const allowed = await checkRelation(body.data.user, body.data.relation, body.data.object);
  res.json({ allowed });
});

// ── POST /v1/rbac/write ───────────────────────────────────────────────────────

const tupleSchema = z.object({
  user: z.string().min(1),
  relation: z.string().min(1),
  object: z.string().min(1),
});

const writeSchema = z.object({
  writes: z.array(tupleSchema).optional(),
  deletes: z.array(tupleSchema).optional(),
});

rbacRouter.post('/write', requireAdminToken, async (req, res) => {
  const auth = req.substrateAuth!;
  const body = writeSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  if (!body.data.writes?.length && !body.data.deletes?.length) {
    res.status(400).json({ error: 'invalid_request', message: 'writes or deletes required' });
    return;
  }

  // Infer tenant_id from the object fields for audit log
  const allTuples = [...(body.data.writes ?? []), ...(body.data.deletes ?? [])];
  const tenantId = req.substrateAuth?.tenant_id ?? extractTenantId(allTuples);

  if (body.data.writes?.length) {
    await writeTuples(body.data.writes);
    // Audit log
    await prisma.rbacAuditLog.createMany({
      data: body.data.writes.map((t) => ({
        tenantId: tenantId ?? 'unknown',
        actorId: auth.sub,
        operation: 'write',
        user: t.user,
        relation: t.relation,
        object: t.object,
      })),
    });
  }

  if (body.data.deletes?.length) {
    await deleteTuples(body.data.deletes);
    await prisma.rbacAuditLog.createMany({
      data: body.data.deletes.map((t) => ({
        tenantId: tenantId ?? 'unknown',
        actorId: auth.sub,
        operation: 'delete',
        user: t.user,
        relation: t.relation,
        object: t.object,
      })),
    });
  }

  res.json({ ok: true });
});

function extractTenantId(tuples: Array<{ object: string }>): string | undefined {
  // Extract from "tenant:ten_xxx" pattern
  for (const t of tuples) {
    if (t.object.startsWith('tenant:')) return t.object.slice(7);
  }
  return undefined;
}
