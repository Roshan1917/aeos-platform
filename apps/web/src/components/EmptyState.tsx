export interface EmptyStateProps {
  title: string;
  body?: string;
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="h-10 w-10 rounded-full bg-canvas-subtle grid place-items-center text-ink-muted text-xl">
        ∅
      </div>
      <div className="mt-3 text-sm font-medium">{title}</div>
      {body ? <div className="mt-1 text-xs text-ink-muted max-w-md">{body}</div> : null}
    </div>
  );
}
