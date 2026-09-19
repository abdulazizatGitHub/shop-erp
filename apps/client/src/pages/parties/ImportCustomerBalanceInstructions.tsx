import { CheckCircle, Download, FileText } from 'lucide-react';
import { downloadCsv } from '../../lib/downloadCsv.js';

export interface ImportCustomerBalanceInstructionsProps {
  readonly columns: readonly string[];
  readonly sampleRow: readonly string[];
}

/** CL-10. Page 1 body of ImportCustomersModal — mirrors ImportSupplierBalanceInstructions.tsx. */
export function ImportCustomerBalanceInstructions({
  columns,
  sampleRow,
}: ImportCustomerBalanceInstructionsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-3 text-sm font-medium text-ink">Download sample file</p>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-page px-4 py-3">
          <FileText size={20} strokeWidth={1.5} className="shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Customer Balances CSV</p>
            <p className="text-xs text-ink-faint">
              Defines opening balances for existing customers
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              downloadCsv('customer-balances-sample.csv', columns, sampleRow);
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
              Customers must already exist (matched by name)
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
              A bill already settled (Paid ≥ Original) is skipped, not rejected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
