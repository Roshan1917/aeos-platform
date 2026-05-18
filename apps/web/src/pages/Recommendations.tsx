import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { PriorityBadge } from '../components/PriorityBadge';
import { StatusBadge } from '../components/StatusBadge';
import { useRecommendations } from '../hooks/useRecommendations';
import type {
  RecommendationCategory,
  RecommendationStatus,
  Priority,
} from '../lib/clients/recommendations';

const STATUSES: RecommendationStatus[] = ['open', 'in_progress', 'adopted', 'dismissed'];
const CATEGORIES: RecommendationCategory[] = [
  'prompt_improvement',
  'routing_change',
  'tool_configuration',
  'human_oversight_adjustment',
  'model_swap',
  'cost_optimization',
  'compliance_remediation',
];
const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];
const PAGE_SIZE = 25;

export function Recommendations() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const navigate = useNavigate();

  const filters = useMemo(() => {
    const f: Record<string, string | number | undefined> = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    const s = params.get('status');
    const c = params.get('category');
    const p = params.get('priority');
    if (s) f.status = s;
    if (c) f.category = c;
    if (p) f.priority = p;
    return f;
  }, [params, page]);

  const recs = useRecommendations(filters);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Recommendations</h1>
        <p className="text-sm text-ink-muted">Templated remediation candidates from variance signals.</p>
      </div>

      <div className="card p-3 flex flex-wrap items-center gap-3 text-sm">
        <FilterSelect
          label="Status"
          value={params.get('status') ?? ''}
          onChange={(v) => setFilter('status', v)}
          options={STATUSES}
        />
        <FilterSelect
          label="Category"
          value={params.get('category') ?? ''}
          onChange={(v) => setFilter('category', v)}
          options={CATEGORIES}
        />
        <FilterSelect
          label="Priority"
          value={params.get('priority') ?? ''}
          onChange={(v) => setFilter('priority', v)}
          options={PRIORITIES}
        />
        {(params.get('status') || params.get('category') || params.get('priority')) && (
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

      {recs.isLoading && <div className="text-sm text-ink-muted">Loading…</div>}

      {recs.data && (
        <DataTable
          rows={recs.data.recommendations}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/recommendations/${r.id}`)}
          empty={<EmptyState title="No recommendations match these filters" />}
          columns={[
            {
              key: 'priority',
              header: 'Priority',
              render: (r) => <PriorityBadge priority={r.priority} />,
              width: '6rem',
            },
            { key: 'title', header: 'Title', render: (r) => <span className="font-medium">{r.title}</span> },
            {
              key: 'category',
              header: 'Category',
              render: (r) => <span className="capitalize text-xs">{r.category.replace(/_/g, ' ')}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <StatusBadge status={r.status} />,
              width: '8rem',
            },
            {
              key: 'created_at',
              header: 'Created',
              render: (r) => <span className="text-xs">{new Date(r.created_at).toLocaleString()}</span>,
              width: '12rem',
            },
          ]}
        />
      )}

      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          page {page + 1} · showing {recs.data?.recommendations.length ?? 0} of ≤{PAGE_SIZE}
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
            disabled={(recs.data?.recommendations.length ?? 0) < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-ink-muted">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input py-1 text-xs">
        <option value="">all</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
