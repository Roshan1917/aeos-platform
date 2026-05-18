/**
 * Discovery runs:
 *   POST   /v1/discovery/connectors/:id/run     — trigger fire-and-forget run
 *   GET    /v1/discovery/runs/:runId            — run status + ephemeral progress
 *   POST   /v1/discovery/runs/:runId/answer     — answer interactive question(s)
 *   POST   /v1/discovery/runs/:runId/skip       — skip remaining questions
 */
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import {
  executeDiscoveryRun,
  resumeDiscoveryRun,
  skipDiscoveryQuestions,
  getRunProgress,
} from '../services/discovery-orchestrator.js';
import type { InterviewContext } from '../agents/process-discovery-agent.js';
import { logError } from '../lib/logger.js';

export const runsRouter: ExpressRouter = Router();
export const connectorRunRouter: ExpressRouter = Router();

const interviewSchema = z
  .object({
    company_context: z.string().default(''),
    process_depth: z.enum(['focused', 'broad']).default('broad'),
    detail_level: z.enum(['high-level', 'moderate', 'detailed']).default('moderate'),
  })
  .partial();

const triggerSchema = z.object({
  interactive: z.boolean().default(true),
  company_context: z.string().optional(),
  process_depth: z.enum(['focused', 'broad']).optional(),
  detail_level: z.enum(['high-level', 'moderate', 'detailed']).optional(),
  interview: interviewSchema.optional(),
});

const answerSchema = z.object({
  answer: z.string().min(1).optional(),
  answers: z.array(z.string()).min(1).optional(),
});

connectorRunRouter.post('/:id/run', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const parsed = triggerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  const conn = await prisma.discoveryConnector.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!conn) return res.status(404).json({ error: 'not_found' });

  const interview: InterviewContext | undefined =
    parsed.data.interview || parsed.data.company_context !== undefined
      ? {
          company_context:
            parsed.data.interview?.company_context ?? parsed.data.company_context ?? '',
          process_depth:
            parsed.data.interview?.process_depth ?? parsed.data.process_depth ?? 'broad',
          detail_level:
            parsed.data.interview?.detail_level ?? parsed.data.detail_level ?? 'moderate',
        }
      : undefined;

  const run = await prisma.discoveryRun.create({
    data: {
      tenantId: req.auth.tenantId,
      connectorId: conn.id,
      status: 'pending',
    },
  });

  // Fire-and-forget — orchestrator handles its own error capture and DB updates.
  void executeDiscoveryRun(run.id, req.auth.tenantId, interview).catch((err) => {
    logError(`run ${run.id} crashed`, err);
  });

  return res.status(202).json({ id: run.id, status: run.status });
});

runsRouter.get('/:runId', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const run = await prisma.discoveryRun.findFirst({
    where: { id: req.params['runId']!, tenantId: req.auth.tenantId },
  });
  if (!run) return res.status(404).json({ error: 'not_found' });

  const progress = await getRunProgress(run.id);
  return res.json({
    id: run.id,
    tenant_id: run.tenantId,
    connector_id: run.connectorId,
    status: run.status,
    started_at: run.startedAt?.toISOString() ?? null,
    completed_at: run.completedAt?.toISOString() ?? null,
    error: run.error,
    data_summary: run.dataSummary,
    interaction: run.interaction,
    progress,
    created_at: run.createdAt.toISOString(),
  });
});

runsRouter.post('/:runId/answer', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const parsed = answerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  const run = await prisma.discoveryRun.findFirst({
    where: { id: req.params['runId']!, tenantId: req.auth.tenantId },
  });
  if (!run) return res.status(404).json({ error: 'not_found' });
  if (run.status !== 'waiting_for_input') {
    return res.status(409).json({
      error: 'invalid_state',
      message: `Run is ${run.status}, cannot accept answer.`,
    });
  }

  const answers = parsed.data.answers;
  const answer =
    parsed.data.answer ?? (answers && answers.length > 0 ? answers.join('\n\n') : '');
  if (!answer) {
    return res.status(400).json({ error: 'invalid_request', message: 'answer or answers[] required' });
  }

  void resumeDiscoveryRun(run.id, req.auth.tenantId, answer, answers).catch((err) => {
    logError(`run ${run.id} resume crashed`, err);
  });

  return res.status(202).json({ id: run.id, status: 'running' });
});

runsRouter.post('/:runId/skip', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const run = await prisma.discoveryRun.findFirst({
    where: { id: req.params['runId']!, tenantId: req.auth.tenantId },
  });
  if (!run) return res.status(404).json({ error: 'not_found' });
  if (run.status !== 'waiting_for_input') {
    return res.status(409).json({
      error: 'invalid_state',
      message: `Run is ${run.status}, cannot skip.`,
    });
  }

  void skipDiscoveryQuestions(run.id, req.auth.tenantId).catch((err) => {
    logError(`run ${run.id} skip crashed`, err);
  });

  return res.status(202).json({ id: run.id, status: 'running' });
});
