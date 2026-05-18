import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { DataTable, type Column } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../hooks/useAuth';
import { useTelemetryTokens } from '../hooks/useTelemetryTokens';
import {
  createTelemetryToken,
  revokeTelemetryToken,
  type TelemetryTokenSummary,
} from '../lib/clients/telemetryAdmin';

const ADMIN_ROLES = new Set(['admin', 'tenant_admin', 'platform_admin']);

export function TelemetryTokensSection() {
  const { claims } = useAuth();
  const isAdmin = (claims?.roles ?? []).some((r) => ADMIN_ROLES.has(r));

  const list = useTelemetryTokens();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [justCreated, setJustCreated] = useState<{ token: string; prefix: string } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createTelemetryToken({
        name: name.trim(),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }),
    onSuccess: (row) => {
      setJustCreated({ token: row.token, prefix: row.prefix });
      setName('');
      setExpiresAt('');
      qc.invalidateQueries({ queryKey: ['telemetry-tokens'] });
      toast.success(`Minted ${row.prefix}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Mint failed'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeTelemetryToken(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['telemetry-tokens'] });
      toast.success('Revoked');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Revoke failed'),
  });

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    create.mutate();
  };

  const onRevoke = (row: TelemetryTokenSummary) => {
    if (row.revoked_at) return;
    if (!confirm(`Revoke "${row.name}" (${row.prefix})? Agents using this token will start failing within ~60s.`))
      return;
    revoke.mutate(row.id);
  };

  const onCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success('Token copied');
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  };

  if (!isAdmin) {
    return (
      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold">Telemetry Tokens</h2>
        <p className="text-sm text-ink-muted">
          Tenant admins manage telemetry ingest tokens. Ask your admin for a token, or contact
          support.
        </p>
      </div>
    );
  }

  const columns: Column<TelemetryTokenSummary>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: 'prefix',
      header: 'Prefix',
      render: (r) => <span className="font-mono text-xs">{r.prefix}…</span>,
    },
    {
      key: 'created',
      header: 'Created',
      render: (r) => (
        <span className="text-xs text-ink-muted">{new Date(r.created_at).toLocaleString()}</span>
      ),
    },
    {
      key: 'expires',
      header: 'Expires',
      render: (r) =>
        r.expires_at ? (
          <span className="text-xs">{new Date(r.expires_at).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-ink-muted">never</span>
        ),
    },
    {
      key: 'last_used',
      header: 'Last used',
      render: (r) =>
        r.last_used_at ? (
          <span className="text-xs">{new Date(r.last_used_at).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-ink-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.revoked_at ? (
          <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
            revoked
          </span>
        ) : r.expires_at && new Date(r.expires_at).getTime() < Date.now() ? (
          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
            expired
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
            active
          </span>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: '8rem',
      render: (r) =>
        r.revoked_at ? null : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRevoke(r);
            }}
            className="btn-ghost text-xs text-red-700"
            disabled={revoke.isPending}
          >
            Revoke
          </button>
        ),
    },
  ];

  return (
    <div className="card p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Telemetry Tokens</h2>
        <p className="text-xs text-ink-muted">
          Long-lived tenant-scoped tokens for posting spans to the telemetry service. HMAC-signed
          and validated locally — revocation propagates within ~60s.
        </p>
      </div>

      <form onSubmit={onCreate} className="space-y-3 border-t border-gray-100 pt-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-ink-subtle">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="prod-anthropic-quote-agent"
              className="input mt-1 w-full"
              maxLength={200}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-subtle">Expires at (optional)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="input mt-1 w-full"
            />
          </div>
        </div>
        <div>
          <button type="submit" className="btn-primary text-sm" disabled={create.isPending}>
            {create.isPending ? 'Minting…' : 'Mint token'}
          </button>
        </div>
      </form>

      {justCreated && (
        <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Token minted — copy now, shown only once</h3>
            <button
              type="button"
              onClick={() => setJustCreated(null)}
              className="btn-ghost text-xs"
            >
              Dismiss
            </button>
          </div>
          <code className="block break-all rounded bg-canvas-card p-2 font-mono text-xs">
            {justCreated.token}
          </code>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCopy(justCreated.token)}
              className="btn-secondary text-xs"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            Set <code className="font-mono">AEOS_TELEMETRY_TOKEN</code> in your agent environment.
            We do not store the raw token — losing it means re-minting.
          </p>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        {list.isLoading ? (
          <div className="text-sm text-ink-muted">Loading…</div>
        ) : list.error ? (
          <div className="text-sm text-red-700">
            {list.error instanceof Error ? list.error.message : 'Failed to load'}
          </div>
        ) : (
          <DataTable
            rows={list.data ?? []}
            columns={columns}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                title="No tokens yet"
                body="Mint a token above to start sending spans from agents."
              />
            }
          />
        )}
      </div>
    </div>
  );
}
