import { Link, useNavigate } from 'react-router-dom';

import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { useProcesses } from '../hooks/useProcesses';
import { useUops } from '../hooks/useUops';

export function Processes() {
  const processes = useProcesses();
  const uops = useUops();
  const navigate = useNavigate();

  if (processes.isLoading) return <div className="text-sm text-ink-muted">Loading…</div>;

  const uopName = (id: string) => uops.data?.find((u) => u.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Processes</h1>
          <p className="text-sm text-ink-muted">DAG workflows mapped to Units of Potential.</p>
        </div>
        <Link to="/processes/discover" className="btn-primary text-xs">
          Discover from documents
        </Link>
      </div>
      <DataTable
        rows={processes.data ?? []}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/processes/${r.id}`)}
        empty={<EmptyState title="No processes yet" />}
        columns={[
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'uop', header: 'UoP', render: (r) => uopName(r.uop_id) },
          {
            key: 'steps',
            header: 'Steps',
            render: (r) => <span className="tabular-nums">{r.steps.length}</span>,
            width: '6rem',
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <span className="capitalize text-xs">{r.status}</span>,
            width: '6rem',
          },
        ]}
      />
    </div>
  );
}
