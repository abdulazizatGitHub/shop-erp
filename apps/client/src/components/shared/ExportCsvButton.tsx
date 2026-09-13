export interface ExportCsvButtonProps {
  readonly disabled: boolean;
  readonly onClick: () => void;
}

/** P10-5 — shared across all 8 report tabs: same label, same disabled shape (loading or zero rows). */
export function ExportCsvButton({ disabled, onClick }: ExportCsvButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-ink-muted"
    >
      Export CSV
    </button>
  );
}
