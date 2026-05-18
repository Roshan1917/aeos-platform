/**
 * seed-registries.ts — seeds dev UoPs, Processes, and Agents via substrate registry proxy
 *
 * Run after:
 *   1. docker-compose up -d
 *   2. pnpm prisma migrate dev (in services/substrate)
 *   3. seed-openfga.ts
 *   4. seed-tenant.ts  ← creates admin@dev-corp.local
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../.env') });

const AUTH_SERVICE_URL = process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3002';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getAdminToken(): Promise<{ token: string; tenantId: string }> {
  const res = await fetch(`${AUTH_SERVICE_URL}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@dev-corp.local',
      password: 'DevPassword1234!',
      tenant_slug: 'dev-corp',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Auth failed (run seed-tenant.ts first): ${res.status} ${body}`,
    );
  }

  const data = await res.json() as { access_token: string };

  // Decode tenant_id from JWT payload (no verification needed here — local dev)
  const [, payloadB64] = data.access_token.split('.');
  const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString()) as {
    tenant_id: string;
  };

  return { token: data.access_token, tenantId: payload.tenant_id };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function post(
  path: string,
  body: unknown,
  token: string,
  label: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${AUTH_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    console.log(`  ✓ ${label} (already exists)`);
    return null;
  } else if (!res.ok) {
    const bodyText = await res.text();
    console.warn(`  ! ${label}: POST ${path} failed ${res.status} — ${bodyText}`);
    return null;
  } else {
    const data = await res.json() as Record<string, unknown>;
    console.log(`  ✓ ${label}`);
    return data;
  }
}

// ── Seed data ─────────────────────────────────────────────────────────────────

async function seedRegistries(): Promise<void> {
  console.log('Seeding dev registries via substrate API...');

  const { token, tenantId } = await getAdminToken();
  const T = tenantId;

  console.log(`  tenant_id: ${T}`);

  // ── UoPs ────────────────────────────────────────────────────────────────────
  console.log('\nSeeding UoPs...');

  const uop1 = await post(
    `/v1/tenants/${T}/uops`,
    {
      name: 'Qualify Inbound Lead',
      description: 'Agent qualifies inbound leads against ICP criteria using Salesforce data',
      category: 'revenue_generation',
      system_of_record: 'salesforce',
      sor_object_type: 'Lead',
      sor_metric_field: 'ConvertedOpportunityAmount',
      baseline_value: 50000,
      baseline_currency: 'USD',
      owner_team: 'sales',
    },
    token,
    'UoP: Qualify Inbound Lead',
  );

  const uop2 = await post(
    `/v1/tenants/${T}/uops`,
    {
      name: 'Resolve Tier-1 Support Ticket',
      description: 'Agent resolves Tier-1 support tickets autonomously via knowledge base',
      category: 'cost_reduction',
      system_of_record: 'salesforce',
      sor_object_type: 'Case',
      sor_metric_field: 'ResolutionTime',
      baseline_value: 240,
      owner_team: 'support',
    },
    token,
    'UoP: Resolve Tier-1 Support Ticket',
  );

  await post(
    `/v1/tenants/${T}/uops`,
    {
      name: 'Draft Contract Clause',
      description: 'Agent drafts contract clauses from template library with legal review queue',
      category: 'cost_reduction',
      system_of_record: 'custom',
      sor_object_type: 'Contract',
      sor_metric_field: 'CycleTime',
      baseline_value: 480,
      owner_team: 'legal',
    },
    token,
    'UoP: Draft Contract Clause',
  );

  // ── Agents ───────────────────────────────────────────────────────────────────
  console.log('\nSeeding Agents...');

  await post(
    `/v1/agents`,
    {
      name: 'Lead Qualifier',
      description: 'Qualifies inbound leads using Claude Sonnet 4',
      vendor_runtime: 'anthropic_cloud',
      model_provider: 'anthropic',
      model_id: 'claude-sonnet-4-5',
      framework: 'langgraph',
    },
    token,
    'Agent: Lead Qualifier',
  );

  await post(
    `/v1/agents`,
    {
      name: 'Support Resolver',
      description: 'Resolves Tier-1 support tickets autonomously',
      vendor_runtime: 'anthropic_cloud',
      model_provider: 'anthropic',
      model_id: 'claude-haiku-4-5',
      framework: 'direct_api',
    },
    token,
    'Agent: Support Resolver',
  );

  await post(
    `/v1/agents`,
    {
      name: 'Contract Drafter',
      description: 'Drafts contract clauses with legal review integration',
      vendor_runtime: 'anthropic_cloud',
      model_provider: 'anthropic',
      model_id: 'claude-sonnet-4-5',
      framework: 'direct_api',
    },
    token,
    'Agent: Contract Drafter',
  );

  // ── Processes ────────────────────────────────────────────────────────────────
  console.log('\nSeeding Processes...');

  const uop1Id = uop1?.['id'] as string | undefined;
  const uop2Id = uop2?.['id'] as string | undefined;

  if (!uop1Id || !uop2Id) {
    console.warn('  ! Skipping processes — UoP IDs not available (UoPs may already exist; re-run after a clean seed)');
    console.log('\nRegistry seed complete.');
    return;
  }

  await post(
    `/v1/tenants/${T}/processes`,
    {
      uop_id: uop1Id,
      name: 'Lead Qualification Flow',
      description: 'Full lead qualification from inbound to opportunity creation',
      steps: [
        {
          step_id: 'step-1',
          name: 'Inbound Lead Received',
          type: 'automated',
          inputs: ['salesforce_lead'],
          outputs: ['lead_context'],
          next_steps: ['step-2'],
        },
        {
          step_id: 'step-2',
          name: 'Agent Qualifies Lead',
          type: 'agent',
          inputs: ['lead_context'],
          outputs: ['qualification_result'],
          next_steps: ['step-3', 'step-4'],
        },
        {
          step_id: 'step-3',
          name: 'Human Reviews Borderline Cases',
          type: 'human',
          inputs: ['qualification_result'],
          outputs: ['final_decision'],
          next_steps: ['step-4'],
        },
        {
          step_id: 'step-4',
          name: 'Update Salesforce',
          type: 'automated',
          inputs: ['final_decision'],
          outputs: ['salesforce_updated'],
          next_steps: [],
        },
      ],
    },
    token,
    'Process: Lead Qualification Flow',
  );

  await post(
    `/v1/tenants/${T}/processes`,
    {
      uop_id: uop2Id,
      name: 'Support Ticket Resolution',
      description: 'Automated tier-1 support resolution with escalation path',
      steps: [
        {
          step_id: 'step-1',
          name: 'Ticket Received',
          type: 'automated',
          inputs: ['salesforce_case'],
          outputs: ['ticket_context'],
          next_steps: ['step-2'],
        },
        {
          step_id: 'step-2',
          name: 'Agent Attempts Resolution',
          type: 'agent',
          inputs: ['ticket_context'],
          outputs: ['resolution_attempt'],
          next_steps: ['step-3', 'step-4'],
        },
        {
          step_id: 'step-3',
          name: 'Escalate to Tier-2',
          type: 'human',
          inputs: ['resolution_attempt'],
          outputs: ['escalation_note'],
          next_steps: [],
        },
        {
          step_id: 'step-4',
          name: 'Close Case',
          type: 'automated',
          inputs: ['resolution_attempt'],
          outputs: ['case_closed'],
          next_steps: [],
        },
      ],
    },
    token,
    'Process: Support Ticket Resolution',
  );

  console.log('\nRegistry seed complete.');
}

seedRegistries().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
