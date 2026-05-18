import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import { useTestCase } from '../hooks/useTestCases';
import { useAuthStore } from '../lib/auth';
import {
  executeTestCase,
  postHumanDecision,
  type HumanMode,
  type RunEvent,
  type RunMode,
} from '../lib/clients/testGenerator';
import { PlanStepList } from './TestCases';

export function TestCaseDetail() {
  const { id } = useParams<{ id: string }>();
  const tc = useTestCase(id);
  const navigate = useNavigate();

  const [mode, setMode] = useState<RunMode>('synthetic');
  const [humanMode, setHumanMode] = useState<HumanMode>('auto');
  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [pendingHuman, setPendingHuman] = useState<{
    stepIndex: number;
    prompt: string;
    expected: 'approve' | 'reject';
  } | null>(null);
  const [completedTraceId, setCompletedTraceId] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => () => eventSourceRef.current?.close(), []);

  const onRun = async () => {
    if (!id) return;
    if (
      mode === 'live' &&
      !confirm(
        'Live mode makes real calls to Anthropic. Each LLM step will incur API cost. Continue?',
      )
    ) {
      return;
    }
    try {
      const start = await executeTestCase(id, { mode, human_mode: humanMode });
      setRunId(start.run_id);
      setEvents([]);
      setCompletedTraceId(null);
      setPendingHuman(null);
      openEventStream(start.run_id);
      toast.success(`Run ${start.run_id.slice(0, 8)} started`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'execute failed';
      toast.error(message);
    }
  };

  const openEventStream = (runId: string) => {
    eventSourceRef.current?.close();
    // EventSource has no header injection — pass token via query param-style URL
    // is not possible here either; the same-origin proxy carries cookies if any.
    // Local dev relies on HS256 JWT in Authorization header → SSE auth is done
    // through a fetch+ReadableStream below instead of native EventSource.
    void streamEvents(runId, useAuthStore.getState().accessToken);
  };

  const streamEvents = async (runId: string, token: string | null) => {
    if (!token) {
      toast.error('not authenticated');
      return;
    }
    const res = await fetch(`/api/test-generator/v1/runs/${runId}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok || !res.body) {
      toast.error(`SSE failed: ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const block of lines) {
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        const payload = dataLine.slice(6);
        if (!payload) continue;
        try {
          const event = JSON.parse(payload) as RunEvent;
          handleEvent(event);
        } catch {
          // ignore non-JSON heartbeats
        }
      }
    }
  };

  const handleEvent = (event: RunEvent) => {
    setEvents((prev) => [...prev, event]);
    switch (event.type) {
      case 'human_step_pending':
        setPendingHuman({
          stepIndex: event.step_index,
          prompt: event.prompt,
          expected: event.expected,
        });
        break;
      case 'run_completed':
        setCompletedTraceId(event.trace_id);
        toast.success('Run complete');
        break;
      case 'run_failed':
        toast.error(`Run failed: ${event.error}`);
        break;
    }
  };

  const onDecision = async (decision: 'approve' | 'reject') => {
    if (!runId) return;
    try {
      await postHumanDecision(runId, decision);
      setPendingHuman(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'decision failed';
      toast.error(message);
    }
  };

  if (tc.isLoading) return <div className="text-sm text-ink-muted">Loading…</div>;
  if (tc.isError || !tc.data) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-red-600">Test case not found.</div>
        <button onClick={() => navigate('/test-cases')} className="btn-ghost text-xs">
          Back
        </button>
      </div>
    );
  }

  const row = tc.data;
  const plan = row.plan;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/test-cases" className="text-xs text-brand hover:underline">
            ← All test cases
          </Link>
          <h1 className="text-xl font-semibold mt-1">{row.title}</h1>
          <p className="text-sm text-ink-muted">{row.description}</p>
        </div>
      </div>

      <section className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Plan</div>
        <PlanStepList steps={plan.steps} />
      </section>

      <section className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Execute</div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <ModeToggle
            label="Mode"
            value={mode}
            onChange={(v) => setMode(v as RunMode)}
            options={[
              { value: 'synthetic', label: 'Synthetic' },
              { value: 'live', label: 'Live (real Claude)' },
            ]}
          />
          <ModeToggle
            label="Human steps"
            value={humanMode}
            onChange={(v) => setHumanMode(v as HumanMode)}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'interactive', label: 'Interactive' },
            ]}
          />
          <button onClick={onRun} className="btn-primary text-xs">
            Run
          </button>
        </div>
        {mode === 'live' && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Live mode calls the Anthropic API for every <code>llm_call</code> step. This
            costs money — synthetic mode is recommended for routine testing.
          </div>
        )}
      </section>

      {runId && (
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Run {runId.slice(0, 8)}</div>
            {completedTraceId && (
              <Link
                to={`/traces/${completedTraceId}`}
                className="text-xs text-brand hover:underline"
              >
                View trace waterfall →
              </Link>
            )}
          </div>
          <ol className="divide-y divide-gray-200 rounded border border-gray-200 bg-white text-xs">
            {events.map((e, i) => (
              <li key={i} className="px-3 py-1.5 font-mono">
                <span className="text-ink-muted">{e.type}</span>
                {' · '}
                {summariseEvent(e)}
              </li>
            ))}
            {events.length === 0 && (
              <li className="px-3 py-2 text-ink-muted">Waiting for events…</li>
            )}
          </ol>
        </section>
      )}

      {pendingHuman && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <div className="card max-w-md w-full p-5 space-y-3">
            <div className="text-sm font-semibold">Human approval requested</div>
            <div className="text-sm">{pendingHuman.prompt}</div>
            <div className="text-xs text-ink-muted">
              Plan expected: <span className="font-mono">{pendingHuman.expected}</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => onDecision('reject')} className="btn-ghost text-xs">
                Reject
              </button>
              <button onClick={() => onDecision('approve')} className="btn-primary text-xs">
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeToggle({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-muted">{label}:</span>
      <div className="inline-flex rounded border border-gray-200 overflow-hidden">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={
              value === o.value
                ? 'bg-brand text-white px-2 py-1'
                : 'bg-white text-ink-subtle px-2 py-1 hover:bg-canvas-subtle'
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function summariseEvent(e: RunEvent): string {
  switch (e.type) {
    case 'run_started':
      return `trace ${e.trace_id.slice(0, 16)}… · ${e.total_steps} steps`;
    case 'step_started':
      return `step ${e.step_index} ${e.kind} ${e.name}`;
    case 'step_completed':
      return `step ${e.step_index} ✓`;
    case 'human_step_pending':
      return `step ${e.step_index} awaiting human (expected ${e.expected})`;
    case 'run_completed':
      return `${e.spans_emitted} spans emitted`;
    case 'run_failed':
      return `error: ${e.error}`;
  }
}
