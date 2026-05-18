import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../hooks/useAuth';
import { useImportUops, useUops } from '../hooks/useUops';
import { buildUopBundle } from '../lib/clients/substrate';

export function UoPs() {
  const { data, isLoading } = useUops();
  const { claims } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportUops();

  const onExport = () => {
    if (!data || !claims) return;
    const bundle = buildUopBundle(claims.tenant_id, data);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `aeos-uops-${claims.tenant_id}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error('Could not parse JSON file');
      return;
    }
    try {
      const result = await importMutation.mutateAsync(parsed);
      const { created, skipped, errors } = result.summary;
      const msg = `Imported ${created}, skipped ${skipped}${errors ? `, ${errors} error(s)` : ''}`;
      if (errors > 0) toast.error(msg);
      else toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  };

  if (isLoading) return <div className="text-sm text-ink-muted">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Units of Potential</h1>
          <p className="text-sm text-ink-muted">Business outcomes the agents are accountable to.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={!data || data.length === 0}
            className="btn-ghost text-xs"
          >
            Export JSON
          </button>
          <label className="btn-primary text-xs cursor-pointer">
            {importMutation.isPending ? 'Importing…' : 'Import JSON'}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onFileChange}
              disabled={importMutation.isPending}
            />
          </label>
        </div>
      </div>
      <DataTable
        rows={data ?? []}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/uops/${r.id}`)}
        empty={<EmptyState title="No UoPs yet" body="Import a UoP bundle or wait for Process Discovery." />}
        columns={[
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
          {
            key: 'category',
            header: 'Category',
            render: (r) => <span className="capitalize">{r.category.replace(/_/g, ' ')}</span>,
          },
          { key: 'sor', header: 'System of record', render: (r) => `${r.system_of_record}/${r.sor_object_type}` },
          {
            key: 'baseline',
            header: 'Baseline',
            render: (r) =>
              r.baseline_currency
                ? `${r.baseline_value.toLocaleString()} ${r.baseline_currency}`
                : r.baseline_value.toLocaleString(),
          },
          { key: 'owner_team', header: 'Owner', render: (r) => r.owner_team },
        ]}
      />
    </div>
  );
}
