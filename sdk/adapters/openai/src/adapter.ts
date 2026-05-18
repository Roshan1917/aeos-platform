import OpenAI from 'openai';
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
// AEOS span attribute constants for OpenAI
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
// OpenAI model cost table (USD per 1M tokens — update as pricing changes)
// ---------------------------------------------------------------------------
const MODEL_COSTS_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 5.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const costs = MODEL_COSTS_PER_1M[model];
  if (!costs) return undefined;
  return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;
}

// ---------------------------------------------------------------------------
// OpenAIAdapter
// Wraps the OpenAI Chat Completions API and emits AEOS OTel spans.
// TODO: Replace stub span emission with real OTel SDK calls once @aeos/adapter-sdk
//       exposes the core emitter (sdk/packages/sdk-core/src/emitter.ts).
// ---------------------------------------------------------------------------
export class OpenAIAdapter implements AdapterContract {
  readonly config: AdapterConfig;
  private readonly client: OpenAI;

  constructor(config: AdapterConfig, openaiApiKey?: string) {
    this.config = config;
    this.client = new OpenAI({ apiKey: openaiApiKey });
  }

  // -------------------------------------------------------------------------
  // Chat Completions wrapper
  // -------------------------------------------------------------------------
  get chat() {
    return {
      completions: {
        create: async (params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming) => {
          const decisionId = crypto.randomUUID();
          const start = Date.now();

          this.onLlmCallStart({
            decisionId,
            modelId: params.model,
            modelProvider: 'openai',
          });

          const response = await this.client.chat.completions.create(params);

          const inputTokens = response.usage?.prompt_tokens;
          const outputTokens = response.usage?.completion_tokens;
          const costUsd =
            inputTokens != null && outputTokens != null
              ? estimateCost(params.model, inputTokens, outputTokens)
              : undefined;

          this.onLlmCallEnd({
            decisionId,
            outputTokens,
            costUsd,
            durationMs: Date.now() - start,
          });

          return response;
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // AdapterContract — lifecycle hooks
  // TODO: replace console stubs with actual OTel span emission via @aeos/adapter-sdk
  // -------------------------------------------------------------------------
  onLlmCallStart(params: LlmCallParams): void {
    // TODO: start OTel span "aeos.llm.call" with attributes:
    //   SpanAttributes.TENANT_ID = this.config.tenantId
    //   SpanAttributes.AGENT_ID  = this.config.agentId
    //   SpanAttributes.UOP_ID    = this.config.uopId
    //   SpanAttributes.DECISION_ID = params.decisionId
    //   SpanAttributes.MODEL_PROVIDER = 'openai'
    //   SpanAttributes.VENDOR_RUNTIME = 'openai_cloud'
    //   SpanAttributes.MODEL_ID = params.modelId
    //   SpanAttributes.INPUT_TOKENS = params.inputTokens
    console.debug('[AEOS/OpenAI] llm.call.start', {
      tenantId: this.config.tenantId,
      agentId: this.config.agentId,
      decisionId: params.decisionId,
      modelId: params.modelId,
      modelProvider: SpanAttributes.MODEL_PROVIDER,
    });
  }

  onLlmCallEnd(params: LlmCallResult): void {
    // TODO: end OTel span with:
    //   SpanAttributes.OUTPUT_TOKENS = params.outputTokens
    //   SpanAttributes.COST_USD = params.costUsd
    //   SpanAttributes.HALLUCINATION_SCORE = params.hallucinationScore
    console.debug('[AEOS/OpenAI] llm.call.end', {
      decisionId: params.decisionId,
      outputTokens: params.outputTokens,
      costUsd: params.costUsd,
      durationMs: params.durationMs,
    });
  }

  onToolCallStart(params: ToolCallParams): void {
    // TODO: start OTel span "aeos.tool.call" with SpanAttributes.TOOL_NAME
    console.debug('[AEOS/OpenAI] tool.call.start', {
      decisionId: params.decisionId,
      toolName: params.toolName,
    });
  }

  onToolCallEnd(params: ToolCallResult): void {
    // TODO: end OTel span with SpanAttributes.TOOL_SUCCESS, error if any
    console.debug('[AEOS/OpenAI] tool.call.end', {
      decisionId: params.decisionId,
      toolName: params.toolName,
      success: params.success,
      durationMs: params.durationMs,
    });
  }

  onDecisionStart(decisionId: string): void {
    // TODO: start root OTel span "aeos.decision"
    console.debug('[AEOS/OpenAI] decision.start', { decisionId });
  }

  onDecisionEnd(decisionId: string, outcome: DecisionOutcome): void {
    // TODO: end root OTel span with outcome fields
    console.debug('[AEOS/OpenAI] decision.end', { decisionId, outcome });
  }

  onHumanOverride(decisionId: string, reason: string): void {
    // TODO: emit OTel event with SpanAttributes.HUMAN_OVERRIDE = true
    console.debug('[AEOS/OpenAI] human.override', { decisionId, reason });
  }
}
