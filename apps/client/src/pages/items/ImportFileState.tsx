import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { ImportFileChip } from './ImportFileChip.js';
import type { ImportState } from './useImportItemsFlow.js';

export interface ImportFileStateProps {
  /** Every ImportState variant except 'idle' — the idle dashed-zone is rendered by the caller. */
  readonly state: Exclude<ImportState, { status: 'idle' }>;
  readonly onDismiss: () => void;
}

/** States B–F of ImportItemsModal — the file chip (with its dismiss button) and any error block. */
export function ImportFileState({ state, onDismiss }: ImportFileStateProps): React.JSX.Element {
  const subtitle =
    state.status === 'validating'
      ? 'Validating…'
      : state.status === 'ready'
        ? `${String(state.rowCount)} rows ready to import`
        : state.status === 'error'
          ? 'Invalid file — see errors below'
          : state.status === 'importing'
            ? 'Importing…'
            : 'Import failed';

  const statusIcon =
    state.status === 'validating' ? (
      <Loader2 size={16} className="shrink-0 animate-spin text-ink-faint" />
    ) : state.status === 'ready' ? (
      <CheckCircle size={16} className="shrink-0 text-success" />
    ) : state.status === 'importing' ? (
      <Loader2 size={16} className="shrink-0 animate-spin text-brand" />
    ) : (
      <XCircle size={16} className="shrink-0 text-danger" />
    );

  return (
    <div className="flex flex-col gap-3">
      <ImportFileChip
        filename={state.filename}
        subtitle={subtitle}
        statusIcon={statusIcon}
        {...(state.status === 'importing' ? {} : { onDismiss })}
      />

      {state.status === 'error' && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
          <p className="mb-1 text-xs font-medium text-danger">Fix these issues before importing:</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-danger/80">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {state.status === 'failed' && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
          <p className="mb-1 text-xs font-medium text-danger">Fix this issue and retry:</p>
          <p className="text-xs text-danger/80">{state.serverError}</p>
        </div>
      )}
    </div>
  );
}
