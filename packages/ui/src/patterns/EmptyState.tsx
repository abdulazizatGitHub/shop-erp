import type { ReactNode } from 'react';

export interface EmptyStateProps {
  readonly icon?: ReactNode;
  readonly message: string;
  readonly hint?: string;
}

/** Every table/list that can be empty shows this instead of blank headers. */
export function EmptyState({ icon, message, hint }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mb-3 flex justify-center text-ink-faint">{icon}</div>}
      <p className="text-base text-ink-muted">{message}</p>
      {hint && <p className="text-sm text-ink-faint">{hint}</p>}
    </div>
  );
}
