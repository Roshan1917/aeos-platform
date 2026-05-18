import type { SpanKind } from '../lib/clients/telemetry';
import { cn } from '../lib/cn';

const KIND_CLASSES: Record<SpanKind, string> = {
  llm_call: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  tool_call: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  agent_decision: 'bg-violet-50 text-violet-700 border-violet-200',
  human_handoff: 'bg-amber-50 text-amber-700 border-amber-200',
  internal: 'bg-gray-50 text-gray-600 border-gray-200',
};

const KIND_LABELS: Record<SpanKind, string> = {
  llm_call: 'LLM',
  tool_call: 'Tool',
  agent_decision: 'Decision',
  human_handoff: 'Human',
  internal: 'Internal',
};

export function KindBadge({ kind }: { kind: SpanKind }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium',
        KIND_CLASSES[kind],
      )}
    >
      {KIND_LABELS[kind]}
    </span>
  );
}
