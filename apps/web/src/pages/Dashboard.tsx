import { Link } from 'react-router-dom';

import { StatCard } from '../components/StatCard';
import { KindBadge } from '../components/KindBadge';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';
import { useAgents } from '../hooks/useAgents';
import { useUops } from '../hooks/useUops';
import { useProcesses } from '../hooks/useProcesses';
import { useSpans } from '../hooks/useSpans';
import { useRecommendations } from '../hooks/useRecommendations';

export function Dashboard() {
  const agents = useAgents();
  const uops = useUops();
  const processes = useProcesses();
  const recentSpans = useSpans({ limit: 8 });
  const openRecs = useRecommendations({ status: 'open', limit: 5 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-ink-muted">Snapshot of agents, UoPs, processes and recent activity.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Agents" value={fmt(agents.data?.length)} hint={statusSummary(agents.data)} />
        <StatCard label="Units of Potential" value={fmt(uops.data?.length)} hint="active baselines" />
        <StatCard label="Processes" value={fmt(processes.data?.length)} hint="DAG workflows" />
        <StatCard
          label="Open recommendations"
          value={fmt(openRecs.data?.recommendations.length)}
          hint="awaiting triage"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <h2 className="text-sm font-semibold">Recent spans</h2>
            <Link to="/telemetry" className="text-xs text-brand hover:underline">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentSpans.isLoading && <Loading />}
            {recentSpans.data && recentSpans.data.spans.length === 0 && (
              <div className="px-4 py-6 text-sm text-ink-muted text-center">No spans ingested yet.</div>
            )}
            {recentSpans.data?.spans.map((s) => (
              <div key={s.span_id} className="px-4 py-2 text-sm flex items-center gap-3">
                <KindBadge kind={s.kind} />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{s.name}</div>
                  <div className="text-xs text-ink-muted truncate">{s.span_id}</div>
                </div>
                <div className="tabular-nums text-xs text-ink-muted">{s.duration_ms.toFixed(0)} ms</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <h2 className="text-sm font-semibold">Open recommendations</h2>
            <Link to="/recommendations" className="text-xs text-brand hover:underline">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {openRecs.isLoading && <Loading />}
            {openRecs.data && openRecs.data.recommendations.length === 0 && (
              <div className="px-4 py-6 text-sm text-ink-muted text-center">No open recommendations. Nice.</div>
            )}
            {openRecs.data?.recommendations.map((r) => (
              <Link
                key={r.id}
                to={`/recommendations/${r.id}`}
                className="block px-4 py-2 hover:bg-canvas-subtle"
              >
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={r.priority} />
                  <div className="text-sm font-medium flex-1 min-w-0 truncate">{r.title}</div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-1 text-xs text-ink-muted truncate">{r.template_id}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function fmt(n: number | undefined): string {
  return n === undefined ? '—' : String(n);
}

function statusSummary(rows: { status: string }[] | undefined): string {
  if (!rows) return '';
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ');
}

function Loading() {
  return <div className="px-4 py-6 text-sm text-ink-muted text-center">Loading…</div>;
}
