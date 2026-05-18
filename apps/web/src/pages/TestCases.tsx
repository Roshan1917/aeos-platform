import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { KindBadge } from '../components/KindBadge';
import { useTestCases } from '../hooks/useTestCases';
import {
  generatePlan,
  saveTestCase,
  deleteTestCase,
  type TestCasePlan,
  type TestStep,
} from '../lib/clients/testGenerator';
import { useQueryClient } from '@tanstack/react-query';

export function TestCases() {
  const list = useTestCases();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState(
    'Lead qualification flow: classify lead, look up account in Salesforce, ask a human reviewer, then issue a final decision.',
  );
  const [stepHint, setStepHint] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<TestCasePlan | null>(null);
  const [saving, setSaving] = useState(false);

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const hint = stepHint ? Number(stepHint) : undefined;
      const result = await generatePlan(prompt, Number.isFinite(hint) ? hint : undefined);
      setDraft(result.plan);
      toast.success('Plan generated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'generation failed';
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const onSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const row = await saveTestCase(draft);
      toast.success(`Saved "${row.title}"`);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['test-cases'] });
      navigate(`/test-cases/${row.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'save failed';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await deleteTestCase(id);
      toast.success('Deleted');
      await queryClient.invalidateQueries({ queryKey: ['test-cases'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'delete failed';
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Test Cases</h1>
        <p className="text-sm text-ink-muted">
          Generate sample agent processes with Claude, then execute them so they
          appear as telemetry in the platform.
        </p>
      </div>

      <section className="card p-4 space-y-3">
        <div className="text-sm font-semibold">1. Generate a plan</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="input w-full text-sm"
          placeholder="Describe the scenario you want to simulate…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-ink-muted flex items-center gap-2">
            Steps (optional):
            <input
              type="number"
              min={2}
              max={15}
              value={stepHint}
              onChange={(e) => setStepHint(e.target.value)}
              className="input py-1 text-xs w-20"
              placeholder="auto"
            />
          </label>
          <button
            onClick={onGenerate}
            disabled={generating || prompt.trim().length === 0}
            className="btn-primary text-xs disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate plan'}
          </button>
        </div>
      </section>

      {draft && (
        <section className="card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">2. Preview &amp; save</div>
              <div className="mt-1 text-base font-medium">{draft.title}</div>
              <div className="text-xs text-ink-muted">{draft.description}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDraft(null)} className="btn-ghost text-xs">
                Discard
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="btn-primary text-xs disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save test case'}
              </button>
            </div>
          </div>
          <PlanStepList steps={draft.steps} />
        </section>
      )}

      <section className="space-y-2">
        <div className="text-sm font-semibold">Saved test cases</div>
        {list.isLoading && <div className="text-sm text-ink-muted">Loading…</div>}
        {list.data && (
          <DataTable
            rows={list.data}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/test-cases/${r.id}`)}
            empty={
              <EmptyState
                title="No test cases yet"
                body="Generate a plan above and save it to start a library."
              />
            }
            columns={[
              {
                key: 'title',
                header: 'Title',
                render: (r) => <span className="font-medium">{r.title}</span>,
              },
              {
                key: 'steps',
                header: 'Steps',
                render: (r) => (
                  <div className="flex flex-wrap gap-1">
                    {r.plan.steps.map((s, i) => (
                      <KindBadge key={i} kind={s.kind} />
                    ))}
                  </div>
                ),
              },
              {
                key: 'created_at',
                header: 'Created',
                render: (r) => (
                  <span className="text-xs">{new Date(r.created_at).toLocaleString()}</span>
                ),
                width: '12rem',
              },
              {
                key: 'actions',
                header: '',
                render: (r) => (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDelete(r.id, r.title);
                    }}
                    className="btn-ghost text-xs text-red-600"
                  >
                    Delete
                  </button>
                ),
                width: '6rem',
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}

export function PlanStepList({ steps }: { steps: TestStep[] }) {
  return (
    <ol className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3 px-3 py-2 text-xs">
          <span className="w-5 text-right font-mono text-ink-muted">{i + 1}.</span>
          <KindBadge kind={step.kind} />
          <div className="flex-1 min-w-0">
            <div className="font-mono truncate">{step.name}</div>
            <div className="text-ink-muted truncate">{describeStep(step)}</div>
          </div>
          <span className="tabular-nums text-ink-muted">{step.duration_ms} ms</span>
        </li>
      ))}
    </ol>
  );
}

function describeStep(step: TestStep): string {
  switch (step.kind) {
    case 'llm_call':
      return `${step.model_provider}/${step.model_id} · ${step.input_tokens}→${step.output_tokens} tok · $${step.cost_usd.toFixed(4)}`;
    case 'tool_call':
      return `${step.tool_name} · ${step.tool_success ? 'ok' : `error: ${step.tool_error ?? ''}`}`;
    case 'human_handoff':
      return `expected ${step.expected_decision} · ${step.prompt}`;
    case 'agent_decision':
      return `${step.success ? 'success' : 'failure'} · ${step.output_summary}`;
  }
}
