import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { SpanDrawer } from '../components/SpanDrawer';
import { SpanTree } from '../components/SpanTree';
import { useTrace } from '../hooks/useSpans';
import type { SpanRow } from '../lib/clients/telemetry';

export function TraceDetail() {
  const { trace_id } = useParams();
  const trace = useTrace(trace_id);
  const [selected, setSelected] = useState<SpanRow | null>(null);

  if (trace.isLoading) return <div className="text-sm text-ink-muted">Loading…</div>;
  if (!trace.data || trace.data.spans.length === 0) {
    return (
      <div className="space-y-4">
        <Link to="/telemetry" className="text-xs text-brand hover:underline">
          ← back to Telemetry
        </Link>
        <div className="card p-6 text-sm text-ink-muted text-center">
          Trace not found or has no spans.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/telemetry" className="text-xs text-brand hover:underline">
          ← back to Telemetry
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Trace</h1>
        <p className="font-mono text-xs text-ink-muted">{trace.data.trace_id}</p>
      </div>
      <SpanTree spans={trace.data.spans} onSelect={setSelected} />
      {selected && <SpanDrawer span={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
