import type { AgentId, TenantId, UoPId } from '@aeos/canonical-schema';

export interface AdapterConfig {
  readonly tenantId: TenantId;
  readonly agentId: AgentId;
  readonly uopId?: UoPId;
  readonly otlpEndpoint: string;
}

export interface AdapterContract {
  readonly config: AdapterConfig;
  onLlmCallStart(params: LlmCallParams): void;
  onLlmCallEnd(params: LlmCallResult): void;
  onToolCallStart(params: ToolCallParams): void;
  onToolCallEnd(params: ToolCallResult): void;
  onDecisionStart(decisionId: string): void;
  onDecisionEnd(decisionId: string, outcome: DecisionOutcome): void;
  onHumanOverride(decisionId: string, reason: string): void;
}

export interface LlmCallParams {
  readonly decisionId: string;
  readonly modelId: string;
  readonly modelProvider: string;
  readonly inputTokens?: number;
  readonly prompt?: string;
}

export interface LlmCallResult {
  readonly decisionId: string;
  readonly outputTokens?: number;
  readonly costUsd?: number;
  readonly hallucinationScore?: number;
  readonly durationMs: number;
}

export interface ToolCallParams {
  readonly decisionId: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
}

export interface ToolCallResult {
  readonly decisionId: string;
  readonly toolName: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly error?: string;
}

export interface DecisionOutcome {
  readonly success: boolean;
  readonly outputSummary?: string;
}
