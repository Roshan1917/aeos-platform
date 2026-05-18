import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import { PriorityBadge } from '../components/PriorityBadge';
import { StatusBadge } from '../components/StatusBadge';
import { useRecommendation, useUpdateRecommendationStatus } from '../hooks/useRecommendations';
import type { RecommendationStatus } from '../lib/clients/recommendations';

const TRANSITIONS: { status: RecommendationStatus; label: string; variant: 'primary' | 'secondary' | 'ghost' }[] = [
  { status: 'in_progress', label: 'Mark in progress', variant: 'secondary' },
  { status: 'adopted', label: 'Mark adopted', variant: 'primary' },
  { status: 'dismissed', label: 'Dismiss', variant: 'ghost' },
  { status: 'open', label: 'Reopen', variant: 'secondary' },
];

export function RecommendationDetail() {
  const { id } = useParams();
  const rec = useRecommendation(id);
  const update = useUpdateRecommendationStatus();
  const [reason, setReason] = useState('');

  if (rec.isLoading) return <div className="text-sm text-ink-muted">Loading…</div>;
  if (!rec.data) return <div className="text-sm text-red-600">Recommendation not found.</div>;

  const onTransition = async (status: RecommendationStatus) => {
    if (!id) return;
    try {
      await update.mutateAsync({ id, status, reason: reason || undefined });
      toast.success(`Status set to ${status}`);
      setReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/recommendations" className="text-xs text-brand hover:underline">
          ← back to Recommendations
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold">{rec.data.title}</h1>
          <PriorityBadge priority={rec.data.priority} />
          <StatusBadge status={rec.data.status} />
        </div>
        <p className="mt-1 text-xs text-ink-muted font-mono">{rec.data.template_id}</p>
      </div>

      <div className="card p-4 space-y-3 text-sm">
        <div>{rec.data.description}</div>
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
          <Field label="Recommendation ID">
            <span className="font-mono text-xs">{rec.data.id}</span>
          </Field>
          <Field label="Category">
            <span className="capitalize">{rec.data.category.replace(/_/g, ' ')}</span>
          </Field>
          <Field label="UoP">
            <Link to={`/uops/${rec.data.uop_id}`} className="font-mono text-xs text-brand hover:underline">
              {rec.data.uop_id}
            </Link>
          </Field>
          <Field label="Agent">
            {rec.data.agent_id ? (
              <Link to={`/agents/${rec.data.agent_id}`} className="font-mono text-xs text-brand hover:underline">
                {rec.data.agent_id}
              </Link>
            ) : (
              '—'
            )}
          </Field>
          <Field label="Created">
            <span className="text-xs">{new Date(rec.data.created_at).toLocaleString()}</span>
          </Field>
          <Field label="Updated">
            <span className="text-xs">{new Date(rec.data.updated_at).toLocaleString()}</span>
          </Field>
          <Field label="Estimated impact" full>
            {rec.data.estimated_impact_value !== null
              ? `${rec.data.estimated_impact_value.toLocaleString()} ${rec.data.estimated_impact_currency ?? ''}`
              : '—'}
          </Field>
          <Field label="Evidence" full>
            {rec.data.evidence_row_ids.length === 0 ? (
              '—'
            ) : (
              <ul className="font-mono text-xs space-y-0.5">
                {rec.data.evidence_row_ids.map((rid) => (
                  <li key={rid}>{rid}</li>
                ))}
              </ul>
            )}
          </Field>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Transition status</div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional reason (will be persisted on the status_changed event)"
          className="input text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {TRANSITIONS.filter((t) => t.status !== rec.data!.status).map((t) => (
            <button
              key={t.status}
              onClick={() => onTransition(t.status)}
              disabled={update.isPending}
              className={`btn-${t.variant} text-xs`}
            >
              {t.label}
            </button>
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
