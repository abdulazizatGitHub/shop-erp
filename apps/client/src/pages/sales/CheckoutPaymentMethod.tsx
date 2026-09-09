import type { PaymentMode } from './useSaleFlow.js';

/** Same stroke-icon convention used elsewhere (CartLineRow, CustomerStrip): 24x24 viewBox, currentColor stroke. */
function CashIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 6v0M18 18v0" />
    </svg>
  );
}

function UdhaarIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2" />
      <path d="M9 2h6" />
    </svg>
  );
}

export interface CheckoutPaymentMethodProps {
  readonly paymentMode: PaymentMode;
  readonly onPaymentModeChange: (mode: PaymentMode) => void;
  readonly udhaarDisabled: boolean;
}

/** CheckoutModal's Cash/Udhaar toggle. Extracted to keep CheckoutModal.tsx under the 300-line cap. */
export function CheckoutPaymentMethod({
  paymentMode,
  onPaymentModeChange,
  udhaarDisabled,
}: CheckoutPaymentMethodProps): React.JSX.Element {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        Payment method
      </p>
      <div role="radiogroup" aria-label="Payment mode" className="grid grid-cols-2 gap-3">
        <button
          type="button"
          role="radio"
          aria-checked={paymentMode === 'cash'}
          onClick={() => {
            onPaymentModeChange('cash');
          }}
          className={`flex h-[42px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border-[1.5px] text-base font-semibold transition-colors ${
            paymentMode === 'cash'
              ? 'border-success-subtle bg-success-subtle text-success'
              : 'border-line bg-surface-input text-ink-muted hover:bg-surface-sunken'
          }`}
        >
          <CashIcon />
          Cash
          <kbd className="rounded border border-line-strong bg-surface-page px-1.5 py-0.5 font-mono text-[10px]">
            C
          </kbd>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={paymentMode === 'credit'}
          aria-disabled={udhaarDisabled}
          title={udhaarDisabled ? 'Select a customer first.' : undefined}
          onClick={() => {
            if (!udhaarDisabled) onPaymentModeChange('credit');
          }}
          className={`flex h-[42px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border-[1.5px] text-base font-semibold transition-colors ${
            udhaarDisabled
              ? 'pointer-events-none border-line bg-surface-input text-ink-faint opacity-50'
              : paymentMode === 'credit'
                ? 'border-warning-subtle bg-warning-subtle text-warning'
                : 'border-line bg-surface-input text-ink-muted hover:bg-surface-sunken'
          }`}
        >
          <UdhaarIcon />
          Udhaar
          <kbd className="rounded border border-line-strong bg-surface-page px-1.5 py-0.5 font-mono text-[10px]">
            U
          </kbd>
        </button>
      </div>
    </div>
  );
}
