/**
 * Suggestion management:
 *   GET    /v1/discovery/runs/:runId/suggestions
 *   PATCH  /v1/discovery/suggestions/:id          (status, proposed_steps)
 *   POST   /v1/discovery/suggestions/:id/refine   (LLM refinement)
 *   POST   /v1/discovery/suggestions/:id/apply    (push canonical Process to substrate)
 *   POST   /v1/discovery/suggestions/:id/questions (analysis Q-gen)
 *   POST   /v1/discovery/suggestions/:id/analyze  (analysis run)
 */
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { Prisma } from '../../prisma/generated/index.js';
import { prisma } from '../db/prisma.js';
import { runRefinementAgent, type RefinementChatMessage } from '../agents/refinement-agent.js';
import {
  generateAnalysisQuestions,
  runAnalysis,
  type AnalysisQAPair,
} from '../agents/automation-analysis-agent.js';
import type { ProposedStep } from '../types.js';
import { createProcessOnSubstrate } from '../services/substrate-client.js';
import { logError } from '../lib/logger.js';

export const suggestionsRouter: ExpressRouter = Router();
export const runSuggestionsRouter: ExpressRouter = Router();

function serialize(s: {
  id: string;
  tenantId: string;
  runId: string;
  name: string;
  description: string | null;
  proposedSteps: unknown;
  status: string;
  processId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: s.id,
    tenant_id: s.tenantId,
    run_id: s.runId,
    name: s.name,
    description: s.description,
    proposed_steps: s.proposedSteps,
    status: s.status,
    process_id: s.processId,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
  };
}

runSuggestionsRouter.get('/:runId/suggestions', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const run = await prisma.discoveryRun.findFirst({
    where: { id: req.params['runId']!, tenantId: req.auth.tenantId },
    select: { id: true },
  });
  if (!run) return res.status(404).json({ error: 'not_found' });

  const status = req.query['status'];
  const where: Prisma.DiscoverySuggestionWhereInput = {
    runId: run.id,
    tenantId: req.auth.tenantId,
  };
  if (typeof status === 'string') {
    where.status = status;
  }

  const rows = await prisma.discoverySuggestion.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return res.json({ data: rows.map(serialize) });
});

const proposedStepSchema = z.object({
  name: z.string().min(1),
  step_type: z.enum(['task', 'decision', 'subprocess']),
  description: z.string().default(''),
  automation_potential: z.number().int().min(0).max(100).optional(),
  analysis_result: z
    .object({
      automation_potential: z.number().int().min(0).max(100),
      recommendation: z.string(),
    })
    .optional(),
});

const updateSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  proposed_steps: z.array(proposedStepSchema).optional(),
});

suggestionsRouter.patch('/:id', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  if (!parsed.data.status && !parsed.data.proposed_steps) {
    return res
      .status(400)
      .json({ error: 'invalid_request', message: 'status or proposed_steps required' });
  }

  const sug = await prisma.discoverySuggestion.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!sug) return res.status(404).json({ error: 'not_found' });
  if (sug.status === 'applied') {
    return res.status(409).json({ error: 'conflict', message: 'Cannot change an applied suggestion.' });
  }

  const updated = await prisma.discoverySuggestion.update({
    where: { id: sug.id },
    data: {
      status: parsed.data.status,
      proposedSteps:
        parsed.data.proposed_steps !== undefined
          ? (parsed.data.proposed_steps as unknown as Prisma.InputJsonValue)
          : undefined,
    },
  });
  return res.json(serialize(updated));
});

const refineSchema = z.object({
  user_prompt: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() }))
    .default([]),
  current_steps: z.array(proposedStepSchema),
});

suggestionsRouter.post('/:id/refine', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const parsed = refineSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  const sug = await prisma.discoverySuggestion.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!sug) return res.status(404).json({ error: 'not_found' });
  if (sug.status === 'rejected' || sug.status === 'applied') {
    return res
      .status(409)
      .json({ error: 'conflict', message: `Cannot refine a ${sug.status} suggestion.` });
  }

  try {
    const result = await runRefinementAgent(
      { name: sug.name, description: sug.description, steps: parsed.data.current_steps as ProposedStep[] },
      parsed.data.history as RefinementChatMessage[],
      parsed.data.user_prompt,
    );
    return res.json({
      refined_steps: result.refined_steps,
      assistant_reply: result.assistant_reply,
    });
  } catch (err: unknown) {
    logError(`suggestion ${sug.id} refine failed`, err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'agent_failed', message: msg });
  }
});

const applySchema = z.object({
  uop_id: z.string().min(1),
});

suggestionsRouter.post('/:id/apply', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const parsed = applySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  const sug = await prisma.discoverySuggestion.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!sug) return res.status(404).json({ error: 'not_found' });
  if (sug.status === 'applied') {
    return res.status(409).json({ error: 'conflict', message: 'Already applied.' });
  }
  if (sug.status === 'rejected') {
    return res.status(409).json({ error: 'conflict', message: 'Cannot apply a rejected suggestion.' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'unauthenticated' });
  }

  const proposedSteps = Array.isArray(sug.proposedSteps)
    ? (sug.proposedSteps as unknown as ProposedStep[])
    : [];

  let process;
  try {
    process = await createProcessOnSubstrate({
      tenantId: req.auth.tenantId,
      authorization: authHeader,
      uopId: parsed.data.uop_id,
      name: sug.name,
      description: sug.description,
      proposedSteps,
    });
  } catch (err: unknown) {
    logError(`suggestion ${sug.id} apply failed`, err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: 'substrate_error', message: msg });
  }

  const updated = await prisma.discoverySuggestion.update({
    where: { id: sug.id },
    data: { status: 'applied', processId: process.id },
  });
  return res.json({ ...serialize(updated), process });
});

suggestionsRouter.post('/:id/questions', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const sug = await prisma.discoverySuggestion.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!sug) return res.status(404).json({ error: 'not_found' });

  const steps = Array.isArray(sug.proposedSteps)
    ? (sug.proposedSteps as unknown as ProposedStep[])
    : [];

  try {
    const questions = await generateAnalysisQuestions({
      name: sug.name,
      description: sug.description,
      steps,
    });
    return res.json({ questions });
  } catch (err: unknown) {
    logError(`suggestion ${sug.id} question-gen failed`, err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'agent_failed', message: msg });
  }
});

const analyzeSchema = z.object({
  qaPairs: z.array(z.object({ question: z.string(), answer: z.string() })).min(1),
});

suggestionsRouter.post('/:id/analyze', async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'unauthenticated' });
  const parsed = analyzeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  const sug = await prisma.discoverySuggestion.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!sug) return res.status(404).json({ error: 'not_found' });

  const steps = Array.isArray(sug.proposedSteps)
    ? (sug.proposedSteps as unknown as ProposedStep[])
    : [];

  try {
    const results = await runAnalysis(
      { name: sug.name, description: sug.description, steps },
      parsed.data.qaPairs as AnalysisQAPair[],
    );
    return res.json({ results });
  } catch (err: unknown) {
    logError(`suggestion ${sug.id} analyze failed`, err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'agent_failed', message: msg });
  }
});
