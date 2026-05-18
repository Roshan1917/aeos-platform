/**
 * Drives a TestCasePlan to completion, emitting spans into the AEOS telemetry
 * pipeline. Streams progress events into the run's EventEmitter so SSE clients
 * (e.g. the web UI) can follow along and supply human approvals on demand.
 *
 * Two modes:
 *   - synthetic: every span is fabricated from the plan's declared values.
 *   - live: llm_call steps are executed against the real Anthropic API, so
 *     the resulting span carries genuine token counts / cost / duration.
 *     Tool, human, and decision steps stay synthetic in both modes — there
 *     is no real tool runtime or real human in the loop here.
 *
 * Human steps:
 *   - auto: emit straight from the plan's expected_decision.
 *   - interactive: emit a `human_step_pending` event and block on a UI reply
 *     before continuing.
 */
import { buildSpansFromPlan, rewriteHumanStep, type SpanPayload } from '../lib/spans.js';
import { callClaude } from '../lib/anthropic.js';
import type { TestCasePlan } from '../lib/schema.js';
import { listFirstAgentId, listFirstUoPId } from '../lib/substrate.js';
import { postSpans } from './telemetry.js';
import {
  awaitHumanDecision,
  emitEvent,
  type RunState,
} from './runs.js';

export interface ExecuteOptions {
  mode: 'synthetic' | 'live';
  humanMode: 'auto' | 'interactive';
  /** Caller's substrate JWT — used for substrate registry lookups + minting an
   *  ingest token if none is cached yet for this tenant. */
  token: string;
  tenantId: string;
  userId: string;
  roles: string[];
}

export async function executeTestCase(
  run: RunState,
  plan: TestCasePlan,
  opts: ExecuteOptions,
): Promise<void> {
  try {
    const agentId = await listFirstAgentId(opts.token, opts.tenantId);
    const uopId = await listFirstUoPId(opts.token, opts.tenantId);
    if (!agentId) {
      throw new Error('No agent registered for this tenant — run seed-registries.ts first');
    }

    const built = buildSpansFromPlan(plan, {
      tenantId: opts.tenantId,
      agentId,
      uopId: uopId ?? undefined,
    });

    emitEvent(run, {
      type: 'run_started',
      run_id: run.id,
      trace_id: built.traceId,
      total_steps: plan.steps.length,
    });

    const finalSpans: SpanPayload[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]!;
      const span = built.spans[i]!;

      emitEvent(run, {
        type: 'step_started',
        step_index: i,
        kind: step.kind,
        name: step.name,
      });

      // ── Live mode: re-run llm_call against the real Anthropic API ─────────
      if (opts.mode === 'live' && step.kind === 'llm_call') {
        const outcome = await callClaude(
          'You are a generic assistant. Answer briefly.',
          step.prompt_summary || 'Say hello in one short sentence.',
          { maxTokens: 200 },
        );
        // Patch the span with measured values
        span.attributes = {
          ...span.attributes,
          'aeos.input_tokens': outcome.inputTokens,
          'aeos.output_tokens': outcome.outputTokens,
          'aeos.cost_usd': outcome.costUsd,
          'aeos.live_executed': true,
        };
        const newEnd = new Date(span.start_time).getTime() + outcome.durationMs;
        span.end_time = new Date(newEnd).toISOString();
        span.duration_ms = outcome.durationMs;
      }

      // ── Interactive human handoff: block until UI replies ─────────────────
      let finalSpan = span;
      if (step.kind === 'human_handoff' && opts.humanMode === 'interactive') {
        emitEvent(run, {
          type: 'human_step_pending',
          step_index: i,
          prompt: step.prompt,
          expected: step.expected_decision,
        });
        const reply = await awaitHumanDecision(run, i);
        finalSpan = rewriteHumanStep(
          span,
          reply.decision,
          reply.reason ?? `human_${reply.decision === 'approve' ? 'approved' : 'rejected'}`,
        );
      }

      finalSpans.push(finalSpan);
      emitEvent(run, { type: 'step_completed', step_index: i, span: finalSpan });
    }

    // POST in a single batch so the trace lands atomically.
    await postSpans(
      {
        tenantId: opts.tenantId,
        userId: opts.userId,
        roles: opts.roles,
        jwt: opts.token,
      },
      finalSpans,
    );

    emitEvent(run, {
      type: 'run_completed',
      run_id: run.id,
      trace_id: built.traceId,
      spans_emitted: finalSpans.length,
    });
  } catch (err) {
    emitEvent(run, {
      type: 'run_failed',
      run_id: run.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
