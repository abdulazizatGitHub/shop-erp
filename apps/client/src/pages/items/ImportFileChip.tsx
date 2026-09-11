import type { ReactNode } from 'react';
import { FileText, X } from 'lucide-react';

export interface ImportFileChipProps {
  readonly filename: string;
  readonly subtitle: string;
  /** Right-hand status icon — spinner, CheckCircle, or XCircle, colored by caller. */
  readonly statusIcon: ReactNode;
  /** Omit to hide the dismiss button entirely (State D — import in flight, not cancellable). */
  readonly onDismiss?: () => void;
}

/** The filename + status row shown once a CSV is selected (States B–F of ImportItemsModal). */
export function ImportFileChip({
  filename,
  subtitle,
  statusIcon,
  onDismiss,
}: ImportFileChipProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-page px-4 py-3">
      <FileText size={20} strokeWidth={1.5} className="shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{filename}</p>
        <p className="text-xs text-ink-faint">{subtitle}</p>
      </div>
      {statusIcon}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-2 shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:bg-surface-page hover:text-ink"
          aria-label="Remove file"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
