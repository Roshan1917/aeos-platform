// PATENT-ADJACENT: Boundary Controls — Patent Family 3
// Do NOT add or rename fields without CTO approval (danny.goldstein@fuzebox.ai)

import type { AgentId } from './agent.js';
import type { TenantId } from './tenant.js';

export const BOUNDARY_SCHEMA_VERSION = '1.0' as const;

export type BoundaryId = string & { readonly _brand: 'BoundaryId' };

export interface Boundary {
  readonly schema_version: typeof BOUNDARY_SCHEMA_VERSION;
  readonly id: BoundaryId;
  readonly tenant_id: TenantId;
  readonly agent_id: AgentId;
  readonly boundary_type: BoundaryType;
  readonly scope: BoundaryScope;
  readonly definition: BoundaryDefinition;
  readonly enforcement_mode: 'observe' | 'alert' | 'block';
  readonly status: 'active' | 'suspended';
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export type BoundaryType =
  | 'data_access'
  | 'tool_invocation'
  | 'cost_ceiling'
  | 'decision_authority'
  | 'compliance_constraint'
  | 'human_escalation_trigger';

export type BoundaryScope = 'agent' | 'process' | 'uop' | 'tenant';

export interface BoundaryDefinition {
  readonly condition: string;
  readonly threshold?: number;
  readonly threshold_unit?: string;
  readonly allowed_tools?: string[];
  readonly denied_tools?: string[];
  readonly allowed_data_classes?: string[];
  readonly denied_data_classes?: string[];
}
