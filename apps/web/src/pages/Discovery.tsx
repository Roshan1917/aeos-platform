import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import { EmptyState } from '../components/EmptyState';
import { useUops } from '../hooks/useUops';
import {
  useAnswerRun,
  useApplySuggestion,
  useConnectors,
  useCreateConnector,
  useDeleteConnector,
  useDeleteDocument,
  useDocuments,
  useRun,
  useSkipRun,
  useSuggestions,
  useTriggerRun,
  useUpdateSuggestion,
  useUploadDocument,
} from '../hooks/useDiscovery';
import { ACCEPTED_EXTENSIONS, formatBytes } from '../lib/discoveryFormat';
import type { ProposedStep } from '../lib/clients/discovery';

export function Discovery() {
  const connectorsQuery = useConnectors();
  const createConnector = useCreateConnector();
  const deleteConnector = useDeleteConnector();

  const [selectedConnectorId, setSelectedConnectorId] = useState<string | undefined>();
  const [activeRunId, setActiveRunId] = useState<string | undefined>();

  // When connectors load and none is selected, pick the first.
  useEffect(() => {
    if (!selectedConnectorId && connectorsQuery.data && connectorsQuery.data.length > 0) {
      setSelectedConnectorId(connectorsQuery.data[0]!.id);
    }
  }, [connectorsQuery.data, selectedConnectorId]);

  const onCreateConnector = async () => {
    const name = window.prompt('Connector name (e.g. "Sales SOPs"):');
    if (!name) return;
    try {
      const c = await createConnector.mutateAsync(name);
      setSelectedConnectorId(c.id);
      toast.success(`Connector "${c.name}" created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'create failed');
    }
  };

  const onDeleteConnector = async (id: string, name: string) => {
    if (!confirm(`Delete connector "${name}" and all its documents?`)) return;
    try {
      await deleteConnector.mutateAsync(id);
      if (selectedConnectorId === id) setSelectedConnectorId(undefined);
      toast.success('Connector deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Process Discovery</h1>
        <p className="text-sm text-ink-muted">
          Upload SOPs / playbooks / spreadsheets, run an AI discovery agent, review
          suggested processes, and apply them to your registry.
        </p>
      </div>

      <ConnectorPicker
        connectors={connectorsQuery.data ?? []}
        loading={connectorsQuery.isLoading}
        selectedId={selectedConnectorId}
        onSelect={setSelectedConnectorId}
        onCreate={onCreateConnector}
        onDelete={onDeleteConnector}
      />

      {selectedConnectorId && (
        <>
          <DocumentSection connectorId={selectedConnectorId} />
          <RunTrigger
            connectorId={selectedConnectorId}
            onStarted={(runId) => setActiveRunId(runId)}
          />
        </>
      )}

      {activeRunId && <RunPanel runId={activeRunId} />}
    </div>
  );
}

// ── Connector Picker ──────────────────────────────────────────────────────

function ConnectorPicker(props: {
  connectors: { id: string; name: string; status: string }[];
  loading: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">1. Connector</div>
        <button onClick={props.onCreate} className="btn-primary text-xs">
          New connector
        </button>
      </div>
      {props.loading && <div className="text-xs text-ink-muted">Loading…</div>}
      {!props.loading && props.connectors.length === 0 && (
        <EmptyState
          title="No connectors yet"
          body="Create one to start uploading documents."
        />
      )}
      {!props.loading && props.connectors.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {props.connectors.map((c) => (
            <li
              key={c.id}
              className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer ${
                props.selectedId === c.id ? 'bg-brand-subtle' : 'hover:bg-canvas-subtle'
              }`}
              onClick={() => props.onSelect(c.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-ink-muted">document_only</span>
                <span className="text-xs text-ink-muted capitalize">{c.status}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDelete(c.id, c.name);
                }}
                className="btn-ghost text-xs text-red-600"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────

function DocumentSection({ connectorId }: { connectorId: string }) {
  const docsQuery = useDocuments(connectorId);
  const upload = useUploadDocument(connectorId);
  const remove = useDeleteDocument(connectorId);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success(`Uploaded ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'upload failed');
    }
  };

  const onRemove = async (filename: string) => {
    if (!confirm(`Remove ${filename}?`)) return;
    try {
      await remove.mutateAsync(filename);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'delete failed');
    }
  };

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">2. Documents</div>
        <label className="btn-primary text-xs cursor-pointer">
          Upload file
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            onChange={onFileChange}
          />
        </label>
      </div>
      <p className="text-xs text-ink-muted">
        PDF / DOCX / XLSX / TXT / CSV / JPG / PNG. Max 5 files, 10 MB total per
        connector.
      </p>
      {docsQuery.data && docsQuery.data.length === 0 && (
        <div className="text-xs text-ink-muted">No documents uploaded yet.</div>
      )}
      {docsQuery.data && docsQuery.data.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {docsQuery.data.map((d) => (
            <li
              key={d.filename}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs truncate">{d.original_name}</span>
                <span className="text-xs text-ink-muted">{d.media_type}</span>
                <span className="text-xs text-ink-muted">{formatBytes(d.size_bytes)}</span>
              </div>
              <button
                onClick={() => onRemove(d.filename)}
                className="btn-ghost text-xs text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Run Trigger ───────────────────────────────────────────────────────────

function RunTrigger({
  connectorId,
  onStarted,
}: {
  connectorId: string;
  onStarted: (runId: string) => void;
}) {
  const trigger = useTriggerRun(connectorId);
  const docs = useDocuments(connectorId);

  const [companyContext, setCompanyContext] = useState('');
  const [interactive, setInteractive] = useState(true);
  const [depth, setDepth] = useState<'broad' | 'focused'>('broad');
  const [detail, setDetail] = useState<'high-level' | 'moderate' | 'detailed'>('moderate');

  const noDocs = (docs.data?.length ?? 0) === 0;

  const onRun = async () => {
    try {
      const res = await trigger.mutateAsync({
        interactive,
        company_context: companyContext || undefined,
        process_depth: depth,
        detail_level: detail,
      });
      toast.success('Run started');
      onStarted(res.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'run failed');
    }
  };

  return (
    <section className="card p-4 space-y-3">
      <div className="text-sm font-semibold">3. Run discovery</div>
      <div className="space-y-2">
        <label className="block text-xs text-ink-muted">Company context (optional)</label>
        <textarea
          value={companyContext}
          onChange={(e) => setCompanyContext(e.target.value)}
          rows={2}
          className="input w-full text-sm"
          placeholder="e.g. B2B SaaS sales ops, ~500 employees"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={interactive}
            onChange={(e) => setInteractive(e.target.checked)}
          />
          Interactive (agent asks questions)
        </label>
        <label className="flex items-center gap-2">
          Depth:
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value as 'broad' | 'focused')}
            className="input py-1 text-xs"
          >
            <option value="broad">Broad</option>
            <option value="focused">Focused</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Detail:
          <select
            value={detail}
            onChange={(e) => setDetail(e.target.value as 'high-level' | 'moderate' | 'detailed')}
            className="input py-1 text-xs"
          >
            <option value="high-level">High-level</option>
            <option value="moderate">Moderate</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
      </div>
      <div>
        <button
          onClick={onRun}
          disabled={trigger.isPending || noDocs}
          className="btn-primary text-xs disabled:opacity-50"
        >
          {trigger.isPending ? 'Starting…' : 'Run discovery'}
        </button>
        {noDocs && (
          <span className="ml-3 text-xs text-red-600">
            Upload at least one document first.
          </span>
        )}
      </div>
    </section>
  );
}

// ── Active Run ────────────────────────────────────────────────────────────

function RunPanel({ runId }: { runId: string }) {
  const runQuery = useRun(runId);
  const answer = useAnswerRun(runId);
  const skip = useSkipRun(runId);

  const [answerText, setAnswerText] = useState('');
  const [individualAnswers, setIndividualAnswers] = useState<Record<number, string>>({});

  const run = runQuery.data;
  const pending = run?.interaction?.pending_questions ?? null;

  // Reset answer state on new question round.
  useEffect(() => {
    setAnswerText('');
    setIndividualAnswers({});
  }, [run?.interaction?.question_round]);

  if (!run) return <div className="text-sm text-ink-muted">Loading run…</div>;

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Run {run.id.slice(0, 8)}…</div>
        <span className="text-xs uppercase tracking-wide text-ink-muted">{run.status}</span>
      </div>
      {run.progress && (
        <div className="text-xs text-ink-muted">
          <span className="font-mono">[{run.progress.step}]</span> {run.progress.message}
        </div>
      )}
      {run.error && (
        <div className="text-xs text-red-600">Error: {run.error}</div>
      )}

      {run.status === 'waiting_for_input' && pending && pending.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium">Agent questions</div>
          <div className="space-y-3">
            {pending.map((q, i) => (
              <div key={i} className="space-y-1">
                <div className="text-sm">{q}</div>
                <textarea
                  className="input w-full text-sm"
                  rows={2}
                  value={individualAnswers[i] ?? ''}
                  onChange={(e) =>
                    setIndividualAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                  }
                  placeholder="Your answer…"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const answers = pending.map((_, i) => individualAnswers[i] ?? '');
                if (answers.some((a) => !a.trim())) {
                  toast.error('Answer all questions or click Skip.');
                  return;
                }
                try {
                  await answer.mutateAsync({ answers });
                  toast.success('Submitted — agent resuming');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'submit failed');
                }
              }}
              disabled={answer.isPending}
              className="btn-primary text-xs disabled:opacity-50"
            >
              Submit answers
            </button>
            <button
              onClick={async () => {
                try {
                  await skip.mutateAsync();
                  toast.success('Skipped — generating suggestions');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'skip failed');
                }
              }}
              disabled={skip.isPending}
              className="btn-ghost text-xs disabled:opacity-50"
            >
              Skip questions
            </button>
          </div>
        </div>
      )}

      {/* Single-question fallback if pending list is somehow empty. */}
      {run.status === 'waiting_for_input' &&
        (!pending || pending.length === 0) &&
        run.interaction?.current_question && (
          <div className="space-y-2">
            <div className="text-sm">{run.interaction.current_question}</div>
            <textarea
              className="input w-full text-sm"
              rows={2}
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
            />
            <button
              onClick={async () => {
                if (!answerText.trim()) return;
                try {
                  await answer.mutateAsync({ answer: answerText });
                  setAnswerText('');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'submit failed');
                }
              }}
              className="btn-primary text-xs"
            >
              Submit
            </button>
          </div>
        )}

      {run.status === 'completed' && <SuggestionsList runId={runId} />}
    </section>
  );
}

// ── Suggestions ───────────────────────────────────────────────────────────

function SuggestionsList({ runId }: { runId: string }) {
  const suggestionsQuery = useSuggestions(runId);
  const update = useUpdateSuggestion(runId);
  const apply = useApplySuggestion(runId);
  const uops = useUops();

  const data = suggestionsQuery.data;
  if (!data) return <div className="text-xs text-ink-muted">Loading suggestions…</div>;
  if (data.length === 0) {
    return (
      <EmptyState
        title="No suggestions"
        body="The agent did not find any business processes in the documents."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">Suggestions ({data.length})</div>
      {data.map((s) => (
        <SuggestionCard
          key={s.id}
          suggestion={s}
          uops={uops.data ?? []}
          onUpdate={(body) => update.mutateAsync({ id: s.id, body })}
          onApply={(uopId) => apply.mutateAsync({ id: s.id, uopId })}
        />
      ))}
    </div>
  );
}

function SuggestionCard(props: {
  suggestion: import('../lib/clients/discovery').DiscoverySuggestion;
  uops: { id: string; name: string }[];
  onUpdate: (body: { status: 'approved' | 'rejected' | 'pending' }) => Promise<unknown>;
  onApply: (uopId: string) => Promise<unknown>;
}) {
  const { suggestion: s } = props;
  const [selectedUop, setSelectedUop] = useState<string>(() => props.uops[0]?.id ?? '');

  // Keep dropdown selection in sync if uops list arrives after mount.
  useEffect(() => {
    if (!selectedUop && props.uops[0]) setSelectedUop(props.uops[0].id);
  }, [props.uops, selectedUop]);

  const steps = useMemo<ProposedStep[]>(
    () => (Array.isArray(s.proposed_steps) ? s.proposed_steps : []),
    [s.proposed_steps],
  );

  const isClosed = s.status === 'applied' || s.status === 'rejected';

  return (
    <div className="rounded border border-gray-200 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{s.name}</div>
          {s.description && (
            <div className="text-xs text-ink-muted">{s.description}</div>
          )}
        </div>
        <span className="text-xs uppercase tracking-wide text-ink-muted">{s.status}</span>
      </div>

      <ol className="divide-y divide-gray-100 rounded border border-gray-100">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-3 px-2 py-1.5 text-xs">
            <span className="w-5 text-right font-mono text-ink-muted">{i + 1}.</span>
            <span className="rounded bg-canvas-subtle px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              {step.step_type}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{step.name}</div>
              <div className="text-ink-muted truncate">{step.description}</div>
            </div>
            {typeof step.automation_potential === 'number' && (
              <span className="tabular-nums text-ink-muted">
                {step.automation_potential}% auto
              </span>
            )}
          </li>
        ))}
      </ol>

      {!isClosed && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => props.onUpdate({ status: 'approved' })}
            disabled={s.status === 'approved'}
            className="btn-ghost text-xs disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => props.onUpdate({ status: 'rejected' })}
            className="btn-ghost text-xs text-red-600"
          >
            Reject
          </button>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={selectedUop}
              onChange={(e) => setSelectedUop(e.target.value)}
              className="input py-1 text-xs"
            >
              <option value="">Select UoP…</option>
              {props.uops.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (!selectedUop) {
                  toast.error('Select a UoP before applying.');
                  return;
                }
                try {
                  await props.onApply(selectedUop);
                  toast.success(`Applied "${s.name}" to registry`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'apply failed');
                }
              }}
              className="btn-primary text-xs"
            >
              Apply to registry
            </button>
          </div>
        </div>
      )}

      {s.status === 'applied' && s.process_id && (
        <div className="text-xs text-ink-muted">
          Applied as Process{' '}
          <a href={`/processes/${s.process_id}`} className="font-mono text-brand hover:underline">
            {s.process_id.slice(0, 8)}…
          </a>
        </div>
      )}
    </div>
  );
}
