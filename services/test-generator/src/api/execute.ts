/**
 * Execution lifecycle:
 *
 *   POST /v1/test-cases/:id/execute        — kick off a run, returns { run_id }
 *   GET  /v1/runs/:run_id                  — current state + history
 *   GET  /v1/runs/:run_id/events           — SSE stream of run progress
 *   POST /v1/runs/:run_id/decisions        — supply human approve/reject
 *
 * The execute call returns immediately; the actual work happens in the
 * background (executor.ts). Clients follow progress via SSE.
 */
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { executeRequestSchema, testCasePlanSchema } from '../lib/schema.js';
import { prisma } from '../db/prisma.js';
import { executeTestCase } from '../runtime/executor.js';
import {
  createRun,
  getRun,
  resolveHumanDecision,
} from '../runtime/runs.js';

export const executeRouter: ExpressRouter = Router();

executeRouter.post('/test-cases/:id/execute', async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const parsedBody = executeRequestSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: 'invalid_request', details: parsedBody.error.flatten() });
    return;
  }
  const row = await prisma.testCase.findFirst({
    where: { id: req.params['id']!, tenantId: req.auth.tenantId },
  });
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const plan = testCasePlanSchema.parse(row.planJson);
  const token = (req.headers['authorization'] ?? '').slice(7);
  const run = createRun(row.id, req.auth.tenantId);

  // Fire-and-forget — caller follows progress via SSE.
  void executeTestCase(run, plan, {
    mode: parsedBody.data.mode,
    humanMode: parsedBody.data.human_mode,
    token,
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    roles: req.auth.roles,
  });

  res.status(202).json({
    run_id: run.id,
    test_case_id: row.id,
    mode: parsedBody.data.mode,
    human_mode: parsedBody.data.human_mode,
  });
});

executeRouter.get('/runs/:run_id', (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const run = getRun(req.params['run_id']!);
  if (!run || run.tenantId !== req.auth.tenantId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({
    id: run.id,
    test_case_id: run.testCaseId,
    status: run.status,
    started_at: run.startedAt.toISOString(),
    trace_id: run.traceId,
    history: run.history,
    awaiting_human: run.pendingHuman?.stepIndex ?? null,
  });
});

executeRouter.get('/runs/:run_id/events', (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const run = getRun(req.params['run_id']!);
  if (!run || run.tenantId !== req.auth.tenantId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Replay history first so late subscribers don't miss events.
  for (const event of run.history) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  if (run.status !== 'running') {
    res.end();
    return;
  }

  const onEvent = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      ((event as { type: string }).type === 'run_completed' ||
        (event as { type: string }).type === 'run_failed')
    ) {
      cleanup();
      res.end();
    }
  };

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  const cleanup = () => {
    clearInterval(heartbeat);
    run.emitter.off('event', onEvent);
  };

  run.emitter.on('event', onEvent);
  req.on('close', cleanup);
});

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(200).optional(),
});

executeRouter.post('/runs/:run_id/decisions', (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const run = getRun(req.params['run_id']!);
  if (!run || run.tenantId !== req.auth.tenantId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    return;
  }
  if (!run.pendingHuman) {
    res.status(409).json({ error: 'no_pending_decision' });
    return;
  }
  const ok = resolveHumanDecision(run, parsed.data.decision, parsed.data.reason);
  res.status(ok ? 202 : 409).json({ accepted: ok });
});
