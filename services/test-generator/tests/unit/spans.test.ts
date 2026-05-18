import { describe, expect, it } from 'vitest';
import { buildSpansFromPlan, rewriteHumanStep } from '../../src/lib/spans.js';
import { testCasePlanSchema } from '../../src/lib/schema.js';

const plan = testCasePlanSchema.parse({
  title: 't',
  description: '',
  agent_hint: '',
  uop_hint: '',
  steps: [
    {
      kind: 'llm_call',
      name: 'aeos.llm.call',
      model_provider: 'anthropic',
      model_id: 'claude-sonnet-4-6',
      prompt_summary: 'do thing',
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.001,
      duration_ms: 200,
      status: 'ok',
    },
    {
      kind: 'tool_call',
      name: 'aeos.tool.call',
      tool_name: 'sap.create_quote',
      tool_args: { foo: 1 },
      tool_success: true,
      duration_ms: 100,
      status: 'ok',
    },
    {
      kind: 'human_handoff',
      name: 'aeos.human_override',
      prompt: 'approve?',
      expected_decision: 'approve',
      override_reason: '',
      duration_ms: 1000,
      status: 'ok',
    },
    {
      kind: 'agent_decision',
      name: 'aeos.decision',
      success: true,
      output_summary: 'ok',
      duration_ms: 50,
      status: 'ok',
    },
  ],
});

describe('buildSpansFromPlan', () => {
  it('produces one span per step linked into a chain', () => {
    const built = buildSpansFromPlan(plan, {
      tenantId: 'ten_1',
      agentId: 'agt_1',
      uopId: 'uop_1',
      startEpochMs: 1700000000000,
    });
    expect(built.spans).toHaveLength(4);
    expect(built.spans[0]!.parent_span_id).toBeUndefined();
    expect(built.spans[1]!.parent_span_id).toBe(built.spans[0]!.span_id);
    expect(built.spans[3]!.parent_span_id).toBe(built.spans[2]!.span_id);

    // All spans share the same trace + decision id
    expect(new Set(built.spans.map((s) => s.trace_id)).size).toBe(1);
    expect(new Set(built.spans.map((s) => s.decision_id)).size).toBe(1);
  });

  it('emits the right kind + attributes per step', () => {
    const built = buildSpansFromPlan(plan, {
      tenantId: 'ten_1',
      agentId: 'agt_1',
    });
    expect(built.spans[0]!.kind).toBe('llm_call');
    expect(built.spans[0]!.attributes['aeos.input_tokens']).toBe(100);
    expect(built.spans[1]!.attributes['aeos.tool_name']).toBe('sap.create_quote');
    expect(built.spans[2]!.attributes['aeos.human_override']).toBe(true);
    expect(built.spans[3]!.attributes['aeos.decision_success']).toBe(true);
  });
});

describe('rewriteHumanStep', () => {
  it('updates decision + override_reason without touching identifiers', () => {
    const built = buildSpansFromPlan(plan, { tenantId: 't', agentId: 'a' });
    const human = built.spans[2]!;
    const rewritten = rewriteHumanStep(human, 'reject', 'reviewer_blocked');
    expect(rewritten.span_id).toBe(human.span_id);
    expect(rewritten.attributes['aeos.human_decision']).toBe('reject');
    expect(rewritten.attributes['aeos.human_override_reason']).toBe('reviewer_blocked');
  });
});
