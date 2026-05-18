/**
 * POST /v1/agents                             — register agent (SDK adapters + admins)
 * GET  /v1/agents                             — list agents in tenant
 * GET  /v1/agents/:id                         — get agent
 * POST /v1/agent-contracts                    — create agent contract (PATENT: Family 1)
 * GET  /v1/agent-contracts/:id                — get agent contract
 * POST /v1/agent-contracts/:id/verify         — verify agent identity (used by @aeos/auth-client)
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireAccessToken } from '../lib/jwt.js';
import { writeTuples } from '../lib/openfga.js';
import { createProducer } from '@aeos/event-bus-client';
import type { AgentRegisteredEvent } from '@aeos/canonical-schema/events';
import { tenantId as mkTenantId } from '@aeos/canonical-schema';

export const agentsRouter = Router();

// ── POST /v1/agents ───────────────────────────────────────────────────────────

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().default(''),
  vendor_runtime: z.enum([
    'aws_bedrock', 'azure_openai', 'google_vertex', 'anthropic_cloud',
    'openai_platform', 'salesforce_agentforce', 'servicenow_now_assist',
    'microsoft_copilot', 'sap_joule', 'workday_illuminate', 'custom',
  ]),
  model_provider: z.enum(['anthropic', 'openai', 'google', 'meta', 'mistral', 'cohere', 'amazon', 'custom']),
  model_id: z.string().min(1),
  framework: z.string().optional(),
  adapter_sdk_version: z.string().optional(),
});

agentsRouter.post('/', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  const body = createAgentSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  const agent = await prisma.agent.create({
    data: {
      tenantId: auth.tenant_id,
      name: body.data.name,
      description: body.data.description,
      vendorRuntime: body.data.vendor_runtime,
      modelProvider: body.data.model_provider,
      modelId: body.data.model_id,
      framework: body.data.framework,
      adapterSdkVersion: body.data.adapter_sdk_version,
    },
  });

  // Grant tenant members read access to this agent in OpenFGA
  await writeTuples([
    { user: `tenant:${auth.tenant_id}`, relation: 'tenant', object: `agent:${agent.id}` },
  ]);

  // Emit registry event
  try {
    const producer = createProducer({ tenantId: mkTenantId(auth.tenant_id), service: 'substrate' });
    await producer.publish({
      event_type: 'registry.agent.registered',
      schema_version: '1.0',
      tenant_id: mkTenantId(auth.tenant_id),
      occurred_at: new Date().toISOString(),
      payload: {
        agent_id: agent.id,
        name: agent.name,
        vendor_runtime: agent.vendorRuntime,
        model_provider: agent.modelProvider,
        model_id: agent.modelId,
      },
    } as unknown as AgentRegisteredEvent);
    await producer.disconnect();
  } catch (err) {
    // Non-fatal: log and continue (v1 observational, no blocking)
    console.error('[substrate] Failed to emit registry.agent.registered:', err);
  }

  res.status(201).json(serializeAgent(agent));
});

agentsRouter.get('/', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  const agents = await prisma.agent.findMany({
    where: { tenantId: auth.tenant_id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(agents.map(serializeAgent));
});

agentsRouter.get('/:id', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  const agent = await prisma.agent.findFirst({
    where: { id: req.params['id'], tenantId: auth.tenant_id },
  });
  if (!agent) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(serializeAgent(agent));
});

// ── Agent Contracts (PATENT: Family 1) ────────────────────────────────────────

const uefWeightsSchema = z.object({
  task_completion: z.number().min(0).max(1),
  decision_quality: z.number().min(0).max(1),
  resource_efficiency: z.number().min(0).max(1),
  compliance_adherence: z.number().min(0).max(1),
  human_oversight_ratio: z.number().min(0).max(1),
  error_recovery: z.number().min(0).max(1),
  knowledge_utilization: z.number().min(0).max(1),
  coordination_effectiveness: z.number().min(0).max(1),
}).refine(
  (w) => {
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    return Math.abs(sum - 1.0) < 0.001;
  },
  { message: 'UEF scoring weights must sum to 1.0' },
);

const createContractSchema = z.object({
  agent_id: z.string().min(1),
  uop_id: z.string().min(1),
  target_value: z.number(),
  target_currency: z.string().optional(),
  scoring_weights: uefWeightsSchema,
  effective_from: z.string().datetime(),
  effective_until: z.string().datetime().optional(),
});

agentsRouter.post('/contracts', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (!auth.roles.includes('admin') && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden', message: 'admin role required' });
    return;
  }

  const body = createContractSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  // Verify agent belongs to this tenant
  const agent = await prisma.agent.findFirst({
    where: { id: body.data.agent_id, tenantId: auth.tenant_id },
  });
  if (!agent) {
    res.status(404).json({ error: 'agent_not_found' });
    return;
  }

  // Supersede any existing active contract for this agent
  await prisma.agentContract.updateMany({
    where: { agentId: body.data.agent_id, tenantId: auth.tenant_id, status: 'active' },
    data: { status: 'superseded' },
  });

  const contract = await prisma.agentContract.create({
    data: {
      tenantId: auth.tenant_id,
      agentId: body.data.agent_id,
      uopId: body.data.uop_id,
      targetValue: body.data.target_value,
      targetCurrency: body.data.target_currency,
      scoringWeights: body.data.scoring_weights,
      effectiveFrom: new Date(body.data.effective_from),
      effectiveUntil: body.data.effective_until ? new Date(body.data.effective_until) : null,
      createdBy: auth.sub,
    },
  });

  res.status(201).json(serializeContract(contract));
});

agentsRouter.get('/contracts/:id', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  const contract = await prisma.agentContract.findFirst({
    where: { id: req.params['id'], tenantId: auth.tenant_id },
  });
  if (!contract) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(serializeContract(contract));
});

// ── POST /v1/agent-contracts/:id/verify ──────────────────────────────────────
// Called by @aeos/auth-client.verifyAgentContract()

agentsRouter.post('/contracts/:id/verify', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  const contract = await prisma.agentContract.findFirst({
    where: { id: req.params['id'], tenantId: auth.tenant_id },
    include: { agent: true },
  });

  if (!contract || contract.status !== 'active') {
    res.json({ verified: false, reason: 'contract_not_found_or_inactive' });
    return;
  }

  const now = new Date();
  if (contract.effectiveFrom > now || (contract.effectiveUntil && contract.effectiveUntil < now)) {
    res.json({ verified: false, reason: 'contract_not_in_effect' });
    return;
  }

  res.json({
    verified: true,
    agent_id: contract.agentId,
    uop_id: contract.uopId,
    contract_id: contract.id,
    scoring_weights: contract.scoringWeights,
  });
});

// ── Serializers ───────────────────────────────────────────────────────────────

type AgentRow = {
  id: string; tenantId: string; name: string; description: string;
  vendorRuntime: string; modelProvider: string; modelId: string;
  framework: string | null; adapterSdkVersion: string | null;
  status: string; createdAt: Date; updatedAt: Date;
};

function serializeAgent(a: AgentRow) {
  return {
    id: a.id,
    tenant_id: a.tenantId,
    schema_version: '1.0',
    name: a.name,
    description: a.description,
    vendor_runtime: a.vendorRuntime,
    model_provider: a.modelProvider,
    model_id: a.modelId,
    framework: a.framework,
    adapter_sdk_version: a.adapterSdkVersion,
    status: a.status,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  };
}

type ContractRow = {
  id: string; tenantId: string; agentId: string; uopId: string;
  targetValue: number; targetCurrency: string | null; scoringWeights: unknown;
  effectiveFrom: Date; effectiveUntil: Date | null; status: string;
  createdBy: string; createdAt: Date;
};

function serializeContract(c: ContractRow) {
  return {
    id: c.id,
    tenant_id: c.tenantId,
    schema_version: '1.0',
    agent_id: c.agentId,
    uop_id: c.uopId,
    target_value: c.targetValue,
    target_currency: c.targetCurrency,
    scoring_weights: c.scoringWeights,
    effective_from: c.effectiveFrom.toISOString(),
    effective_until: c.effectiveUntil?.toISOString() ?? null,
    status: c.status,
    created_by: c.createdBy,
    created_at: c.createdAt.toISOString(),
  };
}
