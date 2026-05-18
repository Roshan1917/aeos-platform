import type { AgentId } from './agent.js';
import type { TenantId } from './tenant.js';
import type { UoPId } from './uop.js';

export type RecommendationId = string & { readonly _brand: 'RecommendationId' };

export interface Recommendation {
  readonly id: RecommendationId;
  readonly tenant_id: TenantId;
  readonly uop_id: UoPId;
  readonly agent_id?: AgentId;
  readonly template_id: string;
  readonly title: string;
  readonly description: string;
  readonly category: RecommendationCategory;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly estimated_impact_value?: number;
  readonly estimated_impact_currency?: string;
  readonly status: 'open' | 'in_progress' | 'adopted' | 'dismissed';
  readonly evidence_row_ids: string[];
  readonly created_at: string;
  readonly updated_at: string;
}

export type RecommendationCategory =
  | 'prompt_improvement'
  | 'routing_change'
  | 'tool_configuration'
  | 'human_oversight_adjustment'
  | 'model_swap'
  | 'cost_optimization'
  | 'compliance_remediation';
