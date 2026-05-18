import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { AdapterConfig, LlmCallParams, LlmCallResult, ToolCallParams, ToolCallResult, DecisionOutcome } from './contract.js';

// ---------------------------------------------------------------------------
// SDK version — used as the tracer instrumentation scope version
// ---------------------------------------------------------------------------
const SDK_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// AEOS OTel span attribute keys — canonical list for all adapters
// ---------------------------------------------------------------------------
const SpanAttributes = {
  TENANT_ID: 'aeos.tenant_id',
  AGENT_ID: 'aeos.agent_id',
  UOP_ID: 'aeos.uop_id',
  DECISION_ID: 'aeos.decision_id',
  VENDOR_RUNTIME: 'aeos.vendor_runtime',
  MODEL_PROVIDER: 'aeos.model_provider',
  MODEL_ID: 'aeos.model_id',
  INPUT_TOKENS: 'aeos.input_tokens',
  OUTPUT_TOKENS: 'aeos.output_tokens',
  COST_USD: 'aeos.cost_usd',
  HALLUCINATION_SCORE: 'aeos.hallucination_score',
  TOOL_NAME: 'aeos.tool_name',
  TOOL_SUCCESS: 'aeos.tool_success',
  TOOL_ERROR: 'aeos.tool_error',
  HUMAN_OVERRIDE: 'aeos.human_override',
  HUMAN_OVERRIDE_REASON: 'aeos.human_override_reason',
  DECISION_SUCCESS: 'aeos.decision_success',
  DECISION_OUTPUT_SUMMARY: 'aeos.decision_output_summary',
} as const;

// ---------------------------------------------------------------------------
// AdapterEmitter interface — returned by createAdapterEmitter
// ---------------------------------------------------------------------------
export interface AdapterEmitter {
  emitLlmCall(params: LlmCallParams, result: LlmCallResult): void;
  emitToolCall(params: ToolCallParams, result: ToolCallResult): void;
  emitDecision(id: string, outcome: DecisionOutcome): void;
  emitHumanOverride(id: string, reason: string): void;
}

// ---------------------------------------------------------------------------
// createAdapterEmitter
//
// Factory that returns an AdapterEmitter bound to the provided AdapterConfig.
// Uses @opentelemetry/api only — the host application is responsible for
// registering an OTel provider (SDK, Collector exporter, etc.).
//
// Each emit method creates a span, sets attributes, and immediately ends it.
// The spans are self-contained snapshots rather than in-flight spans because
// adapters receive completed call data after the fact.
// ---------------------------------------------------------------------------
export function createAdapterEmitter(config: AdapterConfig): AdapterEmitter {
  const tracer = trace.getTracer('aeos.adapter-sdk', SDK_VERSION);

  return {
    // -----------------------------------------------------------------------
    // emitLlmCall — records a completed LLM call as an OTel span
    // -----------------------------------------------------------------------
    emitLlmCall(params: LlmCallParams, result: LlmCallResult): void {
      const span = tracer.startSpan('aeos.llm.call');

      // Identity attributes
      span.setAttribute(SpanAttributes.TENANT_ID, config.tenantId);
      span.setAttribute(SpanAttributes.AGENT_ID, config.agentId);
      if (config.uopId !== undefined) {
        span.setAttribute(SpanAttributes.UOP_ID, config.uopId);
      }

      // Decision / model attributes
      span.setAttribute(SpanAttributes.DECISION_ID, params.decisionId);
      span.setAttribute(SpanAttributes.MODEL_ID, params.modelId);
      span.setAttribute(SpanAttributes.MODEL_PROVIDER, params.modelProvider);

      // Token counts
      if (params.inputTokens !== undefined) {
        span.setAttribute(SpanAttributes.INPUT_TOKENS, params.inputTokens);
      }
      if (result.outputTokens !== undefined) {
        span.setAttribute(SpanAttributes.OUTPUT_TOKENS, result.outputTokens);
      }

      // Cost
      if (result.costUsd !== undefined) {
        span.setAttribute(SpanAttributes.COST_USD, result.costUsd);
      }

      // Quality signals
      if (result.hallucinationScore !== undefined) {
        span.setAttribute(SpanAttributes.HALLUCINATION_SCORE, result.hallucinationScore);
      }

      span.end();
    },

    // -----------------------------------------------------------------------
    // emitToolCall — records a completed tool call as an OTel span
    // -----------------------------------------------------------------------
    emitToolCall(params: ToolCallParams, result: ToolCallResult): void {
      const span = tracer.startSpan('aeos.tool.call');

      span.setAttribute(SpanAttributes.TENANT_ID, config.tenantId);
      span.setAttribute(SpanAttributes.AGENT_ID, config.agentId);
      if (config.uopId !== undefined) {
        span.setAttribute(SpanAttributes.UOP_ID, config.uopId);
      }

      span.setAttribute(SpanAttributes.DECISION_ID, params.decisionId);
      span.setAttribute(SpanAttributes.TOOL_NAME, params.toolName);
      span.setAttribute(SpanAttributes.TOOL_SUCCESS, result.success);

      if (!result.success && result.error !== undefined) {
        span.setAttribute(SpanAttributes.TOOL_ERROR, result.error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: result.error });
      }

      span.end();
    },

    // -----------------------------------------------------------------------
    // emitDecision — records a completed agent decision cycle as an OTel span
    // -----------------------------------------------------------------------
    emitDecision(id: string, outcome: DecisionOutcome): void {
      const span = tracer.startSpan('aeos.decision');

      span.setAttribute(SpanAttributes.TENANT_ID, config.tenantId);
      span.setAttribute(SpanAttributes.AGENT_ID, config.agentId);
      if (config.uopId !== undefined) {
        span.setAttribute(SpanAttributes.UOP_ID, config.uopId);
      }

      span.setAttribute(SpanAttributes.DECISION_ID, id);
      span.setAttribute(SpanAttributes.DECISION_SUCCESS, outcome.success);

      if (outcome.outputSummary !== undefined) {
        span.setAttribute(SpanAttributes.DECISION_OUTPUT_SUMMARY, outcome.outputSummary);
      }

      if (!outcome.success) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }

      span.end();
    },

    // -----------------------------------------------------------------------
    // emitHumanOverride — records a human-override event as an OTel span
    // -----------------------------------------------------------------------
    emitHumanOverride(id: string, reason: string): void {
      const span = tracer.startSpan('aeos.human_override');

      span.setAttribute(SpanAttributes.TENANT_ID, config.tenantId);
      span.setAttribute(SpanAttributes.AGENT_ID, config.agentId);
      if (config.uopId !== undefined) {
        span.setAttribute(SpanAttributes.UOP_ID, config.uopId);
      }

      span.setAttribute(SpanAttributes.DECISION_ID, id);
      span.setAttribute(SpanAttributes.HUMAN_OVERRIDE, true);
      span.setAttribute(SpanAttributes.HUMAN_OVERRIDE_REASON, reason);

      span.end();
    },
  };
}
