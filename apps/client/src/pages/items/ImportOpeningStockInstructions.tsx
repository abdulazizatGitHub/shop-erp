import { CheckCircle, Download, FileText } from 'lucide-react';
import { downloadCsv } from '../../lib/downloadCsv.js';

export interface ImportOpeningStockInstructionsProps {
  readonly columns: readonly string[];
  readonly sampleRow: readonly string[];
}

/** Page 1 body of ImportOpeningStockModal — sample-file download + the "before you import" checklist. */
export function ImportOpeningStockInstructions({
  columns,
  sampleRow,
}: ImportOpeningStockInstructionsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-3 text-sm font-medium text-ink">Download sample file</p>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-page px-4 py-3">
          <FileText size={20} strokeWidth={1.5} className="shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Opening Stock CSV</p>
            <p className="text-xs text-ink-faint">Defines initial stock quantities for each item</p>
          </div>
          <button
            type="button"
            onClick={() => {
              downloadCsv('opening-stock-sample.csv', columns, sampleRow);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-page"
          >
            <Download size={14} strokeWidth={1.5} />
            Download
          </button>
        </div>
      </div>

      <div className="border-t border-line" />

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Before you import</p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <CheckCircle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" />
            <span className="text-xs text-ink-faint">
              Items must already be imported before running this
            </span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" />
            <span className="text-xs text-ink-faint">
              Column headers must match exactly (case-sensitive)
            </span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" />
            <span className="text-xs text-ink-faint">
              Each item code must match an existing item exactly
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
