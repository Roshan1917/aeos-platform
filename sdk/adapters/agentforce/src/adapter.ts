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
// AEOS span attribute constants for Agentforce
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
// Agentforce API types
// REST endpoint: POST /services/data/v60.0/einstein/ai-assist
// ---------------------------------------------------------------------------

/** Request payload for the Agentforce AI Assist endpoint */
export interface AgentforceRequest {
  /** Natural language prompt / query for the agent */
  readonly prompt: string;
  /** Optional model override — defaults to Agentforce default */
  readonly modelId?: string;
  /** Arbitrary context fields passed to the agent */
  readonly context?: Record<string, unknown>;
}

/** Response shape returned by the Agentforce AI Assist endpoint */
export interface AgentforceResponse {
  readonly responseId: string;
  readonly output: string;
  /** Token usage if available — Agentforce may or may not expose this */
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
}

// ---------------------------------------------------------------------------
// AgentforceAdapter
//
// Wraps the Salesforce Agentforce REST API and emits AEOS OTel spans.
//
// Auth: OAuth 2.0 bearer token passed in the constructor. The caller is
// responsible for obtaining and refreshing the token via Salesforce OAuth.
//
// NOTE: The actual API call is stubbed with a mock response because the
// Agentforce AI-Assist endpoint is enterprise-gated and requires a live
// Salesforce org. The stub follows the documented API contract.
//
// TODO: Replace stub span emission with real OTel SDK calls once @aeos/adapter-sdk
//       exposes the core emitter (sdk/packages/sdk-core/src/emitter.ts).
// ---------------------------------------------------------------------------
export class AgentforceAdapter implements AdapterContract {
  readonly config: AdapterConfig;
  private readonly instanceUrl: string;
  private readonly bearerToken: string;

  /**
   * @param config       AEOS adapter config
   * @param instanceUrl  Salesforce instance URL (e.g. https://myorg.my.salesforce.com)
   * @param bearerToken  OAuth 2.0 bearer token obtained from Salesforce token endpoint
   */
  constructor(config: AdapterConfig, instanceUrl: string, bearerToken: string) {
    this.config = config;
    this.instanceUrl = instanceUrl;
    this.bearerToken = bearerToken;
  }

  // -------------------------------------------------------------------------
  // aiAssist — wraps POST /services/data/v60.0/einstein/ai-assist
  //
  // NOTE: The HTTP call is stubbed. In production, uncomment the fetch call
  //       and remove the mock response block.
  // -------------------------------------------------------------------------
  async aiAssist(request: AgentforceRequest): Promise<AgentforceResponse> {
    const decisionId = crypto.randomUUID();
    const start = Date.now();
    const modelId = request.modelId ?? 'agentforce-default';

    this.onLlmCallStart({
      decisionId,
      modelId,
      modelProvider: 'salesforce',
    });

    // -----------------------------------------------------------------------
    // STUB: Agentforce API is enterprise-gated.
    // Production implementation:
    //
    //   const url = `${this.instanceUrl}/services/data/v60.0/einstein/ai-assist`;
    //   const httpResponse = await fetch(url, {
    //     method: 'POST',
    //     headers: {
    //       'Authorization': `Bearer ${this.bearerToken}`,
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({
    //       prompt: request.prompt,
    //       modelId: request.modelId,
    //       context: request.context,
    //     }),
    //   });
    //   if (!httpResponse.ok) {
    //     throw new Error(`Agentforce API error: ${httpResponse.status} ${httpResponse.statusText}`);
    //   }
    //   const response = await httpResponse.json() as AgentforceResponse;
    //
    // -----------------------------------------------------------------------
    const response: AgentforceResponse = {
      responseId: crypto.randomUUID(),
      output: `[STUB] Agentforce response for: ${request.prompt}`,
      usage: {
        inputTokens: undefined,
        outputTokens: undefined,
      },
    };

    this.onLlmCallEnd({
      decisionId,
      outputTokens: response.usage?.outputTokens,
      durationMs: Date.now() - start,
    });

    return response;
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
    //   SpanAttributes.VENDOR_RUNTIME  = 'salesforce_agentforce'
    //   SpanAttributes.MODEL_PROVIDER  = 'salesforce'
    //   SpanAttributes.MODEL_ID        = params.modelId
    console.debug('[AEOS/Agentforce] llm.call.start', {
      tenantId: this.config.tenantId,
      agentId: this.config.agentId,
      decisionId: params.decisionId,
      modelId: params.modelId,
      vendorRuntime: 'salesforce_agentforce',
    });
  }

  onLlmCallEnd(params: LlmCallResult): void {
    // TODO: end OTel span with:
    //   SpanAttributes.OUTPUT_TOKENS = params.outputTokens
    //   SpanAttributes.COST_USD      = params.costUsd
    console.debug('[AEOS/Agentforce] llm.call.end', {
      decisionId: params.decisionId,
      outputTokens: params.outputTokens,
      durationMs: params.durationMs,
    });
  }

  onToolCallStart(params: ToolCallParams): void {
    // TODO: start OTel span "aeos.tool.call" with SpanAttributes.TOOL_NAME
    console.debug('[AEOS/Agentforce] tool.call.start', {
      decisionId: params.decisionId,
      toolName: params.toolName,
    });
  }

  onToolCallEnd(params: ToolCallResult): void {
    // TODO: end OTel span with SpanAttributes.TOOL_SUCCESS, error if any
    console.debug('[AEOS/Agentforce] tool.call.end', {
      decisionId: params.decisionId,
      toolName: params.toolName,
      success: params.success,
      durationMs: params.durationMs,
    });
  }

  onDecisionStart(decisionId: string): void {
    // TODO: start root OTel span "aeos.decision"
    console.debug('[AEOS/Agentforce] decision.start', { decisionId });
  }

  onDecisionEnd(decisionId: string, outcome: DecisionOutcome): void {
    // TODO: end root OTel span with outcome fields
    console.debug('[AEOS/Agentforce] decision.end', { decisionId, outcome });
  }

  onHumanOverride(decisionId: string, reason: string): void {
    // TODO: emit OTel event with SpanAttributes.HUMAN_OVERRIDE = true
    console.debug('[AEOS/Agentforce] human.override', { decisionId, reason });
  }
}
