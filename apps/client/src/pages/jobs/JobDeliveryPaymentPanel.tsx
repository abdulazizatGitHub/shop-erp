import { Alert, TextInput } from '@shop/ui';

export interface JobDeliveryPaymentPanelProps {
  readonly multiPayer: boolean;
  readonly paidRupees: string;
  readonly onPaidRupeesChange: (value: string) => void;
  readonly grandTotalRupees: string;
  readonly submitting: boolean;
  readonly onDeliver: () => void;
}

/**
 * Split out of JobDeliveryDrawer.tsx to keep that file under the 300-line
 * limit — same content/behaviour as the retired JobDeliverPaymentBox.tsx.
 * The Cash/Credit toggle is a shortcut for the "Amount paid" field —
 * DeliverJobInput has no paymentMode field, so Cash just sets the field
 * to the full total and Credit sets it to 0; no new IPC state. "Deliver &
 * Invoice" is a raw <button> (not the shared Button component) to get
 * the green the brief asks for — Button has no green variant and
 * packages/ui primitives are off-limits this session; same DEBT-1
 * category as JobDetailHeader's status pills (PROJECT.md).
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
              onPaidRupeesChange(e.target.value);
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
      <button
        type="button"
        disabled={submitting}
        onClick={onDeliver}
        className="w-full rounded-md bg-green-600 px-6 py-3 text-lg font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Deliver &amp; Invoice
      </button>
    </div>
  );
}
