/**
 * POST /v1/test-cases/generate
 *
 * Calls Claude with the system prompt + a user-supplied scenario, parses the
 * JSON output, and validates against `testCasePlanSchema`. One retry on JSON
 * parse failure. The plan is NOT saved — the caller persists separately via
 * POST /v1/test-cases when they're happy with it.
 */
import { Router, type Router as ExpressRouter } from 'express';
import { generateRequestSchema, testCasePlanSchema } from '../lib/schema.js';
import { callClaude } from '../lib/anthropic.js';
import { TEST_CASE_SYSTEM_PROMPT, FEW_SHOT_EXAMPLES } from '../lib/system-prompt.js';

export const generateRouter: ExpressRouter = Router();

generateRouter.post('/generate', async (req, res) => {
  const parsed = generateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    return;
  }

  const { prompt, step_count_hint } = parsed.data;
  const userMessage = buildUserMessage(prompt, step_count_hint);

  try {
    const plan = await generateOnce(userMessage);
    res.status(200).json({ plan });
  } catch (firstErr) {
    // One-shot retry — common failure is the model wrapping JSON in fences.
    try {
      const plan = await generateOnce(userMessage + '\n\nReturn JSON only. No markdown fences.');
      res.status(200).json({ plan });
    } catch (secondErr) {
      const message = secondErr instanceof Error ? secondErr.message : String(secondErr);
      res.status(502).json({ error: 'llm_generation_failed', message });
    }
  }
});

function buildUserMessage(prompt: string, stepHint?: number): string {
  const example = FEW_SHOT_EXAMPLES[0]!;
  const lines = [
    `Example scenario:\n${example.prompt}\n\nExample plan:\n${JSON.stringify(example.plan, null, 2)}`,
    `\nNow produce a plan for this scenario:\n${prompt}`,
  ];
  if (stepHint) lines.push(`Aim for about ${stepHint} steps.`);
  return lines.join('\n');
}

async function generateOnce(userMessage: string) {
  const outcome = await callClaude(TEST_CASE_SYSTEM_PROMPT, userMessage, { maxTokens: 3000 });
  const cleaned = stripFences(outcome.text).trim();
  const json = JSON.parse(cleaned);
  return testCasePlanSchema.parse(json);
}

function stripFences(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenceMatch ? fenceMatch[1]! : text;
}
