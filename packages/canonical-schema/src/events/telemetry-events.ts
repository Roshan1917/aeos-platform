import type { AeosSpan } from '../types/span.js';
import type { TenantId } from '../types/tenant.js';

export const TELEMETRY_EVENTS_VERSION = '1.0' as const;

export interface TelemetrySpanReceivedEvent {
  readonly event_type: 'telemetry.span.received';
  readonly schema_version: typeof TELEMETRY_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: AeosSpan;
}

export interface TelemetrySpanEnrichedEvent {
  readonly event_type: 'telemetry.span.enriched';
  readonly schema_version: typeof TELEMETRY_EVENTS_VERSION;
  readonly event_id: string;
  readonly tenant_id: TenantId;
  readonly timestamp: string;
  readonly payload: AeosSpan & {
    readonly uop_id: string;
    readonly process_id: string;
    readonly enrichment_version: string;
  };
}

export type TelemetryEvent = TelemetrySpanReceivedEvent | TelemetrySpanEnrichedEvent;
