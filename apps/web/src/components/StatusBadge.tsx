import type { RecommendationStatus } from '../lib/clients/recommendations';
import { cn } from '../lib/cn';

const CLASSES: Record<RecommendationStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-violet-50 text-violet-700 border-violet-200',
  adopted: 'bg-green-50 text-green-700 border-green-200',
  dismissed: 'bg-gray-50 text-gray-600 border-gray-200',
};

const LABELS: Record<RecommendationStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  adopted: 'Adopted',
  dismissed: 'Dismissed',
};

export function StatusBadge({ status }: { status: RecommendationStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium',
        CLASSES[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}
