import { Alert, Button, TextInput } from '@shop/ui';
import type { PaymentMode } from './NewGrnStep1.js';

export interface GrnCsvStep1Props {
  readonly grnDate: string;
  readonly onGrnDateChange: (value: string) => void;
  readonly supplierBillRef: string;
  readonly onSupplierBillRefChange: (value: string) => void;
  readonly paymentMode: PaymentMode;
  readonly onPaymentModeChange: (mode: PaymentMode) => void;
  readonly onCancel: () => void;
  readonly onNext: () => void;
}

/**
 * Step 1 of GrnCsvImportModal — header details. Not a reuse of
 * NewGrnStep1.tsx: that step BLOCKS Next when credit has no linked
 * supplier; this flow must never block on credit, only warn (per the
 * session brief) — different enough behaviour that sharing one component
 * via a growing prop list was judged worse than two small step files.
 */
export function GrnCsvStep1({
  grnDate,
  onGrnDateChange,
  supplierBillRef,
  onSupplierBillRefChange,
  paymentMode,
  onPaymentModeChange,
  onCancel,
  onNext,
}: GrnCsvStep1Props): React.JSX.Element {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          GRN date
          <input
            type="date"
            value={grnDate}
            onChange={(e) => {
              onGrnDateChange(e.target.value);
            }}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
        </label>
        <TextInput
          label="Bill reference (optional)"
          placeholder="Supplier invoice number"
          value={supplierBillRef}
          onChange={(e) => {
            onSupplierBillRefChange(e.target.value);
          }}
        />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-ink-muted">Payment mode</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              onPaymentModeChange('cash');
            }}
            className={`rounded-md border px-4 py-3 text-base font-medium transition-colors ${
              paymentMode === 'cash'
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface text-ink hover:bg-surface-sunken'
            }`}
          >
            Cash
          </button>
          <button
            type="button"
            onClick={() => {
              onPaymentModeChange('credit');
            }}
            className={`rounded-md border px-4 py-3 text-base font-medium transition-colors ${
              paymentMode === 'credit'
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface text-ink hover:bg-surface-sunken'
            }`}
          >
            Credit
          </button>
        </div>
      </div>

      {paymentMode === 'credit' && (
        <Alert variant="warning">
          Credit purchase will update the supplier ledger. Ensure the correct supplier is linked to
          this PO.
        </Alert>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onNext}>
          Next
        </Button>
      </div>
    </>
  );
}
