/**
 * Process Auto-Discovery AI Agent.
 *
 * Uses Claude with tool use to analyze data fetched from external systems
 * (or, in v1, attached documents) and suggest business processes. Supports
 * an interactive loop: agent calls `ask_user` to surface questions; the
 * orchestrator pauses the run and resumes after the user answers.
 *
 * Ported from fuzebox-intelligence/discovery-service.
 */

import {
  getAnthropic,
  ANTHROPIC_MODEL,
  type LLMContentBlockParam,
  type LLMMessageParam,
  type LLMTool,
  type LLMToolResultBlockParam,
  type LLMToolUseBlock,
} from '../lib/anthropic.js';
import type {
  DiscoveryDataset,
  ProcessSuggestion,
  ConnectorDocument,
} from '../types.js';
import { toContentBlock } from '../lib/document-converter.js';
import { logAgentTokens } from '../lib/logger.js';

const MAX_SUGGESTIONS = 15;
const MAX_QUESTIONS = 8;
const MAX_INPUT_CHARS = 100_000;

export interface InterviewContext {
  company_context: string;
  process_depth: 'focused' | 'broad';
  detail_level: 'high-level' | 'moderate' | 'detailed';
}

export interface InteractionMessage {
  role: 'assistant' | 'user';
  text: string;
  timestamp: string;
}

export interface InteractionState {
  history: InteractionMessage[];
  current_question: string | null;
  pending_questions?: string[];
  question_round: number;
}

export type AgentResult =
  | { type: 'completed'; suggestions: ProcessSuggestion[] }
  | {
      type: 'needs_input';
      questions: string[];
      messages: LLMMessageParam[];
      suggestions: ProcessSuggestion[];
      systemPrompt: string;
    };

const DETAIL_LEVEL_INSTRUCTIONS: Record<string, string> = {
  'high-level':
    'Keep steps high-level and concise — a few broad steps covering the essentials.',
  moderate:
    'Use a moderate level of detail — enough to understand the flow without being exhaustive.',
  detailed:
    'Provide thorough, granular steps that break down each phase of the process in depth.',
};

const DEPTH_INSTRUCTIONS: Record<string, string> = {
  focused:
    'Focus only on the most important, clearly defined core processes. Suggest fewer, higher-quality processes rather than trying to find everything.',
  broad:
    'Explore broadly — include smaller, less obvious processes alongside the major ones. Look for secondary workflows, handoff processes, and supporting operations that the data hints at.',
};

const CONNECTOR_GUIDANCE: Record<string, string> = {
  Documents: `== DOCUMENT-BASED DISCOVERY GUIDANCE ==

- The attached documents are the PRIMARY source of information — there is no external system data
- Look for process descriptions, step-by-step procedures, flowcharts, checklists, and role assignments
- Treat tabular data (spreadsheets, CSVs) as potential step lists, responsibility matrices, or process inventories
- Identify handoffs between teams or roles described in the documents
- Extract decision points, approval gates, and escalation paths
- Be tolerant of formatting inconsistencies — documents may come from different authors or departments
- Skip the mandatory pipeline overview processes — there are no pipelines, only document-described processes`,
};

function getConnectorGuidance(source: string): string {
  if (source === 'Documents') return CONNECTOR_GUIDANCE['Documents']!;
  return '';
}

