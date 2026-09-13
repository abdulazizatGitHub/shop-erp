import { Alert, Button, TextInput } from '@shop/ui';

export type PaymentMode = 'cash' | 'credit';

export interface NewGrnStep1Props {
  readonly grnDate: string;
  readonly onGrnDateChange: (value: string) => void;
  readonly supplierBillRef: string;
  readonly onSupplierBillRefChange: (value: string) => void;
  readonly paymentMode: PaymentMode;
  readonly onPaymentModeChange: (mode: PaymentMode) => void;
  readonly notes: string;
  readonly onNotesChange: (value: string) => void;
  /** True when the PO has no linked supplier (supplierNote-only) — credit is blocked in that case. */
  readonly creditBlockedNoSupplier: boolean;
  readonly onCancel: () => void;
  readonly onNext: () => void;
}

/** Step 1 of NewGrnModal — header details. Extracted to keep the modal under 300 lines. */
export function NewGrnStep1({
  grnDate,
  onGrnDateChange,
  supplierBillRef,
  onSupplierBillRefChange,
  paymentMode,
  onPaymentModeChange,
  notes,
  onNotesChange,
  creditBlockedNoSupplier,
  onCancel,
  onNext,
}: NewGrnStep1Props): React.JSX.Element {
  const nextDisabled = paymentMode === 'credit' && creditBlockedNoSupplier;

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
          label="Supplier bill reference (optional)"
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

      {paymentMode === 'credit' && creditBlockedNoSupplier && (
        <Alert variant="warning">
          Credit purchase requires a linked supplier. Please create the supplier first or change
          payment mode to Cash.
        </Alert>
      )}

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Notes (optional)
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => {
            onNotesChange(e.target.value);
          }}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
        />
      </label>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" disabled={nextDisabled} onClick={onNext}>
          Next
        </Button>
      </div>
    </>
  );
}
