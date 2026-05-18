import { Link } from 'react-router-dom';

import type { SpanRow } from '../lib/clients/telemetry';
import { JsonView } from './JsonView';
import { KindBadge } from './KindBadge';

export function SpanDrawer({ span, onClose }: { span: SpanRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30" />
      <div
        className="w-[480px] bg-canvas-card shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <div className="text-xs text-ink-muted">Span</div>
            <div className="font-mono text-sm">{span.span_id}</div>
          </div>
          <button onClick={onClose} className="btn-ghost text-xs">
            Close
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-4 py-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <KindBadge kind={span.kind} />
            </Field>
            <Field label="Status">
              <span className="capitalize">{span.status}</span>
            </Field>
            <Field label="Duration">{span.duration_ms.toFixed(1)} ms</Field>
            <Field label="Name">
              <span className="font-mono">{span.name}</span>
            </Field>
            <Field label="Agent">
              <span className="font-mono text-xs">{span.agent_id}</span>
            </Field>
            <Field label="UoP">
              <span className="font-mono text-xs">{span.uop_id ?? '—'}</span>
            </Field>
            <Field label="Process">
              <span className="font-mono text-xs">{span.process_id ?? '—'}</span>
            </Field>
            <Field label="Decision">
              <span className="font-mono text-xs">{span.decision_id ?? '—'}</span>
            </Field>
            <Field label="Start">{new Date(span.start_time).toLocaleString()}</Field>
            <Field label="End">{new Date(span.end_time).toLocaleString()}</Field>
          </div>

          <Field label="Trace">
            <Link
              to={`/traces/${span.trace_id}`}
              className="font-mono text-xs text-brand hover:underline"
              onClick={onClose}
            >
              {span.trace_id}
            </Link>
          </Field>

          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-ink-muted mb-1">Attributes</div>
            <JsonView value={span.attributes} />
          </div>

          {span.events.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-ink-muted mb-1">Events</div>
              <JsonView value={span.events} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
