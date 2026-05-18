import { randomUUID } from 'crypto';
import type {
  Agent,
  AgentContract,
  AeosSpan,
  LedgerRow,
  Tenant,
  UoP,
} from '@aeos/canonical-schema';
import { tenantId, uoPId, agentId } from '@aeos/canonical-schema';

export function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  const id = tenantId(randomUUID());
  return {
    id,
    name: 'Test Corp',
    slug: 'test-corp',
    deploymentMode: 'pooled',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeUoP(tid = tenantId('test-tenant'), overrides: Partial<UoP> = {}): UoP {
  return {
    schema_version: '1.0',
    id: uoPId(randomUUID()),
    tenant_id: tid,
    name: 'Test UoP',
    description: 'Test unit of performance',
    category: 'revenue_generation',
    system_of_record: 'salesforce',
    sor_object_type: 'Opportunity',
    sor_metric_field: 'Amount',
    baseline_value: 100000,
    owner_team: 'sales',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeAgent(tid = tenantId('test-tenant'), overrides: Partial<Agent> = {}): Agent {
  return {
    schema_version: '1.0',
    id: agentId(randomUUID()),
    tenant_id: tid,
    name: 'Test Agent',
    description: 'Test agent',
    vendor_runtime: 'anthropic_cloud',
    model_provider: 'anthropic',
    model_id: 'claude-sonnet-4-6',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeSpan(tid = tenantId('test-tenant'), overrides: Partial<AeosSpan> = {}): AeosSpan {
  return {
    schema_version: '1.0',
    span_id: randomUUID() as AeosSpan['span_id'],
    trace_id: randomUUID() as AeosSpan['trace_id'],
    tenant_id: tid,
    agent_id: agentId(randomUUID()),
    name: 'test-span',
    kind: 'llm_call',
    start_time: new Date().toISOString(),
    end_time: new Date().toISOString(),
    duration_ms: 100,
    status: 'ok',
    attributes: {
      'aeos.model_provider': 'anthropic',
      'aeos.input_tokens': 500,
      'aeos.output_tokens': 200,
      'aeos.cost_usd': 0.005,
    },
    events: [],
    ...overrides,
  };
}