function buildSystemPrompt(
  source: string,
  interview?: InterviewContext,
  hasPdfDocuments?: boolean,
  interactive?: boolean,
): string {
  const sanitized = interview?.company_context?.replace(/<|>/g, '');
  const companyLine = sanitized
    ? `<company_context>${sanitized}</company_context>\nUse the company context above to make your suggestions specific and relevant to their industry and operations.\n\n`
    : '';

  const depthLine = interview?.process_depth
    ? `${DEPTH_INSTRUCTIONS[interview.process_depth]}\n\n`
    : '';

  const detailLine = interview?.detail_level
    ? `${DETAIL_LEVEL_INSTRUCTIONS[interview.detail_level]}\n\n`
    : '';

  const connectorGuidance = getConnectorGuidance(source);
  const connectorLine = connectorGuidance ? `${connectorGuidance}\n\n` : '';

  const pdfLine = hasPdfDocuments
    ? 'The user has attached documents to this run (PDFs, images, or text files). These documents contain supplementary business context (e.g. process handbooks, sales playbooks, SOPs, spreadsheets). Cross-reference them when identifying and describing processes.\n\n'
    : '';

  const interactiveLine = interactive
    ? `== INTERACTIVE DISCOVERY ==

You have an ask_user tool. Your goal is to discover HIDDEN work — the steps people actually do that may not be fully captured in the documents. Do NOT ask the user to confirm, repeat, or clarify anything that is already clearly stated in the documents.

WHAT TO ASK — focus on uncovering invisible work:
- "Before a contract is sent, what preparation work does your team do? For example, drafting terms, legal review, internal approvals?"
- "Between two visible steps in this SOP, who is involved and what documents or deliverables are produced along the way?"
- "After a deal is closed-won, what onboarding or handover steps happen before the customer is fully set up?"
- "Is there any recurring manual work your team does that takes significant time but isn't captured in the documents?"
- "Are there any approval gates, review steps, or handoff points between teams that slow things down?"

WHAT TO NEVER ASK:
- Do NOT ask about things visible in the attached documents — read them yourself
- Do NOT ask the user to confirm what the documents show
- Do NOT ask generic questions like "Tell me about your process" — be specific about the gap you're probing

FORMAT:
- Ask 3-4 questions per ask_user call — batch related questions together to minimize back-and-forth
- Be conversational and specific — reference the actual document names or section names you see
- Frame questions around time, effort, and deliverables (e.g. "What work happens between X and Y?")
- You MUST call ask_user at least once before suggesting any processes — never skip the interview
- Call ask_user at most 2 times (2 rounds of 3-4 questions each), then proceed to generate suggestions

`
    : '';

  return `You are a process discovery analyst for the AEOS platform. AEOS helps organizations model their business processes so they can later identify optimization opportunities and measure improvements over time.

YOUR GOAL: Discover the real business processes hidden in the data. Describe each step as a concrete, actionable task — include the specific action people take (e.g. "Send email to client requesting measurements", "Update CRM with call notes", "Submit report to compliance team"). Do not mention AI agents, bots, or autonomous automation — but mentioning real tools and channels people use (email, phone, CRM, spreadsheets) is encouraged. The user's team will decide how to optimize later — your job is to map the work accurately.

${companyLine}${pdfLine}== WHAT MAKES A GOOD STEP ==

INCLUDE steps that:
- Describe a concrete, actionable task with a clear output (a document, a decision, a record, a message, a dataset)
- Can be measured in time, cost, volume, or error rate
- Are specific about the action.


== WHAT IS A BUSINESS PROCESS ==

A repeatable sequence of steps, triggered by a real event (e.g. "new lead created", "support ticket submitted") and ending with a measurable outcome (e.g. "deal closed-won", "contract signed", "customer onboarded").

NOT a process — do NOT suggest:
- Data fields, properties, or object types
- System configuration or settings
- Reports, dashboards, or analytics
- Individual tools or integrations
- Static lists, segments, or groupings

== HIDDEN STEPS AND PROCESSES ==

Documents only show what someone wrote down. Between every two documented steps, people do real work that is invisible. Your job is to surface it.

For every visible transition, ask: "What measurable work must happen before and after this checkpoint?"

ONLY include hidden steps that:
- Describe a concrete action people take (including the channel or tool when relevant — e.g. "Send email", "Update spreadsheet")
- Produce a measurable output
- Are specific and actionable

A single document often describes 2-5 distinct sub-processes. Do not limit yourself to one process per document.

${connectorLine}== OUTPUT FORMAT ==

For each process, call the suggest_process tool with:
- name: Verb-noun format (e.g. "Qualify Inbound Lead", "Prepare and Send Proposal")
- description: Include (1) the trigger event and (2) the desired measurable outcome
- steps: Ordered steps, each with:
  - A clear, concrete action — include specific channels/tools people use (email, phone, CRM, etc.)
  - step_type: task (standard work), decision (branching point), or subprocess (nested process)
  - description: What this step produces and what inputs it requires. Do NOT mention AI agents or autonomous automation.

${interactiveLine}${depthLine}${detailLine}== RULES ==
- Every step must produce a measurable output — if it does not, do not include it
- Infer hidden steps between visible checkpoints using business domain knowledge
- Each process must be distinct — no overlapping scope
- Quality over quantity
- Suggest at most ${MAX_SUGGESTIONS} processes total
- If the data contains no evidence of real business processes, call the suggest_process tool zero times and explain why in text`;
}

