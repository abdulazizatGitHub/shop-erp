import { useState } from 'react';
import { Alert, Button, ImportModal } from '@shop/ui';
import { downloadCsv } from '../../lib/downloadCsv.js';
import { ipc } from '../../lib/ipc.js';
import type { SupplierBalanceImportResult } from '../../types/electron-api.js';

// Mirrors packages/core/src/import/supplier-columns.ts's
// SUPPLIER_BALANCE_COLUMNS exactly — apps/client may never import
// @shop/core (architecture boundary), so this is a manually synced local
// copy. Verified against the real file before hardcoding.
const SUPPLIER_BALANCE_SAMPLE_HEADERS = [
  'Supplier Name',
  'Phone',
  'Bill Reference',
  'Bill Date',
  'Original Amount (PKR)',
  'Amount Paid So Far (PKR)',
  'Due Date',
  'Notes',
];
const SUPPLIER_BALANCE_SAMPLE_ROW = [
  'Metro Refrigeration Traders',
  '03001234567',
  'BILL-2024-001',
  '2026-01-15',
  '45000',
  '15000',
  '2026-02-15',
  'Compressor stock opening balance',
];

export interface ImportSuppliersModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called once after a successful commit, so the caller can reload its supplier list. */
  readonly onImported: () => void;
}

/** Same two-page ImportModal shell as ImportItemsModal — see its header comment. */
export function ImportSuppliersModal({
  open,
  onClose,
  onImported,
}: ImportSuppliersModalProps): React.JSX.Element | null {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SupplierBalanceImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const runImport = (commit: boolean): void => {
    setError(null);
    setResult(null);
    setBusy(true);
    const call = commit ? ipc.importSupplierBalance.commit() : ipc.importSupplierBalance.dryRun();
    call
      .then((res) => {
        setBusy(false);
        if (res) {
          setResult(res);
          if (commit) onImported();
        }
      })
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : 'Import failed');
      });
  };

  return (
    <ImportModal
      open={open}
      title="Import supplier balances"
      onClose={onClose}
      instructions={
        <>
          <p className="text-sm text-ink">
            Columns: Supplier Name, Phone, Bill Reference, Bill Date, Original Amount (PKR), Amount
            Paid So Far (PKR), Due Date, Notes. Supplier must already exist (matched by name).
          </p>
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                downloadCsv(
                  'supplier-balances-sample.csv',
                  SUPPLIER_BALANCE_SAMPLE_HEADERS,
                  SUPPLIER_BALANCE_SAMPLE_ROW,
                );
              }}
            >
              Download sample CSV
            </Button>
          </div>
        </>
      }
    >
      {error && <Alert variant="danger">{error}</Alert>}
      <p className="text-sm text-ink">Dry run or Commit will open a file picker.</p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            runImport(false);
          }}
        >
          Dry run (no changes saved)
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            runImport(true);
          }}
        >
          Commit import
        </Button>
      </div>
      {result && (
        <div role="status" className="text-sm text-ink">
          <p>
            {result.accepted} accepted, {result.rejected} rejected, {result.skipped} skipped.
            Report: {result.reportPath}
          </p>
        </div>
      )}
    </ImportModal>
  );
}
