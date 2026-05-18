/**
 * Automation Scoring Agent — scores each step 0-100% automation potential.
 * Second-pass call after the discovery or refinement agent produces steps.
 *
 * Ported from fuzebox-intelligence/discovery-service.
 */

import {
  getAnthropic,
  ANTHROPIC_MODEL,
  type LLMTool,
  type LLMToolUseBlock,
} from '../lib/anthropic.js';
import type { ProcessSuggestion, ProposedStep } from '../types.js';
import { logAgentTokens, logInfo } from '../lib/logger.js';

const MAX_TOKENS = 2048;

const SCORE_STEPS_TOOL: LLMTool = {
  name: 'score_steps',
  description:
    'Assign an automation potential percentage (0-100) to each step of a business process.',
  input_schema: {
    type: 'object' as const,
    required: ['scores'],
    properties: {
      scores: {
        type: 'array',
        description: 'One score entry per step, in the same order as the input steps',
        items: {
          type: 'object',
          required: ['step_index', 'automation_potential'],
          properties: {
            step_index: { type: 'integer', description: 'Zero-based index of the step' },
            automation_potential: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'Percentage (0-100) indicating how automatable this step is',
            },
          },
        },
      },
    },
  },
};

function sanitize(text: string, maxLen = 200): string {
  return text.replace(/<|>|\n|\r/g, ' ').slice(0, maxLen);
}

function buildPrompt(suggestions: ProcessSuggestion[], companyContext?: string): string {
  const companyLine = companyContext
    ? `\n<company_context>${companyContext.replace(/<|>/g, '').slice(0, 500)}</company_context>\nConsider this company context when assessing automation potential.\n`
    : '';

  const processesText = suggestions
    .map((s, pi) => {
      const stepsText = s.steps
        .map(
          (step, si) =>
            `  ${si}. [${step.step_type}] ${sanitize(step.name, 100)} — ${sanitize(step.description, 300)}`,
        )
        .join('\n');
      return `Process ${pi + 1}: ${sanitize(s.name)}\n${stepsText}`;
    })
    .join('\n\n');

  return `You are an automation assessment expert for the AEOS platform.
${companyLine}
You will be given business process suggestions with their steps. For EACH step, assess how automatable it is on a scale of 0-100%:

- 0-20%: Requires human judgment, creativity, or physical presence
- 20-50%: Partially automatable — some parts can be automated but needs human oversight
- 50-80%: Mostly automatable — can be done by software with occasional human review
- 80-100%: Fully automatable — routine, rule-based, or data-driven

Call score_steps ONCE per process with scores for ALL steps.

${processesText}`;
}

export async function scoreAutomationPotential(
  suggestions: ProcessSuggestion[],
  companyContext?: string,
): Promise<ProcessSuggestion[]> {
  if (suggestions.length === 0) return suggestions;

  const MAX_SCORING_CALLS = 10;
  logInfo(
    `Scoring automation potential for ${suggestions.length} suggestion(s) (max ${MAX_SCORING_CALLS})`,
  );

  const client = getAnthropic();

  async function scoreSingle(suggestion: ProcessSuggestion): Promise<ProcessSuggestion> {
    const singlePrompt = buildPrompt([suggestion], companyContext);

    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      system: singlePrompt,
      tools: [SCORE_STEPS_TOOL],
      tool_choice: { type: 'tool', name: 'score_steps' },
      messages: [
        { role: 'user', content: 'Score the automation potential for each step in this process.' },
      ],
    });

    logAgentTokens(response.usage.input_tokens, response.usage.output_tokens);

    const toolBlock = response.content.find(
      (b): b is LLMToolUseBlock => b.type === 'tool_use' && b.name === 'score_steps',
    );

    if (!toolBlock) return suggestion;

    const input = toolBlock.input as { scores?: unknown };
    const rawScores = input.scores;

    if (!Array.isArray(rawScores)) return suggestion;

    const scoreMap = new Map<number, number>();
    for (const entry of rawScores) {
      const e = entry as Record<string, unknown>;
      const idx = Number(e['step_index']);
      const pot = Number(e['automation_potential']);
      if (!isNaN(idx) && !isNaN(pot)) {
        scoreMap.set(idx, Math.max(0, Math.min(100, Math.round(pot))));
      }
    }

    const stepsWithScores: ProposedStep[] = suggestion.steps.map((step, i) => {
      const score = scoreMap.get(i);
      if (score != null) {
        return { ...step, automation_potential: score };
      }
      return step;
    });

    return { ...suggestion, steps: stepsWithScores };
  }

  const toScore = suggestions.slice(0, MAX_SCORING_CALLS);
  const unscored = suggestions.slice(MAX_SCORING_CALLS);
  const CONCURRENCY = 3;
  const scored: ProcessSuggestion[] = [];

  for (let i = 0; i < toScore.length; i += CONCURRENCY) {
    const batch = toScore.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(scoreSingle));
    for (let j = 0; j < results.length; j++) {
      const r = results[j]!;
      scored.push(r.status === 'fulfilled' ? r.value : batch[j]!);
    }
  }

  return [...scored, ...unscored];
}