const SUGGEST_PROCESS_TOOL: LLMTool = {
  name: 'suggest_process',
  description: 'Suggest a business process identified in the analyzed data',
  input_schema: {
    type: 'object' as const,
    required: ['name', 'description', 'steps'],
    properties: {
      name: {
        type: 'string',
        description: 'Short, clear process name (max 100 characters)',
        maxLength: 100,
      },
      description: {
        type: 'string',
        description:
          'What this process does, who is involved, and why it matters',
      },
      steps: {
        type: 'array',
        description: 'Ordered sequence of steps in the process',
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
            description: {
              type: 'string',
              description: 'What happens in this step',
            },
          },
        },
      },
    },
  },
};

const ASK_USER_TOOL: LLMTool = {
  name: 'ask_user',
  description:
    'Ask the user 3-4 specific questions about their business processes to fill gaps in your understanding. Ask about things that are NOT already evident in the data. Be specific and conversational.',
  input_schema: {
    type: 'object' as const,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        description:
          'A batch of 3-4 specific, focused questions about process gaps you identified.',
        minItems: 1,
        maxItems: 5,
        items: {
          type: 'string',
          description:
            'A specific question about a process gap. Keep it concise and conversational.',
        },
      },
    },
  },
};

function formatDatasetForPrompt(dataset: DiscoveryDataset): string {
  const lines: string[] = [
    `Source system: ${dataset.source}`,
    `Data fetched at: ${dataset.fetched_at}`,
    `Total items: ${dataset.items.length}`,
    '',
    '--- DATA ---',
  ];

  const byCategory = new Map<string, typeof dataset.items>();
  for (const item of dataset.items) {
    const existing = byCategory.get(item.category) ?? [];
    existing.push(item);
    byCategory.set(item.category, existing);
  }

  for (const [category, items] of byCategory) {
    lines.push('', `## ${category} (${items.length})`);
    for (const item of items) {
      lines.push(`- ${item.name}: ${item.description}`);
    }
  }

  lines.push('', '--- END DATA ---');

  const prompt = lines.join('\n');
  return prompt.length > MAX_INPUT_CHARS
    ? prompt.slice(0, MAX_INPUT_CHARS) + '\n\n[... data truncated ...]'
    : prompt;
}

