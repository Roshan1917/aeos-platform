import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TraceWaterfall } from '../../src/components/TraceWaterfall';
import type { SpanRow } from '../../src/lib/clients/telemetry';

function fakeSpan(overrides: Partial<SpanRow> = {}): SpanRow {
  return {
    span_id: 's1',
    trace_id: 't1',
    parent_span_id: null,
    agent_id: 'a1',
    uop_id: null,
    process_id: null,
    decision_id: null,
    name: 'aeos.llm.call',
    kind: 'llm_call',
    start_time: '2026-04-29T12:00:00.000Z',
    end_time: '2026-04-29T12:00:01.000Z',
    duration_ms: 1000,
    status: 'ok',
    attributes: {},
    events: [],
    enrichment_version: '1.0',
    ingested_at: '2026-04-29T12:00:01.500Z',
    ...overrides,
  };
}

describe('TraceWaterfall', () => {
  it('renders nothing when there are no spans', () => {
    const { container } = render(<TraceWaterfall spans={[]} onSelect={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a row per span and surfaces the kind label', () => {
    const spans = [
      fakeSpan({ span_id: 's1', name: 'aeos.llm.call', kind: 'llm_call' }),
      fakeSpan({
        span_id: 's2',
        name: 'aeos.tool.call',
        kind: 'tool_call',
        start_time: '2026-04-29T12:00:01.000Z',
        end_time: '2026-04-29T12:00:01.500Z',
        duration_ms: 500,
      }),
    ];
    render(<TraceWaterfall spans={spans} onSelect={() => {}} />);
    expect(screen.getByText('aeos.llm.call')).toBeInTheDocument();
    expect(screen.getByText('aeos.tool.call')).toBeInTheDocument();
    expect(screen.getByText('LLM')).toBeInTheDocument();
    expect(screen.getByText('Tool')).toBeInTheDocument();
  });

  it('invokes onSelect when a span row is clicked', () => {
    const onSelect = vi.fn();
    const span = fakeSpan();
    render(<TraceWaterfall spans={[span]} onSelect={onSelect} />);
    screen.getByText('aeos.llm.call').click();
    expect(onSelect).toHaveBeenCalledWith(span);
  });
});
