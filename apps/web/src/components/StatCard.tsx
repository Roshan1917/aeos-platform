import type { ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
}

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-ink-muted">{hint}</div> : null}
    </div>
  );
}
