import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { EmptyState } from '../components/EmptyState';
import { SpanDrawer } from '../components/SpanDrawer';
import { SpanTree } from '../components/SpanTree';
import { useAgents } from '../hooks/useAgents';
import { useUops } from '../hooks/useUops';
import { useSpans } from '../hooks/useSpans';
import type { SpanKind, SpanRow } from '../lib/clients/telemetry';

const KIND_OPTIONS: SpanKind[] = ['llm_call', 'tool_call', 'agent_decision', 'human_handoff', 'internal'];
const PAGE_SIZE = 25;

export function Telemetry() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<SpanRow | null>(null);

  const filters = useMemo(() => {
    const f: Record<string, string | number | undefined> = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    const agent = params.get('agent_id');
    const uop = params.get('uop_id');
    const kind = params.get('kind');
    if (agent) f.agent_id = agent;
    if (uop) f.uop_id = uop;
    if (kind) f.kind = kind;
    return f;
  }, [params, page]);

  const spans = useSpans(filters);
  const agents = useAgents();
  const uops = useUops();

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Telemetry</h1>
          <p className="text-sm text-ink-muted">Classified, enriched spans from registered agents.</p>
        </div>
      </div>

      <div className="card p-3 flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-muted">Kind</label>
          <select
            value={params.get('kind') ?? ''}
            onChange={(e) => setFilter('kind', e.target.value)}
            className="input py-1 text-xs"
          >
            <option value="">all</option>
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-muted">Agent</label>
          <select
            value={params.get('agent_id') ?? ''}
            onChange={(e) => setFilter('agent_id', e.target.value)}
            className="input py-1 text-xs max-w-[16rem]"
          >
            <option value="">all</option>
            {agents.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-muted">UoP</label>
          <select
            value={params.get('uop_id') ?? ''}
            onChange={(e) => setFilter('uop_id', e.target.value)}
            className="input py-1 text-xs max-w-[16rem]"
          >
            <option value="">all</option>
            {uops.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        {(params.get('agent_id') || params.get('uop_id') || params.get('kind')) && (
          <button
            onClick={() => {
              setParams({}, { replace: true });
              setPage(0);
            }}
            className="btn-ghost text-xs"
          >
            Clear filters
          </button>
        )}
      </div>

      {spans.isLoading && <div className="text-sm text-ink-muted">Loading…</div>}

      {spans.data &&
        (spans.data.spans.length === 0 ? (
          <EmptyState title="No spans match these filters" body="Adjust filters or send some spans to /v1/spans." />
        ) : (
          <SpanTree spans={spans.data.spans} onSelect={(s) => setSelected(s)} defaultCollapsed />
        ))}

      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          page {page + 1} · showing {spans.data?.spans.length ?? 0} of ≤{PAGE_SIZE}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            Prev
          </button>
          <button
            disabled={(spans.data?.spans.length ?? 0) < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {selected && <SpanDrawer span={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
