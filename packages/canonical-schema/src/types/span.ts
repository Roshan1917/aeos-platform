import type { AgentId } from './agent.js';
import type { TenantId } from './tenant.js';
import type { UoPId } from './uop.js';

export const SPAN_SCHEMA_VERSION = '1.0' as const;

export type SpanId = string & { readonly _brand: 'SpanId' };
export type DecisionId = string & { readonly _brand: 'DecisionId' };
export type TraceId = string & { readonly _brand: 'TraceId' };

export interface AeosSpan {
  readonly schema_version: typeof SPAN_SCHEMA_VERSION;
  readonly span_id: SpanId;
  readonly trace_id: TraceId;
  readonly parent_span_id?: SpanId;
  readonly tenant_id: TenantId;
  readonly agent_id: AgentId;
  readonly uop_id?: UoPId;
  readonly decision_id?: DecisionId;
  readonly name: string;
  readonly kind: SpanKind;
  readonly start_time: string;
  readonly end_time: string;
  readonly duration_ms: number;
  readonly status: SpanStatus;
  readonly attributes: SpanAttributes;
  readonly events: SpanEvent[];
}

export type SpanKind = 'llm_call' | 'tool_call' | 'agent_decision' | 'human_handoff' | 'internal';

export type SpanStatus = 'ok' | 'error' | 'unset';

export interface SpanAttributes {
  readonly 'aeos.vendor_runtime'?: string;
  readonly 'aeos.model_provider'?: string;
  readonly 'aeos.model_id'?: string;
  readonly 'aeos.input_tokens'?: number;
  readonly 'aeos.output_tokens'?: number;
  readonly 'aeos.cost_usd'?: number;
  readonly 'aeos.hallucination_score'?: number;
  readonly 'aeos.tool_name'?: string;
  readonly 'aeos.tool_success'?: boolean;
  readonly 'aeos.human_override'?: boolean;
  readonly [key: string]: string | number | boolean | undefined;
}

export interface SpanEvent {
  readonly name: string;
  readonly timestamp: string;
  readonly attributes?: Record<string, string | number | boolean>;
}
