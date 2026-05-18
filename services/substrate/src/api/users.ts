/**
 * POST /v1/users      — create user within caller's tenant (admin only)
 * GET  /v1/users      — list users in caller's tenant
 * GET  /v1/users/:id  — get user
 */
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../db/prisma.js';
import { requireAccessToken } from '../lib/jwt.js';
import { writeTuples } from '../lib/openfga.js';

export const usersRouter = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  display_name: z.string().optional(),
  roles: z.array(z.string()).default(['member']),
});

usersRouter.post('/', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (!auth.roles.includes('admin') && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden', message: 'admin role required' });
    return;
  }

  const body = createUserSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: auth.tenant_id, email: body.data.email } },
  });
  if (existing) {
    res.status(409).json({ error: 'email_taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(body.data.password, 12);
  const user = await prisma.user.create({
    data: {
      tenantId: auth.tenant_id,
      email: body.data.email,
      passwordHash,
      displayName: body.data.display_name ?? null,
      roles: body.data.roles,
    },
  });

  // Add user as member of their tenant in OpenFGA
  await writeTuples([
    { user: `user:${user.id}`, relation: 'member', object: `tenant:${auth.tenant_id}` },
  ]);

  res.status(201).json(serializeUser(user));
});

usersRouter.get('/', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  const users = await prisma.user.findMany({
    where: { tenantId: auth.tenant_id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users.map(serializeUser));
});

usersRouter.get('/:id', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  const user = await prisma.user.findFirst({
    where: { id: req.params['id'] ?? '', tenantId: auth.tenant_id },
  });
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(serializeUser(user));
});

function serializeUser(u: {
  id: string; tenantId: string; email: string; displayName: string | null;
  roles: string[]; status: string; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: u.id,
    tenant_id: u.tenantId,
    email: u.email,
    display_name: u.displayName,
    roles: u.roles,
    status: u.status,
    created_at: u.createdAt.toISOString(),
    updated_at: u.updatedAt.toISOString(),
  };
}
