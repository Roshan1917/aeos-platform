/**
 * Suggestion Refinement Agent — refines a single suggestion based on user feedback.
 * Single Claude call, no tool loop. Re-scores automation potential afterwards.
 *
 * Ported from fuzebox-intelligence/discovery-service.
 */

import {
  getAnthropic,
  ANTHROPIC_MODEL,
  type LLMMessageParam,
  type LLMTextBlock,
  type LLMTool,
  type LLMToolUseBlock,
} from '../lib/anthropic.js';
import type { ProposedStep } from '../types.js';
import { scoreAutomationPotential } from './automation-scoring-agent.js';
import { logAgentTokens, logInfo } from '../lib/logger.js';

const MAX_TOKENS = 2048;

export interface RefinementChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface RefinementResult {
  refined_steps: ProposedStep[];
  assistant_reply: string;
}

const SUGGEST_PROCESS_TOOL: LLMTool = {
  name: 'suggest_process',
  description:
    "Return the complete revised list of steps for this process after applying the user's requested changes.",
  input_schema: {
    type: 'object' as const,
    required: ['steps'],
    properties: {
      steps: {
        type: 'array',
        description: 'The complete ordered sequence of revised steps',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          required: ['name', 'step_type', 'description'],
          properties: {
            name: { type: 'string', description: 'Step name' },
            step_type: {
              type: 'string',
              enum: ['task', 'decision', 'subprocess'],
              description: 'Type of step',
            },
            description: { type: 'string', description: 'What happens in this step' },
          },
        },
      },
    },
  },
};

function sanitize(text: string, maxLen = 200): string {
  return text.replace(/<|>|\n|\r/g, ' ').slice(0, maxLen);
}

function buildSystemPrompt(suggestion: {
  name: string;
  description: string | null;
  steps: ProposedStep[];
}): string {
  const stepsText = suggestion.steps
    .map(
      (s, i) =>
        `${i + 1}. [${s.step_type}] ${sanitize(s.name, 100)} — ${sanitize(s.description, 300)}`,
    )
    .join('\n');

  return `You are a process refinement assistant for the AEOS platform.

You are helping a user refine a single business process suggestion. The user will ask you to modify, add, remove, or restructure steps.

== CURRENT PROCESS ==
<process_name>${sanitize(suggestion.name)}</process_name>
<process_description>${sanitize(suggestion.description ?? 'N/A', 500)}</process_description>

Current steps:
${stepsText}

== INSTRUCTIONS ==
1. Respond conversationally in ONE short paragraph (2-3 sentences max) acknowledging what you changed and why.
2. Then call suggest_process EXACTLY ONCE with the complete revised step list.
3. Always return ALL steps — even ones you did not change.

== STEP RULES ==
- Steps should be concrete and actionable — include the specific action
- Every step should produce a clear output or move the process forward
- Do NOT mention AI agents, bots, or autonomous automation in step descriptions — but mentioning real tools people use (email, CRM, spreadsheets) is fine
- step_type must be exactly one of: task, decision, subprocess
- Between 1 and 20 steps`;
}

function buildMessages(history: RefinementChatMessage[], userPrompt: string): LLMMessageParam[] {
  const messages: LLMMessageParam[] = [];
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.text });
  }
  messages.push({ role: 'user', content: userPrompt });
  return messages;
}

export async function runRefinementAgent(
  suggestion: { name: string; description: string | null; steps: ProposedStep[] },
  history: RefinementChatMessage[],
  userPrompt: string,
): Promise<RefinementResult> {
  logInfo(
    `Refinement agent called for process "${suggestion.name}" (${suggestion.steps.length} steps)`,
  );

  const client = getAnthropic();
  const systemPrompt = buildSystemPrompt(suggestion);
  const messages = buildMessages(history, userPrompt);

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools: [SUGGEST_PROCESS_TOOL],
    tool_choice: { type: 'auto' },
    messages,
  });

  logAgentTokens(response.usage.input_tokens, response.usage.output_tokens);

  const textBlocks = response.content.filter((b): b is LLMTextBlock => b.type === 'text');
  const assistantReply = textBlocks
    .map((b) => b.text)
    .join('\n')
    .trim();

  const toolBlocks = response.content.filter(
    (b): b is LLMToolUseBlock => b.type === 'tool_use' && b.name === 'suggest_process',
  );

  if (toolBlocks.length === 0) {
    return {
      refined_steps: suggestion.steps,
      assistant_reply:
        assistantReply ||
        'I was unable to generate refined steps. Please try rephrasing your request.',
    };
  }

  const input = toolBlocks[0]!.input as { steps?: unknown };
  const rawSteps = input.steps;

  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return {
      refined_steps: suggestion.steps,
      assistant_reply:
        assistantReply || 'The refinement produced no valid steps. Please try again.',
    };
  }

  let refinedSteps: ProposedStep[] = rawSteps.map((s: Record<string, unknown>) => ({
    name: String(s['name'] ?? ''),
    step_type: (['task', 'decision', 'subprocess'].includes(String(s['step_type']))
      ? String(s['step_type'])
      : 'task') as ProposedStep['step_type'],
    description: String(s['description'] ?? ''),
  }));

  try {
    const scored = await scoreAutomationPotential([
      { name: suggestion.name, description: suggestion.description ?? '', steps: refinedSteps },
    ]);
    if (scored[0]) {
      refinedSteps = scored[0].steps;
    }
  } catch {
    // Non-fatal — return steps without scores
  }

  return {
    refined_steps: refinedSteps,
    assistant_reply: assistantReply || 'Steps have been refined.',
  };
}
