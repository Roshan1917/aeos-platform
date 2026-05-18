/**
 * Discovery Orchestrator — runs a single discovery execution.
 *
 * Supports interactive discovery: the agent can pause to ask the user
 * questions, then resume when answers arrive. Conversation state is
 * stored in Redis (24h TTL).
 *
 * Ported from fuzebox-intelligence/discovery-service (was discovery-service.ts).
 */

import { Prisma } from '../../prisma/generated/index.js';
import { prisma } from '../db/prisma.js';
import { getRedis } from '../lib/redis.js';
import { logInfo, logError } from '../lib/logger.js';
import { DocumentOnlyConnector } from '../connectors/document-only.js';
import { loadDocumentsForRun } from './connector-document-service.js';
import {
  runDiscoveryAgent,
  injectUserAnswer,
  type InterviewContext,
  type AgentResult,
  type InteractionState,
} from '../agents/process-discovery-agent.js';
import { scoreAutomationPotential } from '../agents/automation-scoring-agent.js';
import type {
  ConnectorDocument,
  DiscoveryDataset,
  ProcessSuggestion,
} from '../types.js';

const REDIS_STATE_PREFIX = 'discovery:run:';
const REDIS_STATE_TTL = 24 * 60 * 60; // 24h
const PROGRESS_TTL = 600;

function stateKey(runId: string): string {
  return `${REDIS_STATE_PREFIX}${runId}:state`;
}

export function progressKey(runId: string): string {
  return `${REDIS_STATE_PREFIX}${runId}:progress`;
}

async function setRunProgress(runId: string, step: string, message: string): Promise<void> {
  try {
    await getRedis().set(
      progressKey(runId),
      JSON.stringify({ step, message, timestamp: new Date().toISOString() }),
      'EX',
      PROGRESS_TTL,
    );
  } catch {
    /* best-effort */
  }
}

async function clearRunProgress(runId: string): Promise<void> {
  try {
    await getRedis().del(progressKey(runId));
  } catch {
    /* best-effort */
  }
}

async function saveAgentState(runId: string, state: object): Promise<void> {
  await getRedis().set(stateKey(runId), JSON.stringify(state), 'EX', REDIS_STATE_TTL);
}

async function loadAgentState(runId: string): Promise<object | null> {
  const raw = await getRedis().get(stateKey(runId));
  if (!raw) return null;
  return JSON.parse(raw);
}

async function clearAgentState(runId: string): Promise<void> {
  await getRedis().del(stateKey(runId));
}

export async function getRunProgress(runId: string): Promise<unknown | null> {
  try {
    const raw = await getRedis().get(progressKey(runId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function executeDiscoveryRun(
  runId: string,
  tenantId: string,
  interview?: InterviewContext,
): Promise<void> {
  const startTime = Date.now();

  await prisma.discoveryRun.update({
    where: { id: runId },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    const run = await prisma.discoveryRun.findFirst({
      where: { id: runId, tenantId },
      include: { connector: true },
    });
    if (!run) throw new Error(`Discovery run ${runId} not found`);

    const connector = run.connector;
    if (connector.connectorType !== 'document_only') {
      throw new Error(
        `Unsupported connector_type '${connector.connectorType}'. Only 'document_only' is enabled in v1.`,
      );
    }

    logInfo(`run ${runId} started (connector=${connector.name}, type=${connector.connectorType})`);

    await setRunProgress(runId, 'connecting', `Loading documents for connector ${connector.name}...`);

    const connectorImpl = new DocumentOnlyConnector(
      (connector.config as Record<string, unknown>) ?? {},
    );
    const dataset = await connectorImpl.fetchData();
    const summary = connectorImpl.buildSummary(dataset);

    await prisma.discoveryRun.update({
      where: { id: runId },
      data: { dataSummary: summary as Prisma.InputJsonValue },
    });

    const pdfDocuments: ConnectorDocument[] = await loadDocumentsForRun(connector.id);
    if (pdfDocuments.length === 0) {
      throw new Error(
        'No documents uploaded for this connector. Upload at least one document before triggering a run.',
      );
    }

    const totalMb = (
      pdfDocuments.reduce((sum, d) => sum + d.size_bytes, 0) /
      (1024 * 1024)
    ).toFixed(1);
    logInfo(`run ${runId} loaded ${pdfDocuments.length} document(s), ${totalMb} MB`);

    await setRunProgress(runId, 'analyzing', 'Analyzing documents and generating suggestions...');
    const result = await runDiscoveryAgent(dataset, interview, pdfDocuments);

    await handleAgentResult(runId, tenantId, result, dataset, interview, pdfDocuments, startTime);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError(`run ${runId} failed`, err);
    try {
      await prisma.discoveryRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          error: errorMsg.slice(0, 2000),
        },
      });
    } catch {
      /* swallow */
    } finally {
      await clearRunProgress(runId);
    }
  }
}

export async function resumeDiscoveryRun(
  runId: string,
  tenantId: string,
  answer: string,
  individualAnswers?: string[],
): Promise<void> {
  const startTime = Date.now();

  try {
    const saved = await loadAgentState(runId);
    if (!saved) {
      throw new Error('Discovery run session has expired. Please trigger a new run.');
    }

    const { messages, systemPrompt, suggestions, dataset, interview, pdfDocuments } = saved as {
      messages: unknown[];
      systemPrompt: string;
      suggestions: ProcessSuggestion[];
      dataset: DiscoveryDataset;
      interview?: InterviewContext;
      pdfDocuments?: ConnectorDocument[];
    };

    const runRow = await prisma.discoveryRun.findFirst({
      where: { id: runId, tenantId },
    });
    const interaction: InteractionState =
      (runRow?.interaction as unknown as InteractionState | null) ?? {
        history: [],
        current_question: null,
        question_round: 0,
      };

    const pending = interaction.pending_questions;
    if (individualAnswers && pending && pending.length > 0) {
      const now = new Date().toISOString();
      for (let i = 0; i < individualAnswers.length; i++) {
        if (i > 0 && i < pending.length) {
          interaction.history.push({ role: 'assistant', text: pending[i]!, timestamp: now });
        }
        interaction.history.push({ role: 'user', text: individualAnswers[i]!, timestamp: now });
      }
    } else {
      interaction.history.push({
        role: 'user',
        text: answer,
        timestamp: new Date().toISOString(),
      });
    }
    interaction.current_question = null;
    delete interaction.pending_questions;

    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'running',
        interaction: interaction as unknown as Prisma.InputJsonValue,
      },
    });

    await setRunProgress(runId, 'analyzing', 'Analyzing your answers and generating suggestions...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedMessages = injectUserAnswer(messages as any, answer);

    const result = await runDiscoveryAgent(
      dataset,
      interview,
      pdfDocuments,
      { messages: updatedMessages, systemPrompt, suggestions },
    );

    await handleAgentResult(runId, tenantId, result, dataset, interview, pdfDocuments, startTime);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError(`run ${runId} resume failed`, err);
    try {
      await clearAgentState(runId);
      await prisma.discoveryRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          error: errorMsg.slice(0, 2000),
        },
      });
    } catch {
      /* swallow */
    } finally {
      await clearRunProgress(runId);
    }
  }
}

