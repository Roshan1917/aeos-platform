import type { Priority } from '../lib/clients/recommendations';
import { cn } from '../lib/cn';

const CLASSES: Record<Priority, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  low: 'bg-green-50 text-green-700 border-green-200',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium capitalize',
        CLASSES[priority],
      )}
    >
      {priority}
    </span>
  );
}
