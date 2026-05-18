import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { useAuth } from '../hooks/useAuth';
import {
  getTenant,
  getTenantSettings,
  updateTenantSettings,
} from '../lib/clients/substrate';
import { TelemetryTokensSection } from './TelemetryTokensAdmin';

const FRAMEWORKS = ['EU_AI_ACT', 'ISO_42001', 'UNECE_WP29', 'MAS_TRM', 'SOC2'] as const;

export function Settings() {
  const { claims } = useAuth();
  const tenantId = claims?.tenant_id;
  const qc = useQueryClient();

  const tenant = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => getTenant(tenantId!),
    enabled: !!tenantId,
  });
  const settings = useQuery({
    queryKey: ['tenant-settings', tenantId],
    queryFn: () => getTenantSettings(tenantId!),
    enabled: !!tenantId,
  });

  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [frameworks, setFrameworks] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState<boolean | null>(null);

  useEffect(() => {
    if (settings.data && retentionDays === null) {
      setRetentionDays(settings.data.data_retention_days);
      setFrameworks(new Set(settings.data.compliance_frameworks));
      setConsent(settings.data.anonymized_benchmarks_consent);
    }
  }, [settings.data, retentionDays]);

  const update = useMutation({
    mutationFn: (patch: {
      data_retention_days?: number;
      compliance_frameworks?: string[];
      anonymized_benchmarks_consent?: boolean;
    }) => updateTenantSettings(tenantId!, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-settings', tenantId] });
      toast.success('Settings saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  });

  const onSave = () => {
    if (retentionDays === null || consent === null) return;
    update.mutate({
      data_retention_days: retentionDays,
      compliance_frameworks: Array.from(frameworks),
      anonymized_benchmarks_consent: consent,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-ink-muted">Tenant configuration. Patent-adjacent fields are read-only.</p>
      </div>

      <div className="card p-4 text-sm space-y-3">
        <h2 className="text-sm font-semibold">Tenant</h2>
        {tenant.data && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">{tenant.data.name}</Field>
            <Field label="Slug">
              <span className="font-mono text-xs">{tenant.data.slug}</span>
            </Field>
            <Field label="Deployment mode">
              <span className="capitalize">{tenant.data.deployment_mode}</span>
            </Field>
            <Field label="Status">
              <span className="capitalize">{tenant.data.status}</span>
            </Field>
          </div>
        )}
      </div>

      <div className="card p-4 space-y-4">
        <h2 className="text-sm font-semibold">Data & Compliance</h2>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-ink-subtle">Data retention (days)</label>
            <input
              type="number"
              min={1}
              max={3650}
              value={retentionDays ?? ''}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="input mt-1 max-w-[12rem]"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-ink-subtle">Compliance frameworks</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {FRAMEWORKS.map((f) => (
                <label key={f} className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={frameworks.has(f)}
                    onChange={(e) => {
                      const next = new Set(frameworks);
                      if (e.target.checked) next.add(f);
                      else next.delete(f);
                      setFrameworks(next);
                    }}
                  />
                  {f}
                </label>
              ))}
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent ?? false}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Allow anonymized cross-tenant benchmarks
          </label>
        </div>
        <button onClick={onSave} disabled={update.isPending} className="btn-primary text-sm">
          {update.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <TelemetryTokensSection />
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
