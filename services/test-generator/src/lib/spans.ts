/**
 * Builds AeosSpan payloads from a TestCasePlan.
 *
 * Spans are linked into a single trace via `trace_id`, with `parent_span_id`
 * forming a linear chain in step order. A single `decision_id` ties every
 * span in a run to one logical agent-decision cycle.
 */
import crypto from 'node:crypto';
import type { TestCasePlan, TestStep } from './schema.js';

export interface SpanPayload {
  schema_version: '1.0';
  span_id: string;
  trace_id: string;
  parent_span_id?: string;
  tenant_id: string;
  agent_id: string;
  uop_id?: string;
  decision_id: string;
  name: string;
  kind: 'llm_call' | 'tool_call' | 'agent_decision' | 'human_handoff' | 'internal';
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: string; attributes?: Record<string, string | number | boolean> }>;
}

export interface BuildContext {
  tenantId: string;
  agentId: string;
  uopId?: string;
  startEpochMs?: number;
}

export interface BuildResult {
  traceId: string;
  decisionId: string;
  spans: SpanPayload[];
}

function shortHex(bytes = 8): string {
  return crypto.randomBytes(bytes).toString('hex');
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function buildSpansFromPlan(plan: TestCasePlan, ctx: BuildContext): BuildResult {
  const traceId = crypto.randomUUID().replace(/-/g, '');
  const decisionId = crypto.randomUUID();
  let cursor = ctx.startEpochMs ?? Date.now();
  const spans: SpanPayload[] = [];
  let parent: string | undefined;

  for (const step of plan.steps) {
    const spanId = shortHex(8);
    const start = cursor;
    const end = cursor + step.duration_ms;
    cursor = end + 5;

    spans.push(buildSpan(step, { ctx, traceId, decisionId, spanId, parent, start, end }));
    parent = spanId;
  }

  return { traceId, decisionId, spans };
}

interface BuildOne {
  ctx: BuildContext;
  traceId: string;
  decisionId: string;
  spanId: string;
  parent?: string;
  start: number;
  end: number;
}

function buildSpan(step: TestStep, b: BuildOne): SpanPayload {
  const base = {
    schema_version: '1.0' as const,
    span_id: b.spanId,
    trace_id: b.traceId,
    parent_span_id: b.parent,
    tenant_id: b.ctx.tenantId,
    agent_id: b.ctx.agentId,
    uop_id: b.ctx.uopId,
    decision_id: b.decisionId,
    name: step.name,
    start_time: iso(b.start),
    end_time: iso(b.end),
    duration_ms: b.end - b.start,
    status: step.status,
    events: [],
  };

  switch (step.kind) {
    case 'llm_call':
      return {
        ...base,
        kind: 'llm_call',
        attributes: {
          'aeos.model_provider': step.model_provider,
          'aeos.model_id': step.model_id,
          'aeos.input_tokens': step.input_tokens,
          'aeos.output_tokens': step.output_tokens,
          'aeos.cost_usd': step.cost_usd,
          'aeos.prompt_summary': step.prompt_summary,
        },
      };
    case 'tool_call':
      return {
        ...base,
        kind: 'tool_call',
        attributes: {
          'aeos.tool_name': step.tool_name,
          'aeos.tool_success': step.tool_success,
          ...(step.tool_error ? { 'aeos.tool_error': step.tool_error } : {}),
        },
      };
    case 'human_handoff': {
      const approved = step.expected_decision === 'approve';
      return {
        ...base,
        kind: 'human_handoff',
        attributes: {
          'aeos.human_override': true,
          'aeos.human_override_reason':
            step.override_reason || (approved ? 'human_approved' : 'human_rejected'),
          'aeos.human_decision': step.expected_decision,
          'aeos.human_prompt': step.prompt,
        },
      };
    }
    case 'agent_decision':
      return {
        ...base,
        kind: 'agent_decision',
        attributes: {
          'aeos.decision_success': step.success,
          'aeos.decision_output_summary': step.output_summary,
        },
      };
  }
}

/**
 * For interactive human mode: rebuild a single human_handoff span using the
 * runtime decision the user picked rather than the plan's expected_decision.
 */
export function rewriteHumanStep(
  span: SpanPayload,
  decision: 'approve' | 'reject',
  reason: string,
): SpanPayload {
  return {
    ...span,
    attributes: {
      ...span.attributes,
      'aeos.human_decision': decision,
      'aeos.human_override': true,
      'aeos.human_override_reason': reason,
    },
  };
}
