/**
 * Automation Analysis Agent — two-phase Q&A flow.
 *  1. generateAnalysisQuestions — 4-6 interview questions.
 *  2. runAnalysis — per-step automation_potential + recommendation, given Q&A answers.
 *
 * Ported from fuzebox-intelligence/discovery-service.
 */

import {
  getAnthropic,
  ANTHROPIC_MODEL,
  type LLMTool,
  type LLMToolUseBlock,
} from '../lib/anthropic.js';
import type { ProposedStep, StepAnalysisResult } from '../types.js';
import { logAgentTokens, logInfo } from '../lib/logger.js';

const MAX_TOKENS = 2048;

function sanitize(text: string, maxLen = 200): string {
  return text.replace(/<|>|\n|\r/g, ' ').slice(0, maxLen);
}

function formatSteps(steps: ProposedStep[]): string {
  return steps
    .map(
      (s, i) =>
        `${i + 1}. [${s.step_type}] ${sanitize(s.name, 100)} — ${sanitize(s.description, 300)}`,
    )
    .join('\n');
}

const GENERATE_QUESTIONS_TOOL: LLMTool = {
  name: 'provide_questions',
  description:
    'Return a list of 4-6 interview questions to help assess automation potential for this process.',
  input_schema: {
    type: 'object' as const,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        minItems: 3,
        maxItems: 6,
        items: { type: 'string' },
        description:
          'Specific, actionable questions about tooling, templates, manual work, and automation readiness.',
      },
    },
  },
};

export async function generateAnalysisQuestions(suggestion: {
  name: string;
  description: string | null;
  steps: ProposedStep[];
}): Promise<string[]> {
  logInfo(
    `Generating analysis questions for "${suggestion.name}" (${suggestion.steps.length} steps)`,
  );

  const client = getAnthropic();

  const systemPrompt = `You are an automation assessment expert. You are about to interview a user to understand how automatable each step of their business process is.

== PROCESS ==
<process_name>${sanitize(suggestion.name)}</process_name>
<process_description>${sanitize(suggestion.description ?? 'N/A', 500)}</process_description>

Steps:
${formatSteps(suggestion.steps)}

== YOUR TASK ==
Generate 4-6 specific interview questions that will help you determine the automation potential of each step.

Focus on:
- What tools/software are already being used for specific steps
- Whether there are templates, standard procedures, or if work is done ad-hoc
- Which steps require human judgment vs. follow clear rules
- What manual work takes the most time or is most error-prone
- Whether there are existing integrations between tools
- What approval or review gates exist and how rigid they are

Be specific — reference actual step names from the process. Don't ask generic questions.
Call provide_questions ONCE with all questions.`;

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools: [GENERATE_QUESTIONS_TOOL],
    tool_choice: { type: 'tool', name: 'provide_questions' },
    messages: [{ role: 'user', content: 'Generate interview questions for this process.' }],
  });

  logAgentTokens(response.usage.input_tokens, response.usage.output_tokens);

  const toolBlock = response.content.find(
    (b): b is LLMToolUseBlock => b.type === 'tool_use' && b.name === 'provide_questions',
  );

  if (!toolBlock) {
    return ['What tools does your team currently use for this process?'];
  }

  const input = toolBlock.input as { questions?: unknown };
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    return ['What tools does your team currently use for this process?'];
  }

  return input.questions.map((q: unknown) => String(q));
}

const ANALYZE_STEPS_TOOL: LLMTool = {
  name: 'analyze_steps',
  description: 'Provide automation analysis for each step of the process.',
  input_schema: {
    type: 'object' as const,
    required: ['results'],
    properties: {
      results: {
        type: 'array',
        description: 'One analysis entry per step, in the same order as the input steps.',
        items: {
          type: 'object',
          required: ['step_index', 'automation_potential', 'recommendation'],
          properties: {
            step_index: { type: 'integer', description: 'Zero-based index of the step' },
            automation_potential: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description:
                'Percentage (0-100) indicating how automatable this step is given the user context',
            },
            recommendation: {
              type: 'string',
              description: 'A concise 1-2 sentence recommendation about automation for this step',
            },
          },
        },
      },
    },
  },
};

export interface AnalysisQAPair {
  question: string;
  answer: string;
}

export async function runAnalysis(
  suggestion: { name: string; description: string | null; steps: ProposedStep[] },
  qaPairs: AnalysisQAPair[],
): Promise<StepAnalysisResult[]> {
  logInfo(`Running automation analysis for "${suggestion.name}" with ${qaPairs.length} Q&A pairs`);

  const client = getAnthropic();

  const qaText = qaPairs
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join('\n\n');

  const systemPrompt = `You are an automation assessment expert analyzing a business process for automation potential.

== PROCESS ==
<process_name>${sanitize(suggestion.name)}</process_name>
<process_description>${sanitize(suggestion.description ?? 'N/A', 500)}</process_description>

Steps:
${formatSteps(suggestion.steps)}

== USER INTERVIEW ==
${qaText}

== YOUR TASK ==
Based on the process steps AND the user's interview answers, analyze each step for automation potential.

For each step:
- automation_potential (0-100): Score based on what the user told you about their current tools, templates, and manual work
- recommendation: A specific, actionable 1-2 sentence recommendation. Reference the tools and context the user mentioned.

Call analyze_steps ONCE with results for ALL steps.`;

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools: [ANALYZE_STEPS_TOOL],
    tool_choice: { type: 'tool', name: 'analyze_steps' },
    messages: [
      {
        role: 'user',
        content: 'Analyze the automation potential for each step based on my answers.',
      },
    ],
  });

  logAgentTokens(response.usage.input_tokens, response.usage.output_tokens);

  const toolBlock = response.content.find(
    (b): b is LLMToolUseBlock => b.type === 'tool_use' && b.name === 'analyze_steps',
  );

  if (!toolBlock) {
    return suggestion.steps.map(() => ({
      automation_potential: 0,
      recommendation: 'Analysis could not be completed.',
    }));
  }

  const input = toolBlock.input as { results?: unknown };
  if (!Array.isArray(input.results)) {
    return suggestion.steps.map(() => ({
      automation_potential: 0,
      recommendation: 'Analysis could not be completed.',
    }));
  }

  const resultMap = new Map<number, StepAnalysisResult>();
  for (const entry of input.results) {
    const e = entry as Record<string, unknown>;
    const idx = Number(e['step_index']);
    const pot = Number(e['automation_potential']);
    const rec = String(e['recommendation'] ?? '');
    if (!isNaN(idx) && !isNaN(pot)) {
      resultMap.set(idx, {
        automation_potential: Math.max(0, Math.min(100, Math.round(pot))),
        recommendation: rec,
      });
    }
  }

  return suggestion.steps.map(
    (_, i) =>
      resultMap.get(i) ?? {
        automation_potential: 0,
        recommendation: 'No analysis available for this step.',
      },
  );
}
