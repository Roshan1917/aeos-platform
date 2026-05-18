import type { SpanRow } from '../lib/clients/telemetry';
import { KindBadge } from './KindBadge';
import { cn } from '../lib/cn';

const KIND_BAR: Record<SpanRow['kind'], string> = {
  llm_call: 'bg-indigo-400',
  tool_call: 'bg-cyan-400',
  agent_decision: 'bg-violet-400',
  human_handoff: 'bg-amber-400',
  internal: 'bg-gray-400',
};

export function TraceWaterfall({
  spans,
  onSelect,
}: {
  spans: SpanRow[];
  onSelect: (s: SpanRow) => void;
}) {
  if (spans.length === 0) return null;

  const starts = spans.map((s) => new Date(s.start_time).getTime());
  const ends = spans.map((s) => new Date(s.end_time).getTime());
  const minStart = Math.min(...starts);
  const maxEnd = Math.max(...ends);
  const span = Math.max(maxEnd - minStart, 1);

  const sorted = [...spans].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-2 text-xs text-ink-muted flex items-center justify-between">
        <span>{spans.length} spans</span>
        <span>
          duration {(span / 1000).toFixed(2)} s
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {sorted.map((s) => {
          const start = new Date(s.start_time).getTime();
          const end = new Date(s.end_time).getTime();
          const offsetPct = ((start - minStart) / span) * 100;
          const widthPct = Math.max(((end - start) / span) * 100, 0.5);
          return (
            <button
              key={s.span_id}
              onClick={() => onSelect(s)}
              className="w-full text-left px-4 py-2 hover:bg-canvas-subtle transition"
            >
              <div className="flex items-center gap-3">
                <KindBadge kind={s.kind} />
                <div className="font-mono text-xs flex-1 truncate">{s.name}</div>
                <div className="tabular-nums text-xs text-ink-muted">
                  {s.duration_ms.toFixed(1)} ms
                </div>
              </div>
              <div className="mt-1.5 h-2 w-full bg-canvas-subtle rounded">
                <div
                  className={cn('h-2 rounded', KIND_BAR[s.kind])}
                  style={{ marginLeft: `${offsetPct}%`, width: `${widthPct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
