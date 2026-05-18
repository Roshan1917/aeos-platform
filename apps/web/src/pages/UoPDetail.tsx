import { Link, useParams } from 'react-router-dom';

import { useUop } from '../hooks/useUops';
import { useProcesses } from '../hooks/useProcesses';

export function UoPDetail() {
  const { id } = useParams();
  const uop = useUop(id);
  const processes = useProcesses();

  if (uop.isLoading) return <div className="text-sm text-ink-muted">Loading…</div>;
  if (!uop.data) return <div className="text-sm text-red-600">UoP not found.</div>;

  const linked = (processes.data ?? []).filter((p) => p.uop_id === uop.data!.id);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/uops" className="text-xs text-brand hover:underline">
          ← back to UoPs
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{uop.data.name}</h1>
        <p className="text-sm text-ink-muted">{uop.data.description}</p>
      </div>

      <div className="card p-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Field label="UoP ID">
            <span className="font-mono text-xs">{uop.data.id}</span>
          </Field>
          <Field label="Category">
            <span className="capitalize">{uop.data.category.replace(/_/g, ' ')}</span>
          </Field>
          <Field label="System of record">
            {uop.data.system_of_record} / {uop.data.sor_object_type}
          </Field>
          <Field label="Metric field">
            <span className="font-mono">{uop.data.sor_metric_field}</span>
          </Field>
          <Field label="Baseline">
            {uop.data.baseline_value.toLocaleString()} {uop.data.baseline_currency ?? ''}
          </Field>
          <Field label="Owner team">{uop.data.owner_team}</Field>
        </div>
      </div>

      <div className="card">
        <div className="border-b border-gray-200 px-4 py-2">
          <h2 className="text-sm font-semibold">Linked processes</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {linked.length === 0 && (
            <div className="px-4 py-6 text-sm text-ink-muted text-center">No processes mapped to this UoP yet.</div>
          )}
          {linked.map((p) => (
            <Link key={p.id} to={`/processes/${p.id}`} className="block px-4 py-2 hover:bg-canvas-subtle">
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-xs text-ink-muted">{p.steps.length} steps</div>
            </Link>
          ))}
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
