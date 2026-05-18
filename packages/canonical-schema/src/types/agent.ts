// PATENT-ADJACENT: Agent Identity — Patent Family 1
// Do NOT add or rename fields without CTO approval (danny.goldstein@fuzebox.ai)

import type { TenantId } from './tenant.js';

export const AGENT_SCHEMA_VERSION = '1.0' as const;

export type AgentId = string & { readonly _brand: 'AgentId' };

export function agentId(id: string): AgentId {
  return id as AgentId;
}

export interface Agent {
  readonly schema_version: typeof AGENT_SCHEMA_VERSION;
  readonly id: AgentId;
  readonly tenant_id: TenantId;
  readonly name: string;
  readonly description: string;
  readonly vendor_runtime: VendorRuntime;
  readonly model_provider: ModelProvider;
  readonly model_id: string;
  readonly framework?: AgentFramework;
  readonly adapter_sdk_version?: string;
  readonly status: 'active' | 'deprecated' | 'suspended';
  readonly created_at: string;
  readonly updated_at: string;
}

export type VendorRuntime =
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

export type ModelProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'meta'
  | 'mistral'
  | 'cohere'
  | 'amazon'
  | 'custom';

export type AgentFramework =
  | 'langgraph'
  | 'crewai'
  | 'autogen'
  | 'semantic_kernel'
  | 'llamaindex'
  | 'dspy'
  | 'custom';
