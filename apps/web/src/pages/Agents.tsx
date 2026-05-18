import { useNavigate } from 'react-router-dom';

import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { useAgents } from '../hooks/useAgents';

export function Agents() {
  const { data, isLoading } = useAgents();
  const navigate = useNavigate();

  if (isLoading) return <div className="text-sm text-ink-muted">Loading…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Agents</h1>
        <p className="text-sm text-ink-muted">Active AI agents registered in this tenant.</p>
      </div>
      <DataTable
        rows={data ?? []}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/agents/${r.id}`)}
        empty={<EmptyState title="No agents yet" body="Use the Agent Adapter SDK to register your first agent." />}
        columns={[
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'vendor_runtime', header: 'Vendor', render: (r) => r.vendor_runtime },
          { key: 'model', header: 'Model', render: (r) => `${r.model_provider}/${r.model_id}` },
          { key: 'framework', header: 'Framework', render: (r) => r.framework ?? '—' },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <span className="capitalize text-xs">{r.status}</span>,
          },
        ]}
      />
    </div>
  );
}
