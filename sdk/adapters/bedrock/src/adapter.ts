import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  type InvokeModelCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
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
// AEOS span attribute constants for Bedrock
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
// BedrockAdapter
// Wraps BedrockRuntimeClient.InvokeModelCommand and emits AEOS OTel spans.
//
// VENDOR_RUNTIME is set to 'aws_bedrock' to distinguish from direct provider
// calls (e.g. Anthropic cloud vs Anthropic via Bedrock).
//
// TODO: Replace stub span emission with real OTel SDK calls once @aeos/adapter-sdk
//       exposes the core emitter (sdk/packages/sdk-core/src/emitter.ts).
// ---------------------------------------------------------------------------
export class BedrockAdapter implements AdapterContract {
  readonly config: AdapterConfig;
  private readonly client: BedrockRuntimeClient;

  constructor(config: AdapterConfig, region = 'us-east-1') {
    this.config = config;
    this.client = new BedrockRuntimeClient({ region });
  }

  // -------------------------------------------------------------------------
  // InvokeModel wrapper
  // Accepts the same params as InvokeModelCommand; parses usage from response
  // body if available (Anthropic and Titan models include token counts).
  // -------------------------------------------------------------------------
  async invokeModel(params: InvokeModelCommandInput): Promise<Uint8Array> {
    const decisionId = crypto.randomUUID();
    const start = Date.now();

    this.onLlmCallStart({
      decisionId,
      modelId: params.modelId ?? 'unknown',
      modelProvider: this._resolveProvider(params.modelId ?? ''),
    });

    const command = new InvokeModelCommand(params);
    const response = await this.client.send(command);

    // Attempt to parse token usage from the response body.
    // Anthropic models on Bedrock return usage in the JSON body.
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    try {
      if (response.body) {
        const body = JSON.parse(Buffer.from(response.body).toString('utf-8'));
        // Anthropic via Bedrock: body.usage.input_tokens / output_tokens
        inputTokens = body?.usage?.input_tokens;
        outputTokens = body?.usage?.output_tokens;
      }
    } catch {
      // Non-JSON body or model that doesn't expose usage — ignore
    }

    this.onLlmCallEnd({
      decisionId,
      outputTokens,
      durationMs: Date.now() - start,
    });

    return response.body ?? new Uint8Array();
  }

  // Map Bedrock model ID prefix to model provider label
  private _resolveProvider(modelId: string): string {
    if (modelId.startsWith('anthropic.')) return 'anthropic';
    if (modelId.startsWith('amazon.')) return 'amazon';
    if (modelId.startsWith('meta.')) return 'meta';
    if (modelId.startsWith('cohere.')) return 'cohere';
    if (modelId.startsWith('mistral.')) return 'mistral';
    return 'unknown';
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
    //   SpanAttributes.VENDOR_RUNTIME  = 'aws_bedrock'
    //   SpanAttributes.MODEL_PROVIDER  = params.modelProvider (resolved above)
    //   SpanAttributes.MODEL_ID        = params.modelId
    console.debug('[AEOS/Bedrock] llm.call.start', {
      tenantId: this.config.tenantId,
      agentId: this.config.agentId,
      decisionId: params.decisionId,
      modelId: params.modelId,
      vendorRuntime: 'aws_bedrock',
    });
  }

  onLlmCallEnd(params: LlmCallResult): void {
    // TODO: end OTel span with:
    //   SpanAttributes.OUTPUT_TOKENS = params.outputTokens
    //   SpanAttributes.COST_USD      = params.costUsd
    console.debug('[AEOS/Bedrock] llm.call.end', {
      decisionId: params.decisionId,
      outputTokens: params.outputTokens,
      durationMs: params.durationMs,
    });
  }

  onToolCallStart(params: ToolCallParams): void {
    // TODO: start OTel span "aeos.tool.call" with SpanAttributes.TOOL_NAME
    console.debug('[AEOS/Bedrock] tool.call.start', {
      decisionId: params.decisionId,
      toolName: params.toolName,
    });
  }

  onToolCallEnd(params: ToolCallResult): void {
    // TODO: end OTel span with SpanAttributes.TOOL_SUCCESS
    console.debug('[AEOS/Bedrock] tool.call.end', {
      decisionId: params.decisionId,
      toolName: params.toolName,
      success: params.success,
      durationMs: params.durationMs,
    });
  }

  onDecisionStart(decisionId: string): void {
    // TODO: start root OTel span "aeos.decision"
    console.debug('[AEOS/Bedrock] decision.start', { decisionId });
  }

  onDecisionEnd(decisionId: string, outcome: DecisionOutcome): void {
    // TODO: end root OTel span
    console.debug('[AEOS/Bedrock] decision.end', { decisionId, outcome });
  }

  onHumanOverride(decisionId: string, reason: string): void {
    // TODO: emit OTel event with SpanAttributes.HUMAN_OVERRIDE = true
    console.debug('[AEOS/Bedrock] human.override', { decisionId, reason });
  }
}