export async function skipDiscoveryQuestions(runId: string, tenantId: string): Promise<void> {
  const startTime = Date.now();

  try {
    const saved = await loadAgentState(runId);
    if (!saved) {
      throw new Error('Discovery run session has expired. Please trigger a new run.');
    }

    const { messages, systemPrompt, suggestions, dataset, interview, pdfDocuments } = saved as {
      messages: unknown[];
      systemPrompt: string;
      suggestions: ProcessSuggestion[];
      dataset: DiscoveryDataset;
      interview?: InterviewContext;
      pdfDocuments?: ConnectorDocument[];
    };

    const runRow = await prisma.discoveryRun.findFirst({
      where: { id: runId, tenantId },
    });
    const interaction: InteractionState =
      (runRow?.interaction as unknown as InteractionState | null) ?? {
        history: [],
        current_question: null,
        question_round: 0,
      };

    interaction.current_question = null;

    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'running',
        interaction: interaction as unknown as Prisma.InputJsonValue,
      },
    });

    await setRunProgress(runId, 'analyzing', 'Generating suggestions with current information...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedMessages = injectUserAnswer(
      messages as any,
      'The user chose to skip further questions. Proceed directly to generating process suggestions with the information you already have.',
    );

    const result = await runDiscoveryAgent(
      dataset,
      interview,
      pdfDocuments,
      { messages: updatedMessages, systemPrompt, suggestions },
      true,
    );

    await handleAgentResult(runId, tenantId, result, dataset, interview, pdfDocuments, startTime);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError(`run ${runId} skip failed`, err);
    try {
      await clearAgentState(runId);
      await prisma.discoveryRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          error: errorMsg.slice(0, 2000),
        },
      });
    } catch {
      /* swallow */
    } finally {
      await clearRunProgress(runId);
    }
  }
}

async function handleAgentResult(
  runId: string,
  tenantId: string,
  result: AgentResult,
  dataset: DiscoveryDataset,
  interview: InterviewContext | undefined,
  pdfDocuments: ConnectorDocument[] | undefined,
  startTime: number,
): Promise<void> {
  if (result.type === 'completed') {
    await clearAgentState(runId);

    logInfo(`run ${runId} produced ${result.suggestions.length} suggestion(s)`);

    let scoredSuggestions = result.suggestions;
    if (result.suggestions.length > 0) {
      await setRunProgress(
        runId,
        'scoring',
        `Scoring automation potential for ${result.suggestions.length} suggestion(s)...`,
      );
      try {
        scoredSuggestions = await scoreAutomationPotential(
          result.suggestions,
          interview?.company_context,
        );
      } catch (err) {
        logError(`automation scoring failed (non-fatal)`, err);
      }
    }

    await setRunProgress(runId, 'saving', 'Saving results...');
    await prisma.$transaction(async (tx) => {
      if (scoredSuggestions.length > 0) {
        await tx.discoverySuggestion.createMany({
          data: scoredSuggestions.map((s) => ({
            tenantId,
            runId,
            name: s.name,
            description: s.description ?? null,
            proposedSteps: s.steps as unknown as Prisma.InputJsonValue,
            status: 'pending',
          })),
        });
      }

      await tx.discoveryRun.update({
        where: { id: runId },
        data: { status: 'completed', completedAt: new Date() },
      });
    });

    await clearRunProgress(runId);
    logInfo(`run ${runId} complete in ${Date.now() - startTime}ms`);
  } else if (result.type === 'needs_input') {
    await clearRunProgress(runId);

    const runRow = await prisma.discoveryRun.findFirst({
      where: { id: runId, tenantId },
    });
    const interaction: InteractionState =
      (runRow?.interaction as unknown as InteractionState | null) ?? {
        history: [],
        current_question: null,
        question_round: 0,
      };

    interaction.history.push({
      role: 'assistant',
      text: result.questions[0]!,
      timestamp: new Date().toISOString(),
    });
    interaction.current_question = result.questions[0]!;
    interaction.pending_questions = result.questions;
    interaction.question_round += 1;

    await saveAgentState(runId, {
      messages: result.messages,
      systemPrompt: result.systemPrompt,
      suggestions: result.suggestions,
      dataset,
      interview,
      pdfDocuments,
    });

    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'waiting_for_input',
        interaction: interaction as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
