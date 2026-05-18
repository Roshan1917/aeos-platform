import { Link, useParams } from 'react-router-dom';

import { useAgent } from '../hooks/useAgents';
import { useSpans } from '../hooks/useSpans';
import { KindBadge } from '../components/KindBadge';

export function AgentDetail() {
  const { id } = useParams();
  const agent = useAgent(id);
  const spans = useSpans({ agent_id: id, limit: 20 });

  if (agent.isLoading) return <div className="text-sm text-ink-muted">Loading…</div>;
  if (!agent.data) return <div className="text-sm text-red-600">Agent not found.</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/agents" className="text-xs text-brand hover:underline">
          ← back to Agents
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{agent.data.name}</h1>
        <p className="text-sm text-ink-muted">
          {agent.data.vendor_runtime} · {agent.data.model_provider}/{agent.data.model_id}
          {agent.data.framework ? ` · ${agent.data.framework}` : ''}
        </p>
      </div>

      <div className="card p-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Agent ID">
            <span className="font-mono text-xs">{agent.data.id}</span>
          </Field>
          <Field label="Status">
            <span className="capitalize">{agent.data.status}</span>
          </Field>
          <Field label="Description" full>
            {agent.data.description ?? '—'}
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <h2 className="text-sm font-semibold">Recent spans</h2>
          <Link to={`/telemetry?agent_id=${id}`} className="text-xs text-brand hover:underline">
            View all →
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {spans.isLoading && <div className="px-4 py-6 text-sm text-ink-muted text-center">Loading…</div>}
          {spans.data && spans.data.spans.length === 0 && (
            <div className="px-4 py-6 text-sm text-ink-muted text-center">No spans recorded for this agent yet.</div>
          )}
          {spans.data?.spans.map((s) => (
            <Link key={s.span_id} to={`/traces/${s.trace_id}`} className="block px-4 py-2 hover:bg-canvas-subtle">
              <div className="flex items-center gap-3">
                <KindBadge kind={s.kind} />
                <div className="font-mono text-xs flex-1 truncate">{s.name}</div>
                <div className="tabular-nums text-xs text-ink-muted">
                  {new Date(s.start_time).toLocaleString()}
                </div>
                <div className="tabular-nums text-xs text-ink-muted">{s.duration_ms.toFixed(0)} ms</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
