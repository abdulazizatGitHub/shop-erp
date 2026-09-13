import { CheckCircle, Download, FileText, Loader2, XCircle } from 'lucide-react';
import { Button } from '@shop/ui';
import type { RejectedGrnRow, ValidatedGrnRow } from '../../types/electron-api.js';

export type GrnCsvStepState =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly filename: string; readonly fileError: string }
  | { readonly status: 'validating'; readonly filename: string }
  | {
      readonly status: 'ready';
      readonly filename: string;
      readonly accepted: readonly ValidatedGrnRow[];
      readonly rejected: readonly RejectedGrnRow[];
    }
  | { readonly status: 'dryRunFailed'; readonly filename: string; readonly error: string };

export interface GrnCsvStep2Props {
  readonly state: GrnCsvStepState;
  readonly fileInputRef: React.RefObject<HTMLInputElement>;
  readonly onSelectClick: () => void;
  readonly onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onDownloadTemplate: () => void;
  readonly onBack: () => void;
  readonly onNext: () => void;
}

/** Step 2 of GrnCsvImportModal — file picker, dry-run report, template download. */
export function GrnCsvStep2({
  state,
  fileInputRef,
  onSelectClick,
  onFileChange,
  onDownloadTemplate,
  onBack,
  onNext,
}: GrnCsvStep2Props): React.JSX.Element {
  const nextDisabled = state.status !== 'ready' || state.accepted.length === 0;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={onFileChange}
      />

      <button
        type="button"
        onClick={onDownloadTemplate}
        className="flex w-fit items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-page"
      >
        <Download size={14} strokeWidth={1.5} />
        Download template
      </button>

      {state.status === 'idle' ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand/30 bg-surface-page px-6 py-10 text-center">
          <FileText size={40} strokeWidth={1.5} className="mb-3 text-brand/50" />
          <p className="mb-1 text-sm font-medium text-ink">Select the supplier invoice CSV</p>
          <p className="mb-4 text-xs text-ink-faint">
            Column headers are checked as soon as you pick a file.
          </p>
          <Button variant="primary" onClick={onSelectClick}>
            Select file
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-page px-4 py-3">
            {state.status === 'validating' ? (
              <Loader2 size={16} className="shrink-0 animate-spin text-ink-faint" />
            ) : state.status === 'ready' ? (
              <CheckCircle size={16} className="shrink-0 text-success" />
            ) : (
              <XCircle size={16} className="shrink-0 text-danger" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{state.filename}</p>
              <p className="text-xs text-ink-faint">
                {state.status === 'validating'
                  ? 'Validating…'
                  : state.status === 'ready'
                    ? `Accepted: ${String(state.accepted.length)} rows · Rejected: ${String(state.rejected.length)} rows`
                    : 'Invalid file'}
              </p>
            </div>
            <button
              type="button"
              onClick={onSelectClick}
              className="shrink-0 text-xs font-medium text-brand hover:underline"
            >
              Select different file
            </button>
          </div>

          {state.status === 'error' && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
              <p className="text-xs text-danger">{state.fileError}</p>
            </div>
          )}

          {state.status === 'dryRunFailed' && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
              <p className="text-xs text-danger">{state.error}</p>
            </div>
          )}

          {state.status === 'ready' && state.rejected.length > 0 && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
              <p className="mb-1 text-xs font-medium text-danger">Rejected rows:</p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-danger/80">
                {state.rejected.map((r) => (
                  <li key={r.rowNumber}>
                    Row {r.rowNumber} — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" disabled={nextDisabled} onClick={onNext}>
          Import
        </Button>
      </div>
    </>
  );
}
