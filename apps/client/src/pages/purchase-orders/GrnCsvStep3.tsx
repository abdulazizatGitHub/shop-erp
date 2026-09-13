import { Alert, Button, MoneyDisplay } from '@shop/ui';
import type { ValidatedGrnRow } from '../../types/electron-api.js';
import type { PaymentMode } from './NewGrnStep1.js';

export interface GrnCsvStep3Props {
  readonly poDocNo: string;
  readonly grnDate: string;
  readonly supplierBillRef: string;
  readonly paymentMode: PaymentMode;
  readonly accepted: readonly ValidatedGrnRow[];
  readonly totalPaisa: number;
  readonly error: string | null;
  readonly submitting: boolean;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
}

/** Step 3 of GrnCsvImportModal — summary before committing via grn:create. */
export function GrnCsvStep3({
  poDocNo,
  grnDate,
  supplierBillRef,
  paymentMode,
  accepted,
  totalPaisa,
  error,
  submitting,
  onBack,
  onConfirm,
}: GrnCsvStep3Props): React.JSX.Element {
  return (
    <>
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-page px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-muted">PO</span>
          <span className="font-medium text-ink">{poDocNo}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted">GRN Date</span>
          <span className="font-medium text-ink">{grnDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted">Bill Reference</span>
          <span className="font-medium text-ink">{supplierBillRef || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted">Payment Mode</span>
          <span className="font-medium capitalize text-ink">{paymentMode}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted">Lines to receive</span>
          <span className="font-medium text-ink">{accepted.length} items</span>
        </div>
        <div className="flex justify-between border-t border-line pt-2">
          <span className="font-semibold text-ink">Total value</span>
          <MoneyDisplay paisaValue={totalPaisa} size="lg" />
        </div>
      </div>

      <div className="flex justify-between gap-3">
        <Button variant="secondary" disabled={submitting} onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" size="large" disabled={submitting} onClick={onConfirm}>
          {submitting ? 'Recording…' : 'Confirm & Record GRN'}
        </Button>
      </div>
    </>
  );
}
