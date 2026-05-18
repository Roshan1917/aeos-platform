import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { SpanRow } from '../lib/clients/telemetry';
import { KindBadge } from './KindBadge';

interface TreeNode {
  span: SpanRow;
  children: TreeNode[];
}

interface TraceGroup {
  trace_id: string;
  roots: TreeNode[];
  count: number;
  earliest: number;
}

function buildTraceGroups(spans: SpanRow[]): TraceGroup[] {
  const byTrace = new Map<string, SpanRow[]>();
  for (const s of spans) {
    const arr = byTrace.get(s.trace_id) ?? [];
    arr.push(s);
    byTrace.set(s.trace_id, arr);
  }

  const groups: TraceGroup[] = [];
  for (const [trace_id, traceSpans] of byTrace) {
    const ids = new Set(traceSpans.map((s) => s.span_id));
    const childrenOf = new Map<string, SpanRow[]>();
    const roots: SpanRow[] = [];
    for (const s of traceSpans) {
      if (s.parent_span_id && ids.has(s.parent_span_id)) {
        const arr = childrenOf.get(s.parent_span_id) ?? [];
        arr.push(s);
        childrenOf.set(s.parent_span_id, arr);
      } else {
        roots.push(s);
      }
    }
    const sortByStart = (a: SpanRow, b: SpanRow) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime();

    const build = (s: SpanRow): TreeNode => {
      const kids = (childrenOf.get(s.span_id) ?? []).slice().sort(sortByStart);
      return { span: s, children: kids.map(build) };
    };

    const rootNodes = roots.slice().sort(sortByStart).map(build);
    const earliest = Math.min(...traceSpans.map((s) => new Date(s.start_time).getTime()));
    groups.push({ trace_id, roots: rootNodes, count: traceSpans.length, earliest });
  }
  groups.sort((a, b) => b.earliest - a.earliest);
  return groups;
}

export function SpanTree({
  spans,
  onSelect,
  defaultCollapsed = false,
}: {
  spans: SpanRow[];
  onSelect: (s: SpanRow) => void;
  /**
   * If true, newly seen traces start with their span list collapsed; the
   * user has to click the trace-header chevron to expand. Used on the
   * /telemetry list (many traces) to avoid a wall of nested rows.
   */
  defaultCollapsed?: boolean;
}) {
  const groups = useMemo(() => buildTraceGroups(spans), [spans]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const seenTraces = useRef<Set<string>>(new Set());

  // When defaultCollapsed is true, newly seen traces start with their span
  // list collapsed; the user has to click the trace-header chevron to expand.
  // Once expanded, the trace stays open across re-renders.
  useEffect(() => {
    if (!defaultCollapsed) return;
    let changed = false;
    const next = new Set(collapsed);
    for (const g of groups) {
      if (!seenTraces.current.has(g.trace_id)) {
        seenTraces.current.add(g.trace_id);
        next.add(`trace:${g.trace_id}`);
        changed = true;
      }
    }
    if (changed) setCollapsed(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, defaultCollapsed]);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (groups.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="divide-y divide-gray-200">
        {groups.map((g) => {
          const traceCollapsed = collapsed.has(`trace:${g.trace_id}`);
          return (
            <div key={g.trace_id}>
              <div className="flex items-center gap-2 bg-canvas-subtle px-3 py-2 text-xs">
                <button
                  onClick={() => toggle(`trace:${g.trace_id}`)}
                  className="w-4 text-ink-muted hover:text-ink"
                  aria-label={traceCollapsed ? 'Expand trace' : 'Collapse trace'}
                >
                  {traceCollapsed ? '▸' : '▾'}
                </button>
                <span className="text-ink-muted">Trace</span>
                <Link
                  to={`/traces/${g.trace_id}`}
                  className="font-mono text-brand hover:underline"
                >
                  {g.trace_id.slice(0, 16)}…
                </Link>
                <span className="text-ink-muted">· {g.count} span{g.count === 1 ? '' : 's'}</span>
                <span className="ml-auto text-ink-muted">
                  {new Date(g.earliest).toLocaleString()}
                </span>
              </div>
              {!traceCollapsed && (
                <div>
                  {g.roots.map((node) => (
                    <SpanNode
                      key={node.span.span_id}
                      node={node}
                      depth={0}
                      collapsed={collapsed}
                      toggle={toggle}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpanNode({
  node,
  depth,
  collapsed,
  toggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  onSelect: (s: SpanRow) => void;
}) {
  const { span, children } = node;
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(span.span_id);

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-canvas-subtle cursor-pointer"
        style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
        onClick={() => onSelect(span)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggle(span.span_id);
          }}
          className={`w-4 text-ink-muted hover:text-ink ${hasChildren ? '' : 'invisible'}`}
          aria-label={isCollapsed ? 'Expand span' : 'Collapse span'}
        >
          {isCollapsed ? '▸' : '▾'}
        </button>
        <KindBadge kind={span.kind} />
        <span className="font-mono truncate flex-1">{span.name}</span>
        <span className="font-mono text-ink-muted">{span.agent_id.slice(0, 8)}…</span>
        <span className="tabular-nums text-ink-muted w-16 text-right">
          {span.duration_ms.toFixed(1)} ms
        </span>
      </div>
      {hasChildren && !isCollapsed && (
        <div>
          {children.map((child) => (
            <SpanNode
              key={child.span.span_id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
