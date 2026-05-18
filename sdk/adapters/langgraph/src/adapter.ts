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
// AEOS span attribute constants for LangGraph
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
// LangGraph interface (duck-typed to avoid a hard runtime dependency)
//
// LangGraph's StateGraph exposes an `invoke(state)` method that executes the
// graph and returns the final state. We accept the graph as `any` here so the
// adapter can be installed without forcing LangGraph as a peer dependency.
// Callers are expected to pass a properly-typed StateGraph instance.
//
// interface StateGraph {
//   invoke(state: Record<string, unknown>, config?: Record<string, unknown>): Promise<Record<string, unknown>>;
// }
// ---------------------------------------------------------------------------

/** Minimal duck-type for a LangGraph StateGraph */
interface LangGraphLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke(state: any, config?: any): Promise<any>;
}

// ---------------------------------------------------------------------------
// LangGraphAdapter
//
// Wraps LangGraph JS StateGraph.invoke() and emits AEOS OTel spans around the
// graph execution. Does not instrument individual nodes — that requires
// LangChain callbacks, which is out of scope for this adapter.
//
// No LangGraph runtime dependency: the graph is passed as `any`-typed
// (LangGraphLike). Callers bring their own LangGraph version.
//
// TODO: Replace stub span emission with real OTel SDK calls once @aeos/adapter-sdk
//       exposes the core emitter (sdk/packages/sdk-core/src/emitter.ts).
// ---------------------------------------------------------------------------
export class LangGraphAdapter implements AdapterContract {
  readonly config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // invoke — wraps graph.invoke(state) with AEOS span emission
  //
  // @param graph   LangGraph StateGraph instance (or any object with .invoke())
  // @param state   Initial graph state
  // @param config  Optional LangGraph run config (passed through to graph.invoke)
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async invoke(graph: LangGraphLike, state: any, config?: any): Promise<any> {
    const decisionId = crypto.randomUUID();
    const start = Date.now();

    this.onDecisionStart(decisionId);
    this.onLlmCallStart({
      decisionId,
      modelId: 'langgraph-graph',
      modelProvider: 'langgraph',
    });

    let result: unknown;
    let success = true;
    try {
      result = await graph.invoke(state, config);
    } catch (err) {
      success = false;
      this.onLlmCallEnd({ decisionId, durationMs: Date.now() - start });
      this.onDecisionEnd(decisionId, { success: false });
      throw err;
    }

    this.onLlmCallEnd({ decisionId, durationMs: Date.now() - start });
    this.onDecisionEnd(decisionId, { success });

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
    //   SpanAttributes.VENDOR_RUNTIME  = 'langgraph'
    //   SpanAttributes.MODEL_PROVIDER  = 'langgraph'
    //   SpanAttributes.MODEL_ID        = params.modelId
    console.debug('[AEOS/LangGraph] llm.call.start', {
      tenantId: this.config.tenantId,
      agentId: this.config.agentId,
      decisionId: params.decisionId,
      modelId: params.modelId,
      vendorRuntime: 'langgraph',
    });
  }

  onLlmCallEnd(params: LlmCallResult): void {
    // TODO: end OTel span with:
    //   SpanAttributes.OUTPUT_TOKENS = params.outputTokens
    //   SpanAttributes.COST_USD      = params.costUsd
    console.debug('[AEOS/LangGraph] llm.call.end', {
      decisionId: params.decisionId,
      outputTokens: params.outputTokens,
      durationMs: params.durationMs,
    });
  }

  onToolCallStart(params: ToolCallParams): void {
    // TODO: start OTel span "aeos.tool.call" with SpanAttributes.TOOL_NAME
    console.debug('[AEOS/LangGraph] tool.call.start', {
      decisionId: params.decisionId,
      toolName: params.toolName,
    });
  }

  onToolCallEnd(params: ToolCallResult): void {
    // TODO: end OTel span with SpanAttributes.TOOL_SUCCESS, error if any
    console.debug('[AEOS/LangGraph] tool.call.end', {
      decisionId: params.decisionId,
      toolName: params.toolName,
      success: params.success,
      durationMs: params.durationMs,
    });
  }

  onDecisionStart(decisionId: string): void {
    // TODO: start root OTel span "aeos.decision"
    console.debug('[AEOS/LangGraph] decision.start', { decisionId });
  }

  onDecisionEnd(decisionId: string, outcome: DecisionOutcome): void {
    // TODO: end root OTel span with outcome fields
    console.debug('[AEOS/LangGraph] decision.end', { decisionId, outcome });
  }

  onHumanOverride(decisionId: string, reason: string): void {
    // TODO: emit OTel event with SpanAttributes.HUMAN_OVERRIDE = true
    console.debug('[AEOS/LangGraph] human.override', { decisionId, reason });
  }
}
