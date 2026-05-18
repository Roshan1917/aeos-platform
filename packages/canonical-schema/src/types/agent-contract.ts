// PATENT-ADJACENT: Agent Contract — Patent Family 1
// Do NOT add or rename fields without CTO approval (danny.goldstein@fuzebox.ai)

import type { AgentId } from './agent.js';
import type { TenantId } from './tenant.js';
import type { UoPId } from './uop.js';

export const AGENT_CONTRACT_SCHEMA_VERSION = '1.0' as const;

export type AgentContractId = string & { readonly _brand: 'AgentContractId' };

export interface AgentContract {
  readonly schema_version: typeof AGENT_CONTRACT_SCHEMA_VERSION;
  readonly id: AgentContractId;
  readonly tenant_id: TenantId;
  readonly agent_id: AgentId;
  readonly uop_id: UoPId;
  readonly target_value: number;
  readonly target_currency?: string;
  readonly scoring_weights: UefWeights;
  readonly effective_from: string;
  readonly effective_until?: string;
  readonly status: 'active' | 'superseded' | 'terminated';
  readonly created_by: string;
  readonly created_at: string;
}

export interface UefWeights {
  readonly task_completion: number;
  readonly decision_quality: number;
  readonly resource_efficiency: number;
  readonly compliance_adherence: number;
  readonly human_oversight_ratio: number;
  readonly error_recovery: number;
  readonly knowledge_utilization: number;
  readonly coordination_effectiveness: number;
}
