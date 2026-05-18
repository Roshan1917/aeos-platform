import { api } from '../api';

export type RecommendationStatus = 'open' | 'in_progress' | 'adopted' | 'dismissed';
export type RecommendationCategory =
  | 'prompt_improvement'
  | 'routing_change'
  | 'tool_configuration'
  | 'human_oversight_adjustment'
  | 'model_swap'
  | 'cost_optimization'
  | 'compliance_remediation';
export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface Recommendation {
  id: string;
  tenant_id: string;
  uop_id: string;
  agent_id: string | null;
  template_id: string;
  title: string;
  description: string;
  category: RecommendationCategory;
  priority: Priority;
  estimated_impact_value: number | null;
  estimated_impact_currency: string | null;
  status: RecommendationStatus;
  evidence_row_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface RecommendationListFilters {
  status?: RecommendationStatus;
  uop_id?: string;
  agent_id?: string;
  category?: RecommendationCategory;
  priority?: Priority;
  limit?: number;
  offset?: number;
}

export interface RecommendationListResponse {
  recommendations: Recommendation[];
  limit: number;
  offset: number;
}

export async function listRecommendations(
  filters: RecommendationListFilters = {},
): Promise<RecommendationListResponse> {
  return api<RecommendationListResponse>('recommendations', '/v1/recommendations', {
    query: filters as Record<string, string | number | undefined | null>,
  });
}

export async function getRecommendation(id: string): Promise<Recommendation> {
  return api<Recommendation>('recommendations', `/v1/recommendations/${id}`);
}

export interface StatusUpdateResponse {
  id: string;
  previous_status: RecommendationStatus;
  status: RecommendationStatus;
}

export async function updateStatus(
  id: string,
  status: RecommendationStatus,
  reason?: string,
): Promise<StatusUpdateResponse> {
  return api<StatusUpdateResponse>('recommendations', `/v1/recommendations/${id}`, {
    method: 'PATCH',
    body: reason ? { status, reason } : { status },
  });
}