export async function runDiscoveryAgent(
  dataset: DiscoveryDataset,
  interview?: InterviewContext,
  pdfDocuments?: ConnectorDocument[],
  resumeState?: {
    messages: LLMMessageParam[];
    systemPrompt: string;
    suggestions?: ProcessSuggestion[];
  },
  skipQuestions?: boolean,
): Promise<AgentResult> {
  const client = getAnthropic();
  const suggestions: ProcessSuggestion[] = resumeState?.suggestions ?? [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let questionCount = 0;

  if (resumeState?.messages) {
    for (const msg of resumeState.messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (
            typeof block === 'object' &&
            'type' in block &&
            block.type === 'tool_use' &&
            'name' in block &&
            block.name === 'ask_user'
          ) {
            questionCount++;
          }
        }
      }
    }
  }

  const interactive = !skipQuestions;
  const systemPrompt =
    resumeState?.systemPrompt ??
    buildSystemPrompt(
      dataset.source,
      interview,
      !!(pdfDocuments && pdfDocuments.length > 0),
      interactive,
    );

  let messages: LLMMessageParam[];
  if (resumeState?.messages) {
    messages = resumeState.messages;
  } else {
    const userContent: LLMContentBlockParam[] = [
      { type: 'text', text: formatDatasetForPrompt(dataset) },
    ];

    if (pdfDocuments && pdfDocuments.length > 0) {
      for (const doc of pdfDocuments) {
        userContent.push(toContentBlock(doc));
      }
    }

    messages = [{ role: 'user', content: userContent }];
  }

  const tools: LLMTool[] =
    interactive && questionCount < MAX_QUESTIONS
      ? [SUGGEST_PROCESS_TOOL, ASK_USER_TOOL]
      : [SUGGEST_PROCESS_TOOL];

  let continueLoop = true;
  while (continueLoop && suggestions.length < MAX_SUGGESTIONS) {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      tool_choice: { type: 'auto' },
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    const askUserBlocks = response.content.filter(
      (b): b is LLMToolUseBlock =>
        b.type === 'tool_use' && b.name === 'ask_user',
    );

    const suggestBlocks = response.content.filter(
      (b): b is LLMToolUseBlock =>
        b.type === 'tool_use' && b.name === 'suggest_process',
    );

    for (const block of suggestBlocks) {
      if (suggestions.length >= MAX_SUGGESTIONS) break;
      const input = block.input as ProcessSuggestion;
      if (input.name && Array.isArray(input.steps) && input.steps.length > 0) {
        suggestions.push(input);
      }
    }

    if (
      response.stop_reason === 'end_turn' ||
      response.stop_reason === 'max_tokens'
    ) {
      continueLoop = false;
    } else if (response.stop_reason === 'tool_use') {
      if (askUserBlocks.length > 0) {
        const questions = (askUserBlocks[0]!.input as { questions: string[] })
          .questions;
        messages.push({ role: 'assistant', content: response.content });

        const suggestResults: LLMToolResultBlockParam[] = suggestBlocks.map(
          (b) => ({
            type: 'tool_result' as const,
            tool_use_id: b.id,
            content: 'Suggestion recorded successfully.',
          }),
        );

        if (suggestResults.length > 0) {
          messages.push({ role: 'user', content: suggestResults });
        }

        logAgentTokens(totalInputTokens, totalOutputTokens);

        return {
          type: 'needs_input',
          questions,
          messages,
          suggestions,
          systemPrompt,
        };
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: LLMToolResultBlockParam[] = suggestBlocks.map((b) => ({
        type: 'tool_result' as const,
        tool_use_id: b.id,
        content: 'Suggestion recorded successfully.',
      }));

      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      } else {
        continueLoop = false;
      }
    } else {
      continueLoop = false;
    }
  }

  logAgentTokens(totalInputTokens, totalOutputTokens);

  return { type: 'completed', suggestions };
}

export function injectUserAnswer(
  messages: LLMMessageParam[],
  answer: string,
): LLMMessageParam[] {
  let askUserBlockId: string | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'tool_use' &&
          'name' in block &&
          block.name === 'ask_user'
        ) {
          askUserBlockId = (block as LLMToolUseBlock).id;
          break;
        }
      }
      if (askUserBlockId) break;
    }
  }

  if (!askUserBlockId) {
    throw new Error(
      'Cannot inject answer: no ask_user tool_use block found in messages',
    );
  }

  const answerResult: LLMToolResultBlockParam = {
    type: 'tool_result',
    tool_use_id: askUserBlockId,
    content: answer,
  };

  const lastMsg = messages[messages.length - 1]!;
  if (lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
    (lastMsg.content as LLMToolResultBlockParam[]).push(answerResult);
  } else {
    messages.push({ role: 'user', content: [answerResult] });
  }

  return messages;
}
