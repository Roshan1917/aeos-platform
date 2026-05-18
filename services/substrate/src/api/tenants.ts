/**
 * POST   /v1/tenants                  — create tenant (platform_admin only)
 * GET    /v1/tenants/:id              — get tenant
 * GET    /v1/tenants/:id/settings     — get tenant settings
 * PATCH  /v1/tenants/:id/settings     — update tenant settings
 */
import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '../../prisma/generated/index.js';
import { prisma } from '../db/prisma.js';
import { requireAccessToken, requireAdminToken } from '../lib/jwt.js';
import { writeTuples } from '../lib/openfga.js';
import bcrypt from 'bcrypt';

export const tenantsRouter = Router();

// ── POST /v1/tenants ──────────────────────────────────────────────────────────

const createTenantSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  deployment_mode: z.enum(['pooled', 'siloed', 'on-prem']).default('pooled'),
  // Bootstrap admin user for this tenant
  admin_email: z.string().email(),
  admin_password: z.string().min(12),
  admin_display_name: z.string().optional(),
});

tenantsRouter.post('/', requireAdminToken, async (req, res) => {
  const body = createTenantSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  const { name, slug, deployment_mode, admin_email, admin_password, admin_display_name } = body.data;

  // Check slug uniqueness
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    res.status(409).json({ error: 'slug_taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(admin_password, 12);

  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      deploymentMode: deployment_mode,
      settings: { create: {} },
      users: {
        create: {
          email: admin_email,
          passwordHash,
          displayName: admin_display_name,
          roles: ['admin', 'member'],
        },
      },
    },
    include: { users: true, settings: true },
  });

  const adminUser = tenant.users[0];

  // Bootstrap OpenFGA: admin user is owner of the tenant
  await writeTuples([
    {
      user: `user:${adminUser!.id}`,
      relation: 'owner',
      object: `tenant:${tenant.id}`,
    },
  ]);

  res.status(201).json(serializeTenant(tenant));
});

// ── GET /v1/tenants/:id ───────────────────────────────────────────────────────

tenantsRouter.get('/:id', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;

  // Users can only view their own tenant; platform admins can view any
  if (auth.tenant_id !== req.params['id'] && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: req.params['id'] } });
  if (!tenant) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.json(serializeTenant(tenant));
});

// ── GET /v1/tenants/:id/settings ─────────────────────────────────────────────

tenantsRouter.get('/:id/settings', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (auth.tenant_id !== req.params['id'] && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId: req.params['id'] } });
  if (!settings) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.json(serializeSettings(settings));
});

// ── PATCH /v1/tenants/:id/settings ───────────────────────────────────────────

const deploymentPlatformSchema = z.object({
  kind: z.enum(['aws_bedrock', 'anthropic_cloud', 'azure_openai', 'google_vertex', 'custom']),
  config_complete: z.boolean(),
});

const updateSettingsSchema = z.object({
  anonymized_benchmarks_consent: z.boolean().optional(),
  data_retention_days: z.number().int().min(30).max(3650).optional(),
  compliance_frameworks: z.array(
    z.enum(['EU_AI_ACT', 'ISO_42001', 'UNECE_WP29', 'MAS_TRM', 'SOC2']),
  ).optional(),
  agent_deployment_platform: deploymentPlatformSchema.nullable().optional(),
});

tenantsRouter.patch('/:id/settings', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (auth.tenant_id !== req.params['id'] || !auth.roles.includes('admin')) {
    if (!auth.roles.includes('platform_admin')) {
      res.status(403).json({ error: 'forbidden', message: 'admin role required' });
      return;
    }
  }

  const body = updateSettingsSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  const updated = await prisma.tenantSettings.update({
    where: { tenantId: req.params['id'] },
    data: {
      ...(body.data.anonymized_benchmarks_consent !== undefined && {
        anonymizedBenchmarksConsent: body.data.anonymized_benchmarks_consent,
      }),
      ...(body.data.data_retention_days !== undefined && {
        dataRetentionDays: body.data.data_retention_days,
      }),
      ...(body.data.compliance_frameworks !== undefined && {
        complianceFrameworks: body.data.compliance_frameworks,
      }),
      ...(body.data.agent_deployment_platform !== undefined && {
        agentDeploymentPlatform: (body.data.agent_deployment_platform === null
          ? Prisma.DbNull
          : body.data.agent_deployment_platform) as Prisma.InputJsonValue | typeof Prisma.DbNull,
      }),
    },
  });

  res.json(serializeSettings(updated));
});

// ── Serializers ───────────────────────────────────────────────────────────────

function serializeTenant(t: { id: string; name: string; slug: string; deploymentMode: string; status: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    deployment_mode: t.deploymentMode,
    status: t.status,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

function serializeSettings(s: {
  tenantId: string;
  anonymizedBenchmarksConsent: boolean;
  dataRetentionDays: number;
  complianceFrameworks: string[];
  agentDeploymentPlatform: unknown;
  updatedAt: Date;
}) {
  return {
    tenant_id: s.tenantId,
    anonymized_benchmarks_consent: s.anonymizedBenchmarksConsent,
    data_retention_days: s.dataRetentionDays,
    compliance_frameworks: s.complianceFrameworks,
    agent_deployment_platform: s.agentDeploymentPlatform ?? null,
    updated_at: s.updatedAt.toISOString(),
  };
}
