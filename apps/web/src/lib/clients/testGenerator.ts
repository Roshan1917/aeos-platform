import { api } from '../api';

export type StepKind = 'llm_call' | 'tool_call' | 'human_handoff' | 'agent_decision';

export interface LlmStep {
  kind: 'llm_call';
  name: string;
  model_provider: string;
  model_id: string;
  prompt_summary: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  status: 'ok' | 'error';
}

export interface ToolStep {
  kind: 'tool_call';
  name: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  tool_success: boolean;
  tool_error?: string;
  duration_ms: number;
  status: 'ok' | 'error';
}

export interface HumanStep {
  kind: 'human_handoff';
  name: string;
  prompt: string;
  expected_decision: 'approve' | 'reject';
  override_reason: string;
  duration_ms: number;
  status: 'ok' | 'error';
}

export interface DecisionStep {
  kind: 'agent_decision';
  name: string;
  success: boolean;
  output_summary: string;
  duration_ms: number;
  status: 'ok' | 'error';
}

export type TestStep = LlmStep | ToolStep | HumanStep | DecisionStep;

export interface TestCasePlan {
  title: string;
  description: string;
  agent_hint: string;
  uop_hint: string;
  steps: TestStep[];
}

export interface TestCaseRow {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  agent_hint: string;
  uop_hint: string;
  plan: TestCasePlan;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type RunMode = 'synthetic' | 'live';
export type HumanMode = 'auto' | 'interactive';

export interface RunStartResponse {
  run_id: string;
  test_case_id: string;
  mode: RunMode;
  human_mode: HumanMode;
}

export type RunEvent =
  | { type: 'run_started'; run_id: string; trace_id: string; total_steps: number }
  | { type: 'step_started'; step_index: number; kind: StepKind; name: string }
  | { type: 'step_completed'; step_index: number; span: Record<string, unknown> }
  | {
      type: 'human_step_pending';
      step_index: number;
      prompt: string;
      expected: 'approve' | 'reject';
    }
  | { type: 'run_completed'; run_id: string; trace_id: string; spans_emitted: number }
  | { type: 'run_failed'; run_id: string; error: string };

export function generatePlan(prompt: string, stepCountHint?: number): Promise<{ plan: TestCasePlan }> {
  return api('test-generator', '/v1/test-cases/generate', {
    method: 'POST',
    body: { prompt, ...(stepCountHint ? { step_count_hint: stepCountHint } : {}) },
  });
}

export function saveTestCase(plan: TestCasePlan): Promise<TestCaseRow> {
  return api('test-generator', '/v1/test-cases', { method: 'POST', body: plan });
}

export function listTestCases(): Promise<TestCaseRow[]> {
  return api('test-generator', '/v1/test-cases');
}

export function getTestCase(id: string): Promise<TestCaseRow> {
  return api('test-generator', `/v1/test-cases/${id}`);
}

export function deleteTestCase(id: string): Promise<void> {
  return api('test-generator', `/v1/test-cases/${id}`, { method: 'DELETE' });
}

export function executeTestCase(
  id: string,
  body: { mode: RunMode; human_mode: HumanMode },
): Promise<RunStartResponse> {
  return api('test-generator', `/v1/test-cases/${id}/execute`, { method: 'POST', body });
}

export function postHumanDecision(
  runId: string,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<{ accepted: boolean }> {
  return api('test-generator', `/v1/runs/${runId}/decisions`, {
    method: 'POST',
    body: { decision, ...(reason ? { reason } : {}) },
  });
}
