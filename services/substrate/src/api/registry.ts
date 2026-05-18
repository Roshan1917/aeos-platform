/**
 * Registry proxy APIs — substrate hosts the semantic registries.
 * Other services read from these endpoints; only designated services write.
 *
 * GET  /v1/tenants/:id/uops          — list UoPs
 * POST /v1/tenants/:id/uops          — create UoP (Assessment service only)
 * GET  /v1/tenants/:id/uops/:uopId
 * GET  /v1/tenants/:id/processes     — list Processes
 * POST /v1/tenants/:id/processes     — create Process (Process Discovery only)
 * GET  /v1/tenants/:id/processes/:processId
 * GET  /v1/tenants/:id/agents        — list Agents (read-only for most services)
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireAccessToken } from '../lib/jwt.js';
import { createProducer } from '@aeos/event-bus-client';
import {
  tenantId as mkTenantId,
  uoPId as mkUoPId,
  AGENT_DEFINITION_FORMAT,
  AGENT_DEFINITION_FORMAT_VERSION,
  AGENT_TELEMETRY_REQUIRED_ATTRIBUTES,
  AGENT_TELEMETRY_OPTIONAL_ATTRIBUTES,
} from '@aeos/canonical-schema';
import { Prisma } from '../../prisma/generated/index.js';
import { config } from '../config.js';

export const registryRouter = Router();

// ── UoPs ─────────────────────────────────────────────────────────────────────

registryRouter.get('/tenants/:tenantId/uops', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (auth.tenant_id !== req.params['tenantId'] && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const uops = await prisma.uoP.findMany({
    where: { tenantId: req.params['tenantId'] },
    orderBy: { createdAt: 'asc' },
  });
  res.json(uops.map(serializeUoP));
});

const createUoPSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().default(''),
  category: z.enum([
    'revenue_generation', 'cost_reduction', 'risk_mitigation',
    'compliance', 'customer_experience', 'operational_efficiency',
  ]),
  system_of_record: z.enum(['salesforce', 'sap', 'hubspot', 'oracle', 'workday', 'servicenow', 'custom']),
  sor_object_type: z.string().min(1),
  sor_metric_field: z.string().min(1),
  baseline_value: z.number(),
  baseline_currency: z.string().optional(),
  owner_team: z.string().min(1),
});

registryRouter.post('/tenants/:tenantId/uops', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (auth.tenant_id !== req.params['tenantId']) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  // Only Assessment service writes UoPs — in v1 we trust the admin role claim
  if (!auth.roles.includes('admin') && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden', message: 'admin role required' });
    return;
  }

  const body = createUoPSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  const uop = await prisma.uoP.create({
    data: {
      tenantId: req.params['tenantId']!,
      name: body.data.name,
      description: body.data.description,
      category: body.data.category,
      systemOfRecord: body.data.system_of_record,
      sorObjectType: body.data.sor_object_type,
      sorMetricField: body.data.sor_metric_field,
      baselineValue: body.data.baseline_value,
      baselineCurrency: body.data.baseline_currency,
      ownerTeam: body.data.owner_team,
    },
  });

  // Emit registry event
  try {
    const producer = createProducer({ tenantId: mkTenantId(auth.tenant_id), service: 'substrate' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await producer.publish({ event_type: 'registry.uop.registered', schema_version: '1.0', tenant_id: mkTenantId(auth.tenant_id), occurred_at: new Date().toISOString(), payload: { uop_id: mkUoPId(uop.id), name: uop.name, category: uop.category } } as any);
    await producer.disconnect();
  } catch (err) {
    console.error('[substrate] Failed to emit registry.uop.registered:', err);
  }

  res.status(201).json(serializeUoP(uop));
});

// Bulk import — accept a UoP bundle (export format) and create new UoPs.
// Duplicate-by-name within the tenant are skipped (not updated). Patent-adjacent
// schema is unchanged; this only serializes existing fields.
const importItemSchema = createUoPSchema.extend({
  // Tolerate (and ignore) server-generated fields if a previously exported file is fed back in.
  id: z.string().optional(),
  tenant_id: z.string().optional(),
  schema_version: z.string().optional(),
  status: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const importBundleSchema = z.object({
  format: z.literal('aeos.uop.bundle'),
  format_version: z.string(),
  exported_at: z.string().optional(),
  source_tenant_id: z.string().optional(),
  items: z.array(z.unknown()).min(1).max(500),
});

registryRouter.post('/tenants/:tenantId/uops/import', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (auth.tenant_id !== req.params['tenantId']) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  if (!auth.roles.includes('admin') && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden', message: 'admin role required' });
    return;
  }

  const envelope = importBundleSchema.safeParse(req.body);
  if (!envelope.success) {
    res.status(400).json({ error: 'invalid_request', details: envelope.error.flatten() });
    return;
  }

  const tenantId = req.params['tenantId']!;
  const existing = await prisma.uoP.findMany({
    where: { tenantId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((u) => u.name));
  const seenInBatch = new Set<string>();

  type ResultRow =
    | { index: number; status: 'created'; id: string }
    | { index: number; status: 'skipped'; reason: 'duplicate_name' }
    | { index: number; status: 'error'; error: string; details?: unknown };

  const results: ResultRow[] = [];
  const toCreate: { index: number; data: z.infer<typeof createUoPSchema> }[] = [];

  envelope.data.items.forEach((raw, index) => {
    const parsed = importItemSchema.safeParse(raw);
    if (!parsed.success) {
      results.push({ index, status: 'error', error: 'invalid_item', details: parsed.error.flatten() });
      return;
    }
    const name = parsed.data.name;
    if (existingNames.has(name) || seenInBatch.has(name)) {
      results.push({ index, status: 'skipped', reason: 'duplicate_name' });
      return;
    }
    seenInBatch.add(name);
    toCreate.push({
      index,
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        category: parsed.data.category,
        system_of_record: parsed.data.system_of_record,
        sor_object_type: parsed.data.sor_object_type,
        sor_metric_field: parsed.data.sor_metric_field,
        baseline_value: parsed.data.baseline_value,
        baseline_currency: parsed.data.baseline_currency,
        owner_team: parsed.data.owner_team,
      },
    });
  });

  const created = await prisma.$transaction(
    toCreate.map((c) =>
      prisma.uoP.create({
        data: {
          tenantId,
          name: c.data.name,
          description: c.data.description,
          category: c.data.category,
          systemOfRecord: c.data.system_of_record,
          sorObjectType: c.data.sor_object_type,
          sorMetricField: c.data.sor_metric_field,
          baselineValue: c.data.baseline_value,
          baselineCurrency: c.data.baseline_currency,
          ownerTeam: c.data.owner_team,
        },
      }),
    ),
  );

  toCreate.forEach((c, i) => {
    results.push({ index: c.index, status: 'created', id: created[i]!.id });
  });
  results.sort((a, b) => a.index - b.index);

  if (created.length > 0) {
    try {
      const producer = createProducer({ tenantId: mkTenantId(auth.tenant_id), service: 'substrate' });
      for (const uop of created) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await producer.publish({
          event_type: 'registry.uop.registered',
          schema_version: '1.0',
          tenant_id: mkTenantId(auth.tenant_id),
          occurred_at: new Date().toISOString(),
          payload: { uop_id: mkUoPId(uop.id), name: uop.name, category: uop.category },
        } as any);
      }
      await producer.disconnect();
    } catch (err) {
      console.error('[substrate] Failed to emit registry.uop.registered (bulk import):', err);
    }
  }

  const summary = {
    total: envelope.data.items.length,
    created: results.filter((r) => r.status === 'created').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
  };

  res.status(200).json({ summary, results });
});

registryRouter.get('/tenants/:tenantId/uops/:uopId', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (auth.tenant_id !== req.params['tenantId'] && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const uop = await prisma.uoP.findFirst({
    where: { id: req.params['uopId'], tenantId: req.params['tenantId'] },
  });
  if (!uop) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(serializeUoP(uop));
});

// ── Processes ─────────────────────────────────────────────────────────────────

registryRouter.get('/tenants/:tenantId/processes', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (auth.tenant_id !== req.params['tenantId'] && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const processes = await prisma.process.findMany({
    where: { tenantId: req.params['tenantId'] },
    orderBy: { createdAt: 'asc' },
  });
  res.json(processes.map(serializeProcess));
});

const createProcessSchema = z.object({
  uop_id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().default(''),
  steps: z.array(z.object({
    step_id: z.string(),
    name: z.string(),
    type: z.enum(['human', 'agent', 'automated', 'decision']),
    responsible_agent_id: z.string().optional(),
    inputs: z.array(z.string()),
    outputs: z.array(z.string()),
    next_steps: z.array(z.string()),
  })).default([]),
});

registryRouter.post('/tenants/:tenantId/processes', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (auth.tenant_id !== req.params['tenantId']) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  if (!auth.roles.includes('admin') && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden', message: 'admin role required' });
    return;
  }

  const body = createProcessSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  const process = await prisma.process.create({
    data: {
      tenantId: req.params['tenantId']!,
      uopId: body.data.uop_id,
      name: body.data.name,
      description: body.data.description,
      steps: body.data.steps,
    },
  });

  try {
    const producer = createProducer({ tenantId: mkTenantId(auth.tenant_id), service: 'substrate' });
    await producer.publish({
      event_type: 'registry.process.registered',
      schema_version: '1.0',
      tenant_id: mkTenantId(auth.tenant_id),
      occurred_at: new Date().toISOString(),
      payload: { process_id: process.id, name: process.name, uop_id: mkUoPId(process.uopId) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await producer.disconnect();
  } catch (err) {
    console.error('[substrate] Failed to emit registry.process.registered:', err);
  }

  res.status(201).json(serializeProcess(process));
});

registryRouter.get('/tenants/:tenantId/processes/:processId', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (auth.tenant_id !== req.params['tenantId'] && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const process = await prisma.process.findFirst({
    where: { id: req.params['processId'], tenantId: req.params['tenantId'] },
  });
  if (!process) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(serializeProcess(process));
});

// ── Agent step specs (Process Discovery → fills in agent for an agent step) ───

const toolSpecSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  input_schema: z.record(z.unknown()),
});

const upsertSpecSchema = z.object({
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
  system_prompt: z.string().min(1),
  user_prompt_template: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  tools: z.array(toolSpecSchema).optional(),
  input_schema: z.record(z.unknown()).optional(),
  output_schema: z.record(z.unknown()).optional(),
});

async function loadAgentStep(tenantId: string, processId: string, stepId: string) {
  const proc = await prisma.process.findFirst({ where: { id: processId, tenantId } });
  if (!proc) return { error: 'process_not_found' as const };
  const steps = Array.isArray(proc.steps) ? (proc.steps as Array<Record<string, unknown>>) : [];
  const step = steps.find((s) => s['step_id'] === stepId);
  if (!step) return { error: 'step_not_found' as const };
  if (step['type'] !== 'agent') return { error: 'step_not_agent_type' as const };
  return { proc, step };
}

registryRouter.get(
  '/tenants/:tenantId/processes/:processId/steps/:stepId/spec',
  requireAccessToken,
  async (req, res) => {
    const auth = req.substrateAuth!;
    if (auth.tenant_id !== req.params['tenantId'] && !auth.roles.includes('platform_admin')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const loaded = await loadAgentStep(
      req.params['tenantId']!,
      req.params['processId']!,
      req.params['stepId']!,
    );
    if ('error' in loaded) {
      res.status(loaded.error === 'step_not_agent_type' ? 400 : 404).json({ error: loaded.error });
      return;
    }
    const spec = await prisma.agentStepSpec.findUnique({
      where: { processId_stepId: { processId: loaded.proc.id, stepId: req.params['stepId']! } },
    });
    if (!spec) {
      res.status(404).json({ error: 'spec_not_found' });
      return;
    }
    res.json(serializeSpec(spec));
  },
);

registryRouter.put(
  '/tenants/:tenantId/processes/:processId/steps/:stepId/spec',
  requireAccessToken,
  async (req, res) => {
    const auth = req.substrateAuth!;
    if (auth.tenant_id !== req.params['tenantId']) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (!auth.roles.includes('admin') && !auth.roles.includes('platform_admin')) {
      res.status(403).json({ error: 'forbidden', message: 'admin role required' });
      return;
    }
    const loaded = await loadAgentStep(
      req.params['tenantId']!,
      req.params['processId']!,
      req.params['stepId']!,
    );
    if ('error' in loaded) {
      res.status(loaded.error === 'step_not_agent_type' ? 400 : 404).json({ error: loaded.error });
      return;
    }
    const body = upsertSpecSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
      return;
    }
    const data = {
      tenantId: auth.tenant_id,
      name: body.data.name,
      description: body.data.description,
      vendorRuntime: body.data.vendor_runtime,
      modelProvider: body.data.model_provider,
      modelId: body.data.model_id,
      framework: body.data.framework,
      systemPrompt: body.data.system_prompt,
      userPromptTemplate: body.data.user_prompt_template,
      temperature: body.data.temperature,
      maxTokens: body.data.max_tokens,
      tools: (body.data.tools ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
      inputSchema: (body.data.input_schema ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
      outputSchema: (body.data.output_schema ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
    };
    const spec = await prisma.agentStepSpec.upsert({
      where: { processId_stepId: { processId: loaded.proc.id, stepId: req.params['stepId']! } },
      create: { processId: loaded.proc.id, stepId: req.params['stepId']!, ...data },
      update: data,
    });
    res.json(serializeSpec(spec));
  },
);

// ── Agent definition export bundle for a process step ─────────────────────────

registryRouter.get(
  '/tenants/:tenantId/processes/:processId/steps/:stepId/export',
  requireAccessToken,
  async (req, res) => {
    const auth = req.substrateAuth!;
    if (auth.tenant_id !== req.params['tenantId'] && !auth.roles.includes('platform_admin')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const loaded = await loadAgentStep(
      req.params['tenantId']!,
      req.params['processId']!,
      req.params['stepId']!,
    );
    if ('error' in loaded) {
      res.status(loaded.error === 'step_not_agent_type' ? 400 : 404).json({ error: loaded.error });
      return;
    }
    const spec = await prisma.agentStepSpec.findUnique({
      where: { processId_stepId: { processId: loaded.proc.id, stepId: req.params['stepId']! } },
    });
    if (!spec) {
      res.status(404).json({
        error: 'spec_not_found',
        message: 'Configure agent for this step first (PUT .../spec).',
      });
      return;
    }

    // Pre-bind known identity attributes. tenant_id and uop_id come from
    // server state; agent_id reuses spec.id so harness has a stable identifier
    // it can stamp on every span before AEOS sees the agent for the first time.
    const agentId = spec.id;
    const telemetryDefaults: Record<string, string> = {
      'aeos.tenant_id': auth.tenant_id,
      'aeos.agent_id': agentId,
      'aeos.uop_id': loaded.proc.uopId,
      'aeos.vendor_runtime': spec.vendorRuntime,
      'aeos.model_provider': spec.modelProvider,
      'aeos.model_id': spec.modelId,
    };
    // Attributes the harness still has to fill in per-run (token counts etc).
    const requiredRuntimeAttributes = AGENT_TELEMETRY_REQUIRED_ATTRIBUTES.filter(
      (a) => !(a in telemetryDefaults),
    );

    const bundle = {
      format: AGENT_DEFINITION_FORMAT,
      format_version: AGENT_DEFINITION_FORMAT_VERSION,
      exported_at: new Date().toISOString(),
      source_tenant_id: auth.tenant_id,
      process: {
        id: loaded.proc.id,
        step_id: String(loaded.step['step_id']),
        step_name: String(loaded.step['name'] ?? ''),
        uop_id: loaded.proc.uopId,
      },
      agent: {
        id: agentId,
        name: spec.name,
        description: spec.description,
        vendor_runtime: spec.vendorRuntime,
        model_provider: spec.modelProvider,
        model_id: spec.modelId,
        framework: spec.framework ?? undefined,
        system_prompt: spec.systemPrompt,
        user_prompt_template: spec.userPromptTemplate ?? undefined,
        temperature: spec.temperature ?? undefined,
        max_tokens: spec.maxTokens ?? undefined,
        tools: spec.tools ?? undefined,
        input_schema: spec.inputSchema ?? undefined,
        output_schema: spec.outputSchema ?? undefined,
      },
      telemetry_contract: {
        otlp_endpoint_hint: config.AEOS_TELEMETRY_URL_HINT,
        defaults: telemetryDefaults,
        required_runtime_attributes: requiredRuntimeAttributes,
        optional_attributes: AGENT_TELEMETRY_OPTIONAL_ATTRIBUTES,
        adapter_sdk_package: '@aeos/telemetry-sdk',
        adapter_sdk_version: 'latest',
      },
    };

    res.json(bundle);
  },
);

type SpecRow = {
  id: string; tenantId: string; processId: string; stepId: string;
  name: string; description: string;
  vendorRuntime: string; modelProvider: string; modelId: string;
  framework: string | null;
  systemPrompt: string; userPromptTemplate: string | null;
  temperature: number | null; maxTokens: number | null;
  tools: unknown; inputSchema: unknown; outputSchema: unknown;
  createdAt: Date; updatedAt: Date;
};

function serializeSpec(s: SpecRow) {
  return {
    id: s.id,
    tenant_id: s.tenantId,
    process_id: s.processId,
    step_id: s.stepId,
    name: s.name,
    description: s.description,
    vendor_runtime: s.vendorRuntime,
    model_provider: s.modelProvider,
    model_id: s.modelId,
    framework: s.framework ?? undefined,
    system_prompt: s.systemPrompt,
    user_prompt_template: s.userPromptTemplate ?? undefined,
    temperature: s.temperature ?? undefined,
    max_tokens: s.maxTokens ?? undefined,
    tools: s.tools ?? undefined,
    input_schema: s.inputSchema ?? undefined,
    output_schema: s.outputSchema ?? undefined,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
  };
}

// ── Read-only agent list for registry consumers ────────────────────────────────

registryRouter.get('/tenants/:tenantId/agents', requireAccessToken, async (req, res) => {
  const auth = req.substrateAuth!;
  if (auth.tenant_id !== req.params['tenantId'] && !auth.roles.includes('platform_admin')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const agents = await prisma.agent.findMany({
    where: { tenantId: req.params['tenantId'] },
    orderBy: { createdAt: 'asc' },
  });
  res.json(agents.map((a) => ({
    id: a.id,
    tenant_id: a.tenantId,
    name: a.name,
    vendor_runtime: a.vendorRuntime,
    model_provider: a.modelProvider,
    model_id: a.modelId,
    status: a.status,
  })));
});

// ── Serializers ───────────────────────────────────────────────────────────────

type UoPRow = {
  id: string; tenantId: string; name: string; description: string; category: string;
  systemOfRecord: string; sorObjectType: string; sorMetricField: string;
  baselineValue: number; baselineCurrency: string | null; ownerTeam: string;
  status: string; createdAt: Date; updatedAt: Date;
};

function serializeUoP(u: UoPRow) {
  return {
    id: u.id,
    tenant_id: u.tenantId,
    schema_version: '1.0',
    name: u.name,
    description: u.description,
    category: u.category,
    system_of_record: u.systemOfRecord,
    sor_object_type: u.sorObjectType,
    sor_metric_field: u.sorMetricField,
    baseline_value: u.baselineValue,
    baseline_currency: u.baselineCurrency,
    owner_team: u.ownerTeam,
    status: u.status,
    created_at: u.createdAt.toISOString(),
    updated_at: u.updatedAt.toISOString(),
  };
}

type ProcessRow = {
  id: string; tenantId: string; uopId: string; name: string;
  description: string; steps: unknown; status: string; createdAt: Date; updatedAt: Date;
};

function serializeProcess(p: ProcessRow) {
  return {
    id: p.id,
    tenant_id: p.tenantId,
    uop_id: p.uopId,
    name: p.name,
    description: p.description,
    steps: p.steps,
    status: p.status,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}
