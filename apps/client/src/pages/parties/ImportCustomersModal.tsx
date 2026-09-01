import { useState } from 'react';
import { Alert, Button, ImportModal } from '@shop/ui';
import { downloadCsv } from '../../lib/downloadCsv.js';
import { ipc } from '../../lib/ipc.js';
import type { CustomerBalanceImportResult } from '../../types/electron-api.js';

// Mirrors packages/core/src/import/customer-columns.ts's
// CUSTOMER_BALANCE_COLUMNS exactly — apps/client may never import
// @shop/core (architecture boundary), so this is a manually synced local
// copy. Verified against the real file before hardcoding: 7 columns, no
// Due Date (unlike the 8-column supplier sheet — customers don't carry
// payment terms this phase).
const CUSTOMER_BALANCE_SAMPLE_HEADERS = [
  'Customer Name',
  'Phone',
  'Bill Reference',
  'Bill Date',
  'Original Amount (PKR)',
  'Amount Paid So Far (PKR)',
  'Notes',
];
const CUSTOMER_BALANCE_SAMPLE_ROW = [
  'Ahmad Retail',
  '03001234567',
  'BILL-2024-001',
  '2026-01-15',
  '12000',
  '5000',
  'Opening balance',
];

export interface ImportCustomersModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called once after a successful commit, so the caller can reload its customer list. */
  readonly onImported: () => void;
}

/**
 * Replaces the old inline CustomersImportPage card with the same
 * two-page ImportModal shell as Items/Suppliers, for consistency.
 */
export function ImportCustomersModal({
  open,
  onClose,
  onImported,
}: ImportCustomersModalProps): React.JSX.Element | null {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CustomerBalanceImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const runImport = (commit: boolean): void => {
    setError(null);
    setResult(null);
    setBusy(true);
    const call = commit ? ipc.importCustomerBalance.commit() : ipc.importCustomerBalance.dryRun();
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
      title="Import customer balances"
      onClose={onClose}
      instructions={
        <>
          <p className="text-sm text-ink">
            Columns: Customer Name, Phone, Bill Reference, Bill Date, Original Amount (PKR), Amount
            Paid So Far (PKR), Notes. Customer must already exist (matched by name). A bill already
            settled (Paid ≥ Original) is skipped, not rejected.
          </p>
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                downloadCsv(
                  'customer-balances-sample.csv',
                  CUSTOMER_BALANCE_SAMPLE_HEADERS,
                  CUSTOMER_BALANCE_SAMPLE_ROW,
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
