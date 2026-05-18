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
// AEOS span attribute constants for Human Workflow
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
// ApprovalFn — callback type provided by the caller
//
// The caller is responsible for implementing the approval mechanism (e.g. a
// Slack message, an email, a database polling loop).  The function should
// resolve to `true` (approved) or `false` (rejected/timed-out).
// ---------------------------------------------------------------------------
export type ApprovalFn = (taskId: string, prompt: string) => Promise<boolean>;

// ---------------------------------------------------------------------------
// DecisionRequest — represents a pending human decision
// ---------------------------------------------------------------------------
export interface DecisionRequest {
  readonly taskId: string;
  readonly prompt: string;
  readonly requestedAt: Date;
}

// ---------------------------------------------------------------------------
// DecisionResult — outcome of a human approval step
// ---------------------------------------------------------------------------
export interface DecisionResult {
  readonly taskId: string;
  readonly approved: boolean;
  readonly resolvedAt: Date;
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// HumanWorkflowAdapter
//
// Models a human-in-the-loop step in an agent workflow.
// The caller provides an `approvalFn` that implements the actual approval
// mechanism (any async process). The adapter wraps that function with AEOS
// OTel span emission.
//
// Usage:
//   const adapter = new HumanWorkflowAdapter(config, myApprovalFn);
//   const result = await adapter.requestDecision('task-123', 'Approve wire transfer?');
//   if (result.approved) { ... }
//
// TODO: Replace stub span emission with real OTel SDK calls once @aeos/adapter-sdk
//       exposes the core emitter (sdk/packages/sdk-core/src/emitter.ts).
// ---------------------------------------------------------------------------
export class HumanWorkflowAdapter implements AdapterContract {
  readonly config: AdapterConfig;
  private readonly approvalFn: ApprovalFn;

  constructor(config: AdapterConfig, approvalFn: ApprovalFn) {
    this.config = config;
    this.approvalFn = approvalFn;
  }

  // -------------------------------------------------------------------------
  // requestDecision — awaits a human approval, emits AEOS spans
  //
  // Emits:
  //   onDecisionStart     — when the request is submitted
  //   onDecisionEnd       — when approved or rejected
  //   onHumanOverride     — always (any human decision is an override event)
  // -------------------------------------------------------------------------
  async requestDecision(taskId: string, prompt: string): Promise<DecisionResult> {
    const decisionId = taskId;
    const requestedAt = new Date();
    const start = Date.now();

    this.onDecisionStart(decisionId);

    let approved = false;
    try {
      approved = await this.approvalFn(taskId, prompt);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.onHumanOverride(decisionId, `approval_fn_error: ${reason}`);
      this.onDecisionEnd(decisionId, { success: false, outputSummary: 'error' });
      throw err;
    }

    const durationMs = Date.now() - start;

    // Every human decision is recorded as an override event — humans stepping
    // in to approve or reject is always a notable governance signal.
    const overrideReason = approved ? 'human_approved' : 'human_rejected';
    this.onHumanOverride(decisionId, overrideReason);

    this.onDecisionEnd(decisionId, {
      success: approved,
      outputSummary: approved ? 'approved' : 'rejected',
    });

    return {
      taskId,
      approved,
      requestedAt,
      durationMs,
    };
  }

  // -------------------------------------------------------------------------
  // AdapterContract — lifecycle hooks
  // TODO: replace console stubs with actual OTel span emission via @aeos/adapter-sdk
  // -------------------------------------------------------------------------
  onLlmCallStart(params: LlmCallParams): void {
    // Human workflow does not make LLM calls directly — this hook is a no-op
    // but is required by AdapterContract.
    console.debug('[AEOS/HumanWorkflow] llm.call.start (no-op)', {
      decisionId: params.decisionId,
    });
  }

  onLlmCallEnd(params: LlmCallResult): void {
    // No-op — see onLlmCallStart
    console.debug('[AEOS/HumanWorkflow] llm.call.end (no-op)', {
      decisionId: params.decisionId,
    });
  }

  onToolCallStart(params: ToolCallParams): void {
    // TODO: start OTel span "aeos.tool.call" with SpanAttributes.TOOL_NAME
    console.debug('[AEOS/HumanWorkflow] tool.call.start', {
      decisionId: params.decisionId,
      toolName: params.toolName,
    });
  }

  onToolCallEnd(params: ToolCallResult): void {
    // TODO: end OTel span with SpanAttributes.TOOL_SUCCESS, error if any
    console.debug('[AEOS/HumanWorkflow] tool.call.end', {
      decisionId: params.decisionId,
      toolName: params.toolName,
      success: params.success,
      durationMs: params.durationMs,
    });
  }

  onDecisionStart(decisionId: string): void {
    // TODO: start root OTel span "aeos.decision"
    //   SpanAttributes.TENANT_ID   = this.config.tenantId
    //   SpanAttributes.AGENT_ID    = this.config.agentId
    //   SpanAttributes.DECISION_ID = decisionId
    //   SpanAttributes.VENDOR_RUNTIME = 'human_workflow'
    console.debug('[AEOS/HumanWorkflow] decision.start', { decisionId });
  }

  onDecisionEnd(decisionId: string, outcome: DecisionOutcome): void {
    // TODO: end root OTel span with outcome fields
    console.debug('[AEOS/HumanWorkflow] decision.end', { decisionId, outcome });
  }

  onHumanOverride(decisionId: string, reason: string): void {
    // TODO: emit OTel event with:
    //   SpanAttributes.HUMAN_OVERRIDE = true
    //   SpanAttributes.DECISION_ID    = decisionId
    //   reason                        = reason
    console.debug('[AEOS/HumanWorkflow] human.override', { decisionId, reason });
  }
}
