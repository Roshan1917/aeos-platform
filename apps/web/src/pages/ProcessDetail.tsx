import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { useProcess } from '../hooks/useProcesses';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/cn';
import {
  exportAgentStep,
  getAgentStepSpec,
  getTenantSettings,
  putAgentStepSpec,
  type AgentStepSpec,
  type AgentStepSpecInput,
  type ModelProviderId,
  type ProcessStep,
  type VendorRuntime,
} from '../lib/clients/substrate';

const TYPE_CLASSES: Record<ProcessStep['type'], string> = {
  human: 'bg-amber-50 text-amber-700 border-amber-200',
  agent: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  automated: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  decision: 'bg-violet-50 text-violet-700 border-violet-200',
};

const VENDOR_RUNTIMES: VendorRuntime[] = [
  'aws_bedrock', 'azure_openai', 'google_vertex', 'anthropic_cloud',
  'openai_platform', 'salesforce_agentforce', 'servicenow_now_assist',
  'microsoft_copilot', 'sap_joule', 'workday_illuminate', 'custom',
];

const MODEL_PROVIDERS: ModelProviderId[] = [
  'anthropic', 'openai', 'google', 'meta', 'mistral', 'cohere', 'amazon', 'custom',
];

export function ProcessDetail() {
  const { id } = useParams();
  const process = useProcess(id);
  const { claims } = useAuth();
  const tenantId = claims?.tenant_id;
  const settings = useQuery({
    queryKey: ['tenant-settings', tenantId],
    queryFn: () => getTenantSettings(tenantId!),
    enabled: !!tenantId,
  });
  const deployEnabled = !!settings.data?.agent_deployment_platform?.config_complete;

  if (process.isLoading) return <div className="text-sm text-ink-muted">Loading…</div>;
  if (!process.data) return <div className="text-sm text-red-600">Process not found.</div>;

  const stepById = new Map(process.data.steps.map((s) => [s.step_id, s]));
  const processId = process.data.id;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/processes" className="text-xs text-brand hover:underline">
          ← back to Processes
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{process.data.name}</h1>
        <p className="text-sm text-ink-muted">{process.data.description}</p>
      </div>

      <div className="card p-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Process ID">
            <span className="font-mono text-xs">{process.data.id}</span>
          </Field>
          <Field label="UoP">
            <Link to={`/uops/${process.data.uop_id}`} className="font-mono text-xs text-brand hover:underline">
              {process.data.uop_id}
            </Link>
          </Field>
          <Field label="Status">
            <span className="capitalize">{process.data.status}</span>
          </Field>
          <Field label="Steps">{process.data.steps.length}</Field>
        </div>
      </div>

      <div className="card">
        <div className="border-b border-gray-200 px-4 py-2">
          <h2 className="text-sm font-semibold">Steps</h2>
        </div>
        <ol className="divide-y divide-gray-100">
          {process.data.steps.map((s, i) => (
            <li key={s.step_id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-6 w-6 place-items-center rounded-full bg-canvas-subtle text-xs font-mono">
                  {i + 1}
                </div>
                <span
                  className={cn(
                    'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium capitalize',
                    TYPE_CLASSES[s.type],
                  )}
                >
                  {s.type}
                </span>
                <div className="font-medium">{s.name}</div>
                {s.type === 'agent' && tenantId && (
                  <AgentStepActions
                    tenantId={tenantId}
                    processId={processId}
                    stepId={s.step_id}
                    stepName={s.name}
                    deployEnabled={deployEnabled}
                  />
                )}
              </div>
              <div className="mt-2 ml-9 text-xs text-ink-muted space-y-0.5">
                {s.inputs.length > 0 && <div>inputs: {s.inputs.join(', ')}</div>}
                {s.outputs.length > 0 && <div>outputs: {s.outputs.join(', ')}</div>}
                {s.next_steps.length > 0 && (
                  <div>
                    next:{' '}
                    {s.next_steps
                      .map((nid) => stepById.get(nid)?.name ?? nid)
                      .join(', ')}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function AgentStepActions({
  tenantId, processId, stepId, stepName, deployEnabled,
}: {
  tenantId: string; processId: string; stepId: string; stepName: string; deployEnabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const spec = useQuery({
    queryKey: ['agent-step-spec', tenantId, processId, stepId],
    queryFn: () => getAgentStepSpec(tenantId, processId, stepId),
  });
  const configured = !!spec.data;

  const onExport = async () => {
    try {
      const bundle = await exportAgentStep(tenantId, processId, stepId);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const slug = (spec.data?.name ?? stepId).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      a.href = url;
      a.download = `aeos-agent-${slug}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const onDeploy = () => {
    toast('Deployment trigger not yet wired.', { icon: 'ℹ️' });
  };

  return (
    <div className="ml-auto flex items-center gap-2">
      <button type="button" onClick={() => setEditing(true)} className="btn-ghost text-xs">
        {configured ? 'Edit agent' : 'Configure agent'}
      </button>
      <button
        type="button"
        onClick={onExport}
        disabled={!configured}
        title={configured ? 'Download agent definition JSON' : 'Configure agent first'}
        className="btn-ghost text-xs disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Export
      </button>
      <button
        type="button"
        onClick={onDeploy}
        disabled={!deployEnabled || !configured}
        title={
          !configured ? 'Configure agent first'
            : deployEnabled ? 'Trigger agent deployment'
              : 'Configure agent deployment platform in Settings'
        }
        className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Deploy
      </button>
      {editing && (
        <SpecEditor
          tenantId={tenantId}
          processId={processId}
          stepId={stepId}
          stepName={stepName}
          initial={spec.data ?? null}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function SpecEditor({
  tenantId, processId, stepId, stepName, initial, onClose,
}: {
  tenantId: string; processId: string; stepId: string; stepName: string;
  initial: AgentStepSpec | null; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AgentStepSpecInput>(() => ({
    name: initial?.name ?? stepName,
    description: initial?.description ?? '',
    vendor_runtime: (initial?.vendor_runtime as VendorRuntime) ?? 'anthropic_cloud',
    model_provider: (initial?.model_provider as ModelProviderId) ?? 'anthropic',
    model_id: initial?.model_id ?? 'claude-sonnet-4-6',
    framework: initial?.framework,
    system_prompt: initial?.system_prompt ?? '',
    user_prompt_template: initial?.user_prompt_template,
    temperature: initial?.temperature,
    max_tokens: initial?.max_tokens,
  }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: (body: AgentStepSpecInput) => putAgentStepSpec(tenantId, processId, stepId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-step-spec', tenantId, processId, stepId] });
      toast.success('Agent spec saved');
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="card w-[min(700px,95vw)] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Agent for step: {stepName}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-sm">✕</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <FormRow label="Name">
            <input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormRow>
          <FormRow label="Description">
            <input className="input" value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormRow>
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Vendor runtime">
              <select className="input" value={form.vendor_runtime}
                onChange={(e) => setForm({ ...form, vendor_runtime: e.target.value as VendorRuntime })}>
                {VENDOR_RUNTIMES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </FormRow>
            <FormRow label="Model provider">
              <select className="input" value={form.model_provider}
                onChange={(e) => setForm({ ...form, model_provider: e.target.value as ModelProviderId })}>
                {MODEL_PROVIDERS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </FormRow>
          </div>
          <FormRow label="Model ID">
            <input className="input" value={form.model_id}
              onChange={(e) => setForm({ ...form, model_id: e.target.value })} />
          </FormRow>
          <FormRow label="System prompt">
            <textarea className="input min-h-[140px] font-mono text-xs" value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} />
          </FormRow>
          <FormRow label="User prompt template (optional)">
            <textarea className="input min-h-[80px] font-mono text-xs" value={form.user_prompt_template ?? ''}
              onChange={(e) => setForm({ ...form, user_prompt_template: e.target.value || undefined })} />
          </FormRow>
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Temperature">
              <input type="number" step="0.1" min="0" max="2" className="input"
                value={form.temperature ?? ''}
                onChange={(e) => setForm({ ...form, temperature: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </FormRow>
            <FormRow label="Max tokens">
              <input type="number" className="input"
                value={form.max_tokens ?? ''}
                onChange={(e) => setForm({ ...form, max_tokens: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </FormRow>
          </div>
        </div>
        <div className="border-t border-gray-200 px-4 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button
            onClick={() => save.mutate(form)}
            disabled={save.isPending || !form.name || !form.system_prompt || !form.model_id}
            className="btn-primary text-xs disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-ink-subtle mb-1">{label}</div>
      {children}
    </label>
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
