export function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="rounded bg-canvas-subtle px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
