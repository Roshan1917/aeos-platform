// Agent step specifications. Created during Process Discovery as the user
// fills in the agent for an agent-type process step. Exported as JSON for
// the customer to instantiate in their own agent harness (Agentforce,
// Bedrock, etc.). The harness emits telemetry back to AEOS, which is what
// causes the Agent entity to register itself — not this spec.

import type { ProcessId } from './process.js';
import type { TenantId } from './tenant.js';

export const AGENT_DEFINITION_FORMAT = 'aeos.agent.definition' as const;
export const AGENT_DEFINITION_FORMAT_VERSION = '1.0' as const;

export type VendorRuntimeId =
  | 'aws_bedrock'
  | 'azure_openai'
  | 'google_vertex'
  | 'anthropic_cloud'
  | 'openai_platform'
  | 'salesforce_agentforce'
  | 'servicenow_now_assist'
  | 'microsoft_copilot'
  | 'sap_joule'
  | 'workday_illuminate'
  | 'custom';

export type ModelProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'meta'
  | 'mistral'
  | 'cohere'
  | 'amazon'
  | 'custom';

export interface AgentToolSpec {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
}

export interface AgentStepSpec {
  readonly id: string;
  readonly tenant_id: TenantId;
  readonly process_id: ProcessId;
  readonly step_id: string;
  readonly name: string;
  readonly description: string;
  readonly vendor_runtime: VendorRuntimeId;
  readonly model_provider: ModelProviderId;
  readonly model_id: string;
  readonly framework?: string;
  readonly system_prompt: string;
  readonly user_prompt_template?: string;
  readonly temperature?: number;
  readonly max_tokens?: number;
  readonly tools?: AgentToolSpec[];
  readonly input_schema?: Record<string, unknown>;
  readonly output_schema?: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TelemetryContract {
  readonly otlp_endpoint_hint: string;
  readonly required_attributes: readonly string[];
  readonly optional_attributes: readonly string[];
  readonly adapter_sdk_package: string;
  readonly adapter_sdk_version: string;
}

export interface AgentDefinitionExport {
  readonly format: typeof AGENT_DEFINITION_FORMAT;
  readonly format_version: typeof AGENT_DEFINITION_FORMAT_VERSION;
  readonly exported_at: string;
  readonly source_tenant_id: TenantId;
  readonly process: {
    readonly id: ProcessId;
    readonly step_id: string;
    readonly step_name: string;
  };
  readonly agent: {
    readonly name: string;
    readonly description: string;
    readonly vendor_runtime: VendorRuntimeId;
    readonly model_provider: ModelProviderId;
    readonly model_id: string;
    readonly framework?: string;
    readonly system_prompt: string;
    readonly user_prompt_template?: string;
    readonly temperature?: number;
    readonly max_tokens?: number;
    readonly tools?: AgentToolSpec[];
    readonly input_schema?: Record<string, unknown>;
    readonly output_schema?: Record<string, unknown>;
  };
  readonly telemetry_contract: TelemetryContract;
}

// Telemetry attribute contract — what AEOS expects from agent runs.
// Mirrors SpanAttributes constants in @aeos/telemetry-sdk; kept here so
// canonical-schema does not depend on telemetry-sdk.
export const AGENT_TELEMETRY_REQUIRED_ATTRIBUTES = [
  'aeos.tenant_id',
  'aeos.agent_id',
  'aeos.uop_id',
  'aeos.vendor_runtime',
  'aeos.model_provider',
  'aeos.model_id',
  'aeos.input_tokens',
  'aeos.output_tokens',
] as const;

export const AGENT_TELEMETRY_OPTIONAL_ATTRIBUTES = [
  'aeos.cost_usd',
  'aeos.hallucination_score',
  'aeos.tool_name',
  'aeos.tool_success',
  'aeos.human_override',
  'aeos.decision_id',
] as const;
