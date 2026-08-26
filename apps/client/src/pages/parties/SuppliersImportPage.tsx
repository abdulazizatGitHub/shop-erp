import { useState } from 'react';
import { ipc } from '../../lib/ipc.js';
import type { SupplierBalanceImportResult } from '../../types/electron-api.js';

/**
 * P2-3 minimum: opening-balance import only. Supplier create/search UI is
 * out of P2-1's scope this phase (its own verification was DB-level, not
 * UI) — this page exists solely so the owner can actually run the import
 * described in docs/phases/PHASE_2.md.
 */
export function SuppliersImportPage(): React.JSX.Element {
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
        if (res) setResult(res);
      })
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : 'Import failed');
      });
  };

  return (
    <div>
      <h1>Suppliers — Opening Balance Import</h1>
      {error && <p role="alert">{error}</p>}
      <p>
        Columns: Supplier Name, Phone, Bill Reference, Bill Date, Original Amount (PKR), Amount Paid
        So Far (PKR), Due Date, Notes. Supplier must already exist (matched by name).
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
