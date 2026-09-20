import { Alert, Button, TextInput } from '@shop/ui';
import { sanitizeMoneyInput } from './money-input.js';

export interface JobDeliveryPaymentPanelProps {
  readonly multiPayer: boolean;
  readonly paidRupees: string;
  readonly onPaidRupeesChange: (value: string) => void;
  readonly grandTotalRupees: string;
  readonly submitting: boolean;
  readonly onDeliver: () => void;
}

/**
 * Split out of JobDeliveryDrawer.tsx (now JobDeliveryModal.tsx, F3) to
 * keep that file under the 300-line limit — same content/behaviour as
 * the retired JobDeliverPaymentBox.tsx.
 * The Cash/Credit toggle is a shortcut for the "Amount paid" field —
 * DeliverJobInput has no paymentMode field, so Cash just sets the field
 * to the full total and Credit sets it to 0; no new IPC state. Its
 * selected/unselected styling (border-brand+bg-brand vs border-line+
 * bg-surface) already matches PaymentMethodToggle.tsx's active/inactive
 * pattern (RecordPaymentModal.tsx's equivalent control) — confirmed by
 * reading it for G5, so left unchanged. "Deliver & Invoice" now uses the
 * shared Button component's variant="primary" (G5) instead of a raw
 * green <button> — was a DEBT-1 exception (PROJECT.md) from when
 * packages/ui primitives were off-limits; that restriction no longer
 * applies here.
 */
export function JobDeliveryPaymentPanel({
  multiPayer,
  paidRupees,
  onPaidRupeesChange,
  grandTotalRupees,
  submitting,
  onDeliver,
}: JobDeliveryPaymentPanelProps): React.JSX.Element {
  const isCashSelected = paidRupees === grandTotalRupees;
  const isCreditSelected = paidRupees === '0';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      {multiPayer ? (
        <Alert variant="warning">
          Lines are split across more than one payer — partial payment isn't supported for a
          multi-payer delivery, so this must be recorded fully on credit (paid = Rs 0) and each
          payer settles separately.
        </Alert>
      ) : (
        <>
          <TextInput
            label="Amount paid (Rs)"
            variant="number"
            value={paidRupees}
            onChange={(e) => {
              onPaidRupeesChange(sanitizeMoneyInput(e.target.value));
            }}
          />
          <div role="radiogroup" aria-label="Payment mode" className="grid grid-cols-2 gap-3">
            <button
              type="button"
              role="radio"
              aria-checked={isCashSelected}
              onClick={() => {
                onPaidRupeesChange(grandTotalRupees);
              }}
              className={`rounded-md border px-4 py-3 text-base font-medium transition-colors ${
                isCashSelected
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-surface text-ink hover:bg-surface-sunken'
              }`}
            >
              Cash
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={isCreditSelected}
              onClick={() => {
                onPaidRupeesChange('0');
              }}
              className={`rounded-md border px-4 py-3 text-base font-medium transition-colors ${
                isCreditSelected
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-surface text-ink hover:bg-surface-sunken'
              }`}
            >
              Credit
            </button>
          </div>
        </>
      )}
      <Button variant="primary" size="large" fullWidth disabled={submitting} onClick={onDeliver}>
        Deliver &amp; Invoice
      </Button>
    </div>
  );
}
