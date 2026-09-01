import { useState } from 'react';
import { Alert, Button, ImportModal } from '@shop/ui';
import { downloadCsv } from '../../lib/downloadCsv.js';
import { ipc } from '../../lib/ipc.js';
import type { ImportResult } from '../../types/electron-api.js';

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
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const runImport = (commit: boolean): void => {
    setError(null);
    setImportResult(null);
    setImportBusy(true);
    const call = commit ? ipc.importData.commit() : ipc.importData.dryRun();
    call
      .then((result) => {
        setImportBusy(false);
        if (result) {
          setImportResult(result);
          if (commit) onImported();
        }
      })
      .catch((err: unknown) => {
        setImportBusy(false);
        setError(err instanceof Error ? err.message : 'Import failed');
      });
  };

  return (
    <ImportModal
      open={open}
      title="Import Items"
      onClose={onClose}
      instructions={
        <>
          <p className="text-sm text-ink">
            Column headers must match exactly — download a sample below to see the expected format.
            Opening stock is optional and imported separately from the same CSV pair.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                downloadCsv('items-sample.csv', ITEM_SAMPLE_HEADERS, ITEM_SAMPLE_ROW);
              }}
            >
              Download Items sample CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                downloadCsv(
                  'opening-stock-sample.csv',
                  OPENING_STOCK_SAMPLE_HEADERS,
                  OPENING_STOCK_SAMPLE_ROW,
                );
              }}
            >
              Download Opening Stock sample CSV
            </Button>
          </div>
        </>
      }
    >
      {error && <Alert variant="danger">{error}</Alert>}
      <p className="text-sm text-ink">
        Dry run or Commit will open a file picker — choose the Items CSV first, and optionally
        Ctrl/Cmd-select the Opening Stock CSV too.
      </p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          disabled={importBusy}
          onClick={() => {
            runImport(false);
          }}
        >
          Dry run (no changes saved)
        </Button>
        <Button
          variant="primary"
          disabled={importBusy}
          onClick={() => {
            runImport(true);
          }}
        >
          Commit import
        </Button>
      </div>
      {importResult && (
        <div role="status" className="flex flex-col gap-1 text-sm text-ink">
          <p>
            Items: {importResult.itemsAccepted} accepted, {importResult.itemsRejected} rejected,{' '}
            {importResult.itemsSkipped} skipped. Report: {importResult.itemsReportPath}
          </p>
          {importResult.openingStockReportPath !== null && (
            <p>
              Opening stock: {importResult.openingStockAccepted} accepted,{' '}
              {importResult.openingStockRejected} rejected, {importResult.openingStockSkipped}{' '}
              skipped. Report: {importResult.openingStockReportPath}
            </p>
          )}
        </div>
      )}
    </ImportModal>
  );
}
