import { api, type ApiError } from '../api';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export async function login(email: string, password: string, tenantSlug: string): Promise<TokenResponse> {
  return api<TokenResponse>('substrate', '/v1/auth/token', {
    method: 'POST',
    body: { email, password, tenant_slug: tenantSlug },
    noAuth: true,
  });
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  deployment_mode: 'pooled' | 'siloed' | 'on-prem';
  status: 'active' | 'suspended' | 'offboarded';
  created_at: string;
  updated_at: string;
}

export async function getTenant(tenantId: string): Promise<Tenant> {
  return api<Tenant>('substrate', `/v1/tenants/${tenantId}`);
}

export type AgentDeploymentPlatformKind =
  | 'aws_bedrock'
  | 'anthropic_cloud'
  | 'azure_openai'
  | 'google_vertex'
  | 'custom';

export interface AgentDeploymentPlatform {
  kind: AgentDeploymentPlatformKind;
  config_complete: boolean;
}

export interface TenantSettings {
  tenant_id: string;
  anonymized_benchmarks_consent: boolean;
  data_retention_days: number;
  compliance_frameworks: string[];
  agent_deployment_platform: AgentDeploymentPlatform | null;
  updated_at?: string;
}

export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  return api<TenantSettings>('substrate', `/v1/tenants/${tenantId}/settings`);
}

export async function updateTenantSettings(
  tenantId: string,
  patch: Partial<{
    anonymized_benchmarks_consent: boolean;
    data_retention_days: number;
    compliance_frameworks: string[];
    agent_deployment_platform: AgentDeploymentPlatform | null;
  }>,
): Promise<TenantSettings> {
  return api<TenantSettings>('substrate', `/v1/tenants/${tenantId}/settings`, {
    method: 'PATCH',
    body: patch,
  });
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string | null;
  roles: string[];
  status: string;
}

export async function listUsers(): Promise<User[]> {
  return api<User[]>('substrate', '/v1/users');
}

export interface AgentSummary {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  vendor_runtime: string;
  model_provider: string;
  model_id: string;
  framework?: string | null;
  status: 'active' | 'deprecated' | 'suspended';
}

export async function listAgents(tenantId: string): Promise<AgentSummary[]> {
  return api<AgentSummary[]>('substrate', `/v1/tenants/${tenantId}/agents`);
}

export async function getAgent(agentId: string): Promise<AgentSummary> {
  return api<AgentSummary>('substrate', `/v1/agents/${agentId}`);
}

