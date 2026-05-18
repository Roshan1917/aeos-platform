import type { Recommendation } from '../types/recommendation.js';
import type { TenantId } from '../types/tenant.js';

export const RECOMMENDATIONS_EVENTS_VERSION = '1.0' as const;

export interface RecommendationCreatedEvent {
  readonly event_type: 'recommendations.created';
  readonly schema_version: typeof RECOMMENDATIONS_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: Recommendation;
}

export interface RecommendationStatusChangedEvent {
  readonly event_type: 'recommendations.status_changed';
  readonly schema_version: typeof RECOMMENDATIONS_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: {
    readonly recommendation_id: string;
    readonly previous_status: 'open' | 'in_progress' | 'adopted' | 'dismissed';
    readonly new_status: 'open' | 'in_progress' | 'adopted' | 'dismissed';
    readonly changed_by: string;
    readonly reason?: string;
  };
}

export type RecommendationsEvent =
  | RecommendationCreatedEvent
  | RecommendationStatusChangedEvent;
