import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  width?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}

export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty }: DataTableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-canvas-subtle text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-4 py-2 text-left font-medium"
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(onRowClick && 'table-row-hover')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-2 align-top">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
