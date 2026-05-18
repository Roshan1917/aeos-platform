import { api } from '../api';

export type SpanKind = 'llm_call' | 'tool_call' | 'agent_decision' | 'human_handoff' | 'internal';
export type SpanStatus = 'ok' | 'error' | 'unset';

export interface SpanRow {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  agent_id: string;
  uop_id: string | null;
  process_id: string | null;
  decision_id: string | null;
  name: string;
  kind: SpanKind;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: SpanStatus;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: string; attributes?: Record<string, unknown> }>;
  enrichment_version: string;
  ingested_at: string;
}

export interface SpanListResponse {
  spans: SpanRow[];
  limit: number;
  offset: number;
}

export interface SpanListFilters {
  agent_id?: string;
  uop_id?: string;
  kind?: SpanKind;
  start_after?: string;
  end_before?: string;
  limit?: number;
  offset?: number;
}

export async function listSpans(filters: SpanListFilters = {}): Promise<SpanListResponse> {
  return api<SpanListResponse>('telemetry', '/v1/spans', {
    query: filters as Record<string, string | number | undefined | null>,
  });
}

export async function getSpan(spanId: string): Promise<SpanRow> {
  return api<SpanRow>('telemetry', `/v1/spans/${spanId}`);
}

export interface TraceResponse {
  trace_id: string;
  spans: SpanRow[];
}

export async function getTrace(traceId: string): Promise<TraceResponse> {
  return api<TraceResponse>('telemetry', `/v1/traces/${traceId}`);
}
