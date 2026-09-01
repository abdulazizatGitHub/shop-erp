export interface EmptyStateProps {
  readonly message: string;
  readonly hint?: string;
}

/** Every table/list that can be empty shows this instead of blank headers. */
export function EmptyState({ message, hint }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="text-base text-ink-muted">{message}</p>
      {hint && <p className="text-sm text-ink-faint">{hint}</p>}
    </div>
  );
}
