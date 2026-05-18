import { z } from 'zod';

const baseStep = {
  name: z.string().min(1).max(120),
  duration_ms: z.number().int().min(1).max(600_000).default(500),
  status: z.enum(['ok', 'error']).default('ok'),
};

export const llmCallStep = z.object({
  kind: z.literal('llm_call'),
  ...baseStep,
  model_provider: z.string().default('anthropic'),
  model_id: z.string().default('claude-sonnet-4-6'),
  prompt_summary: z.string().max(500).default(''),
  input_tokens: z.number().int().min(0).default(400),
  output_tokens: z.number().int().min(0).default(120),
  cost_usd: z.number().min(0).default(0.003),
});

export const toolCallStep = z.object({
  kind: z.literal('tool_call'),
  ...baseStep,
  tool_name: z.string().min(1),
  tool_args: z.record(z.unknown()).default({}),
  tool_success: z.boolean().default(true),
  tool_error: z.string().optional(),
});

export const humanHandoffStep = z.object({
  kind: z.literal('human_handoff'),
  ...baseStep,
  prompt: z.string().min(1).max(500),
  expected_decision: z.enum(['approve', 'reject']).default('approve'),
  override_reason: z.string().max(200).default(''),
});

export const agentDecisionStep = z.object({
  kind: z.literal('agent_decision'),
  ...baseStep,
  success: z.boolean().default(true),
  output_summary: z.string().max(500).default(''),
});

export const testStepSchema = z.discriminatedUnion('kind', [
  llmCallStep,
  toolCallStep,
  humanHandoffStep,
  agentDecisionStep,
]);

export type TestStep = z.infer<typeof testStepSchema>;

export const testCasePlanSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).default(''),
  agent_hint: z.string().max(120).default(''),
  uop_hint: z.string().max(120).default(''),
  steps: z.array(testStepSchema).min(1).max(20),
});

export type TestCasePlan = z.infer<typeof testCasePlanSchema>;

export const generateRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  step_count_hint: z.number().int().min(2).max(15).optional(),
});

export const saveRequestSchema = testCasePlanSchema;

export const executeRequestSchema = z.object({
  mode: z.enum(['synthetic', 'live']).default('synthetic'),
  human_mode: z.enum(['auto', 'interactive']).default('auto'),
});
