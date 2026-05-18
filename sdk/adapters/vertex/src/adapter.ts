import { VertexAI, type GenerateContentRequest, type GenerateContentResult } from '@google-cloud/vertexai';
import type {
  AdapterConfig,
  AdapterContract,
  LlmCallParams,
  LlmCallResult,
  ToolCallParams,
  ToolCallResult,
  DecisionOutcome,
} from '@aeos/adapter-sdk';

// ---------------------------------------------------------------------------
// AEOS span attribute constants for Vertex AI
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
  TOOL_NAME: 'aeos.tool_name',
  TOOL_SUCCESS: 'aeos.tool_success',
  HUMAN_OVERRIDE: 'aeos.human_override',
} as const;

// ---------------------------------------------------------------------------
// Gemini model cost table (USD per 1M tokens — update as pricing changes)
// Prices as of early 2025.
// ---------------------------------------------------------------------------
const MODEL_COSTS_PER_1M: Record<string, { input: number; output: number }> = {
  'gemini-1.5-pro': { input: 3.5, output: 10.5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const costs = MODEL_COSTS_PER_1M[model];
  if (!costs) return undefined;
  return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;
}

// ---------------------------------------------------------------------------
// VertexAdapter
// Wraps Google's Vertex AI GenerativeModel.generateContent() and emits AEOS
// OTel spans.
//
// VENDOR_RUNTIME is set to 'google_vertex' to distinguish from direct Gemini
// API calls.
//
// TODO: Replace stub span emission with real OTel SDK calls once @aeos/adapter-sdk
//       exposes the core emitter (sdk/packages/sdk-core/src/emitter.ts).
// ---------------------------------------------------------------------------
export class VertexAdapter implements AdapterContract {
  readonly config: AdapterConfig;
  private readonly vertexAI: VertexAI;

  constructor(
    config: AdapterConfig,
    options: { project: string; location?: string },
  ) {
    this.config = config;
    this.vertexAI = new VertexAI({
      project: options.project,
      location: options.location ?? 'us-central1',
    });
  }

  // -------------------------------------------------------------------------
  // generateContent wrapper
  // Accepts a model name + request and delegates to Vertex AI.
  // -------------------------------------------------------------------------
  async generateContent(
    modelId: string,
    request: GenerateContentRequest,
  ): Promise<GenerateContentResult> {
    const decisionId = crypto.randomUUID();
    const start = Date.now();

    this.onLlmCallStart({
      decisionId,
      modelId,
      modelProvider: 'google',
    });

    const model = this.vertexAI.getGenerativeModel({ model: modelId });
    const result = await model.generateContent(request);

    const inputTokens = result.response.usageMetadata?.promptTokenCount;
    const outputTokens = result.response.usageMetadata?.candidatesTokenCount;
    const costUsd =
      inputTokens != null && outputTokens != null
        ? estimateCost(modelId, inputTokens, outputTokens)
        : undefined;

    this.onLlmCallEnd({
      decisionId,
      outputTokens,
      costUsd,
      durationMs: Date.now() - start,
    });

    return result;
  }

  // -------------------------------------------------------------------------
  // AdapterContract — lifecycle hooks
  // TODO: replace console stubs with actual OTel span emission via @aeos/adapter-sdk
  // -------------------------------------------------------------------------
  onLlmCallStart(params: LlmCallParams): void {
    // TODO: start OTel span "aeos.llm.call" with attributes:
    //   SpanAttributes.TENANT_ID       = this.config.tenantId
    //   SpanAttributes.AGENT_ID        = this.config.agentId
    //   SpanAttributes.UOP_ID          = this.config.uopId
    //   SpanAttributes.DECISION_ID     = params.decisionId
    //   SpanAttributes.VENDOR_RUNTIME  = 'google_vertex'
    //   SpanAttributes.MODEL_PROVIDER  = 'google'
    //   SpanAttributes.MODEL_ID        = params.modelId
    //   SpanAttributes.INPUT_TOKENS    = params.inputTokens
    console.debug('[AEOS/Vertex] llm.call.start', {
      tenantId: this.config.tenantId,
      agentId: this.config.agentId,
      decisionId: params.decisionId,
      modelId: params.modelId,
      vendorRuntime: 'google_vertex',
    });
  }

  onLlmCallEnd(params: LlmCallResult): void {
    // TODO: end OTel span with:
    //   SpanAttributes.OUTPUT_TOKENS = params.outputTokens
    //   SpanAttributes.COST_USD      = params.costUsd
    console.debug('[AEOS/Vertex] llm.call.end', {
      decisionId: params.decisionId,
      outputTokens: params.outputTokens,
      costUsd: params.costUsd,
      durationMs: params.durationMs,
    });
  }

  onToolCallStart(params: ToolCallParams): void {
    // TODO: start OTel span "aeos.tool.call" with SpanAttributes.TOOL_NAME
    console.debug('[AEOS/Vertex] tool.call.start', {
      decisionId: params.decisionId,
      toolName: params.toolName,
    });
  }

  onToolCallEnd(params: ToolCallResult): void {
    // TODO: end OTel span with SpanAttributes.TOOL_SUCCESS, error if any
    console.debug('[AEOS/Vertex] tool.call.end', {
      decisionId: params.decisionId,
      toolName: params.toolName,
      success: params.success,
      durationMs: params.durationMs,
    });
  }

  onDecisionStart(decisionId: string): void {
    // TODO: start root OTel span "aeos.decision"
    console.debug('[AEOS/Vertex] decision.start', { decisionId });
  }

  onDecisionEnd(decisionId: string, outcome: DecisionOutcome): void {
    // TODO: end root OTel span with outcome fields
    console.debug('[AEOS/Vertex] decision.end', { decisionId, outcome });
  }

  onHumanOverride(decisionId: string, reason: string): void {
    // TODO: emit OTel event with SpanAttributes.HUMAN_OVERRIDE = true
    console.debug('[AEOS/Vertex] human.override', { decisionId, reason });
  }
}
