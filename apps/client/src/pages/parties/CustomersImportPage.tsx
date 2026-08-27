import { useState } from 'react';
import { ipc } from '../../lib/ipc.js';
import type { CustomerBalanceImportResult } from '../../types/electron-api.js';

/**
 * P3-4 minimum: opening-balance import only, mirroring
 * SuppliersImportPage.tsx exactly. Customer create/search UI lives on the
 * sale screen (P3-2's SearchSelect), not here.
 */
export function CustomersImportPage(): React.JSX.Element {
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
        if (res) setResult(res);
      })
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : 'Import failed');
      });
  };

  return (
    <div>
      <h1>Customers — Opening Balance Import</h1>
      {error && <p role="alert">{error}</p>}
      <p>
        Columns: Customer Name, Phone, Bill Reference, Bill Date, Original Amount (PKR), Amount Paid
        So Far (PKR), Notes. Customer must already exist (matched by name). A bill already settled
        (Paid ≥ Original) is skipped, not rejected.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          runImport(false);
        }}
      >
        Dry run (no changes saved)
      </button>{' '}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          runImport(true);
        }}
      >
        Commit import
      </button>
      {result && (
        <div role="status">
          <p>
            {result.accepted} accepted, {result.rejected} rejected, {result.skipped} skipped.
            Report: {result.reportPath}
          </p>
        </div>
      )}
    </div>
  );
}
