/**
 * In-memory registry of in-flight test-case runs.
 *
 * Each run has an EventEmitter that fans out progress events to SSE listeners
 * and a per-step `pendingHumanDecision` slot for interactive mode.
 *
 * Process-local. A horizontally scaled deployment of test-generator would
 * need a Redis-backed pubsub here — out of scope for the local-dev / single-
 * pod target this service is built for.
 */
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import type { SpanPayload } from '../lib/spans.js';

export type RunEvent =
  | { type: 'run_started'; run_id: string; trace_id: string; total_steps: number }
  | { type: 'step_started'; step_index: number; kind: string; name: string }
  | { type: 'step_completed'; step_index: number; span: SpanPayload }
  | { type: 'human_step_pending'; step_index: number; prompt: string; expected: 'approve' | 'reject' }
  | { type: 'run_completed'; run_id: string; trace_id: string; spans_emitted: number }
  | { type: 'run_failed'; run_id: string; error: string };

interface PendingHuman {
  resolve: (decision: { decision: 'approve' | 'reject'; reason?: string }) => void;
  stepIndex: number;
}

export interface RunState {
  id: string;
  testCaseId: string;
  tenantId: string;
  startedAt: Date;
  status: 'running' | 'completed' | 'failed';
  traceId?: string;
  emitter: EventEmitter;
  pendingHuman?: PendingHuman;
  history: RunEvent[];
}

const runs = new Map<string, RunState>();
const RUN_TTL_MS = 15 * 60 * 1000; // GC runs after 15 minutes

export function createRun(testCaseId: string, tenantId: string): RunState {
  const run: RunState = {
    id: crypto.randomUUID(),
    testCaseId,
    tenantId,
    startedAt: new Date(),
    status: 'running',
    emitter: new EventEmitter(),
    history: [],
  };
  runs.set(run.id, run);
  setTimeout(() => runs.delete(run.id), RUN_TTL_MS).unref();
  return run;
}

export function getRun(runId: string): RunState | undefined {
  return runs.get(runId);
}

export function emitEvent(run: RunState, event: RunEvent): void {
  run.history.push(event);
  run.emitter.emit('event', event);
  if (event.type === 'run_completed') {
    run.status = 'completed';
    if ('trace_id' in event) run.traceId = event.trace_id;
  } else if (event.type === 'run_failed') {
    run.status = 'failed';
  }
}

export function awaitHumanDecision(
  run: RunState,
  stepIndex: number,
): Promise<{ decision: 'approve' | 'reject'; reason?: string }> {
  return new Promise((resolve) => {
    run.pendingHuman = { resolve, stepIndex };
  });
}

export function resolveHumanDecision(
  run: RunState,
  decision: 'approve' | 'reject',
  reason?: string,
): boolean {
  if (!run.pendingHuman) return false;
  const { resolve } = run.pendingHuman;
  run.pendingHuman = undefined;
  resolve({ decision, reason });
  return true;
}