export interface UoP {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  category: string;
  system_of_record: string;
  sor_object_type: string;
  sor_metric_field: string;
  baseline_value: number;
  baseline_currency: string | null;
  owner_team: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function listUops(tenantId: string): Promise<UoP[]> {
  return api<UoP[]>('substrate', `/v1/tenants/${tenantId}/uops`);
}

export async function getUop(tenantId: string, uopId: string): Promise<UoP> {
  return api<UoP>('substrate', `/v1/tenants/${tenantId}/uops/${uopId}`);
}

export interface UoPBundleItem {
  name: string;
  description: string;
  category: string;
  system_of_record: string;
  sor_object_type: string;
  sor_metric_field: string;
  baseline_value: number;
  baseline_currency?: string | null;
  owner_team: string;
}

export interface UoPBundle {
  format: 'aeos.uop.bundle';
  format_version: '1.0';
  exported_at: string;
  source_tenant_id?: string;
  items: UoPBundleItem[];
}

export interface UoPImportResultRow {
  index: number;
  status: 'created' | 'skipped' | 'error';
  id?: string;
  reason?: string;
  error?: string;
  details?: unknown;
}

export interface UoPImportResponse {
  summary: { total: number; created: number; skipped: number; errors: number };
  results: UoPImportResultRow[];
}

export function buildUopBundle(tenantId: string, uops: UoP[]): UoPBundle {
  return {
    format: 'aeos.uop.bundle',
    format_version: '1.0',
    exported_at: new Date().toISOString(),
    source_tenant_id: tenantId,
    items: uops.map((u) => ({
      name: u.name,
      description: u.description,
      category: u.category,
      system_of_record: u.system_of_record,
      sor_object_type: u.sor_object_type,
      sor_metric_field: u.sor_metric_field,
      baseline_value: u.baseline_value,
      baseline_currency: u.baseline_currency ?? undefined,
      owner_team: u.owner_team,
    })),
  };
}

export async function importUops(tenantId: string, bundle: unknown): Promise<UoPImportResponse> {
  return api<UoPImportResponse>('substrate', `/v1/tenants/${tenantId}/uops/import`, {
    method: 'POST',
    body: bundle,
  });
}

export interface ProcessStep {
  step_id: string;
  name: string;
  type: 'human' | 'agent' | 'automated' | 'decision';
  responsible_agent_id: string | null;
  inputs: string[];
  outputs: string[];
  next_steps: string[];
}

export interface Process {
  id: string;
  tenant_id: string;
  uop_id: string;
  name: string;
  description: string;
  steps: ProcessStep[];
  status: string;
  created_at: string;
  updated_at: string;
}

export async function listProcesses(tenantId: string): Promise<Process[]> {
  return api<Process[]>('substrate', `/v1/tenants/${tenantId}/processes`);
}

export async function getProcess(tenantId: string, processId: string): Promise<Process> {
  return api<Process>('substrate', `/v1/tenants/${tenantId}/processes/${processId}`);
}

// ── Agent step spec + export ───────────────────────────────────────────────────

export type VendorRuntime =
  | 'aws_bedrock' | 'azure_openai' | 'google_vertex' | 'anthropic_cloud'
  | 'openai_platform' | 'salesforce_agentforce' | 'servicenow_now_assist'
  | 'microsoft_copilot' | 'sap_joule' | 'workday_illuminate' | 'custom';

export type ModelProviderId =
  | 'anthropic' | 'openai' | 'google' | 'meta' | 'mistral' | 'cohere' | 'amazon' | 'custom';

export interface AgentStepSpec {
  id: string;
  tenant_id: string;
  process_id: string;
  step_id: string;
  name: string;
  description: string;
  vendor_runtime: VendorRuntime;
  model_provider: ModelProviderId;
  model_id: string;
  framework?: string;
  system_prompt: string;
  user_prompt_template?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: unknown;
  input_schema?: unknown;
  output_schema?: unknown;
  created_at: string;
  updated_at: string;
}

export interface AgentStepSpecInput {
  name: string;
  description?: string;
  vendor_runtime: VendorRuntime;
  model_provider: ModelProviderId;
  model_id: string;
  framework?: string;
  system_prompt: string;
  user_prompt_template?: string;
  temperature?: number;
  max_tokens?: number;
}

export async function getAgentStepSpec(
  tenantId: string,
  processId: string,
  stepId: string,
): Promise<AgentStepSpec | null> {
  try {
    return await api<AgentStepSpec>(
      'substrate',
      `/v1/tenants/${tenantId}/processes/${processId}/steps/${stepId}/spec`,
    );
  } catch (e) {
    if ((e as ApiError)?.status === 404) return null;
    throw e;
  }
}

export async function putAgentStepSpec(
  tenantId: string,
  processId: string,
  stepId: string,
  body: AgentStepSpecInput,
): Promise<AgentStepSpec> {
  return api<AgentStepSpec>(
    'substrate',
    `/v1/tenants/${tenantId}/processes/${processId}/steps/${stepId}/spec`,
    { method: 'PUT', body },
  );
}

export interface AgentDefinitionExport {
  format: 'aeos.agent.definition';
  format_version: '1.0';
  exported_at: string;
  source_tenant_id: string;
  process: { id: string; step_id: string; step_name: string; uop_id: string };
  agent: {
    id: string;
    name: string;
    description: string;
    vendor_runtime: string;
    model_provider: string;
    model_id: string;
    framework?: string;
    system_prompt: string;
    user_prompt_template?: string;
    temperature?: number;
    max_tokens?: number;
    tools?: unknown;
    input_schema?: unknown;
    output_schema?: unknown;
  };
  telemetry_contract: {
    otlp_endpoint_hint: string;
    defaults: Record<string, string>;
    required_runtime_attributes: string[];
    optional_attributes: string[];
    adapter_sdk_package: string;
    adapter_sdk_version: string;
  };
}

export async function exportAgentStep(
  tenantId: string,
  processId: string,
  stepId: string,
): Promise<AgentDefinitionExport> {
  return api<AgentDefinitionExport>(
    'substrate',
    `/v1/tenants/${tenantId}/processes/${processId}/steps/${stepId}/export`,
  );
}
