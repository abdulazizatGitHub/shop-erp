import { useState } from 'react';
import { CheckCircle, Download, FileText, UploadCloud } from 'lucide-react';
import { Alert, Button, ImportModal, useToast } from '@shop/ui';
import { downloadCsv } from '../../lib/downloadCsv.js';
import { ipc } from '../../lib/ipc.js';

// Mirrors packages/core/src/import/item-columns.ts's ITEM_COLUMNS /
// OPENING_STOCK_COLUMNS exactly. apps/client may never import @shop/core
// (architecture boundary — see eslint.config.js), so this is a manually
// synced local copy, the same pattern SuppliersImportPage/
// CustomersImportPage already use for their own column instructions.
// If item-columns.ts changes, this must be updated too.
const ITEM_SAMPLE_HEADERS = [
  'Item Code',
  'Item Name (English)',
  'Item Name (Urdu)',
  'Owning Business Unit',
  'Category',
  'Brand / Company',
  'Variant / Spec',
  'Selling Unit',
  'Purchase Unit',
  'Units per Purchase Unit',
  'Track Stock? (Y/N)',
  'Has Serial No? (Y/N)',
  'Purchase Price (PKR)',
  'Retail Price (PKR)',
  'Wholesale Price (PKR)',
  'Low Stock Alert Qty',
  'Shelf / Location',
  'Notes',
  'Alt Unit',
  'Alt Factor',
];
const ITEM_SAMPLE_ROW = [
  '',
  'Gas R-134a',
  '',
  'Spare Parts',
  '',
  '',
  '13.6 kg cylinder',
  'Kg',
  'Cylinder',
  '13.6',
  'Y',
  'N',
  '35000',
  '4200',
  '4000',
  '5',
  'Shelf A1',
  '',
  '',
  '',
];

const OPENING_STOCK_SAMPLE_HEADERS = [
  'Item Code',
  'Item Name (English)',
  'Count Date',
  'Quantity Counted',
  'Unit Cost (PKR)',
  'Serial Numbers',
  'Shelf / Location',
  'Counted By',
  'Notes',
];
const OPENING_STOCK_SAMPLE_ROW = [
  'CU-PIPE-01',
  'Copper Pipe 10ft',
  '2026-08-31',
  '20',
  '250',
  '',
  'Shelf C1',
  '',
  '',
];

export interface ImportItemsModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called once after a successful commit, so the caller can reload its item list. */
  readonly onImported: () => void;
}

/**
 * P4.5 import-modal pass: shares the two-page ImportModal shell with
 * Suppliers/Customers. The file picker itself is still native (Electron's
 * dialog.showOpenDialog, triggered inside ipc.importData.dryRun()/
 * commit() — neither takes a filename argument), so page 2 explains that
 * the next click opens it, rather than offering a drag-drop area — there
 * is no renderer-visible file content in this app's IPC contract to
 * validate ahead of that click. Column errors are whatever the server
 * throws (see packages/core/src/import/csv.ts's header-matching error),
 * surfaced verbatim — not re-implemented here.
 */
export function ImportItemsModal({
  open,
  onClose,
  onImported,
}: ImportItemsModalProps): React.JSX.Element | null {
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const runImport = (commit: boolean): void => {
    setError(null);
    setImportBusy(true);
    const call = commit ? ipc.importData.commit() : ipc.importData.dryRun();
    call
      .then((result) => {
        setImportBusy(false);
        if (result) {
          if (commit) {
            showToast({
              variant: 'success',
              message: `Import complete: ${String(result.itemsAccepted)} accepted, ${String(result.itemsSkipped)} skipped`,
            });
            onImported();
          } else {
            const issues = result.itemsRejected + result.itemsSkipped;
            showToast({
              variant: 'success',
              message: `Dry run complete: ${String(result.itemsAccepted)} items OK, ${String(issues)} issues`,
            });
          }
        }
      })
      .catch((err: unknown) => {
        setImportBusy(false);
        const message = err instanceof Error ? err.message : 'Import failed';
        setError(message);
        showToast({ variant: 'error', message: 'Import failed: 1 error — no data saved' });
      });
  };

  return (
    <ImportModal
      open={open}
      title="Import Items"
      onClose={onClose}
      instructions={
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-3 text-sm font-medium text-ink">Download sample files</p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-page px-4 py-3">
                <FileText size={20} strokeWidth={1.5} className="shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">Items CSV</p>
                  <p className="text-xs text-ink-faint">Required — defines all item fields</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    downloadCsv('items-sample.csv', ITEM_SAMPLE_HEADERS, ITEM_SAMPLE_ROW);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-page"
                >
                  <Download size={14} strokeWidth={1.5} />
                  Download
                </button>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-page px-4 py-3">
                <FileText size={20} strokeWidth={1.5} className="shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">Opening Stock CSV</p>
                  <p className="text-xs text-ink-faint">
                    Optional — import initial stock quantities
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    downloadCsv(
                      'opening-stock-sample.csv',
                      OPENING_STOCK_SAMPLE_HEADERS,
                      OPENING_STOCK_SAMPLE_ROW,
                    );
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-page"
                >
                  <Download size={14} strokeWidth={1.5} />
                  Download
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-line" />

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Before you import</p>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2">
                <CheckCircle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" />
                <span className="text-xs text-ink-faint">
                  Column headers must match exactly (case-sensitive)
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" />
                <span className="text-xs text-ink-faint">
                  Opening stock is optional and imported separately
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" />
                <span className="text-xs text-ink-faint">
                  Duplicate item codes will be skipped automatically
                </span>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand/30 bg-surface-page px-6 py-10 text-center">
          <UploadCloud size={40} strokeWidth={1.5} className="mb-3 text-brand/50" />
          <p className="mb-1 text-sm font-medium text-ink">Select files to import</p>
          <p className="mb-4 text-xs text-ink-faint">
            Click Dry run or Commit import below to open the file picker. Select your Items CSV
            first, then Ctrl/Cmd-click to also select the Opening Stock CSV.
          </p>
          <div className="flex gap-3">
            <Button
              variant="primary"
              disabled={importBusy}
              onClick={() => {
                runImport(true);
              }}
            >
              Import
            </Button>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </ImportModal>
  );
}
