import { useEffect, useRef } from 'react';
import type { CustomerDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { MoneyDisplay, TextInput } from '@shop/ui';
import type { CartLine } from './CartTable.js';
import { CheckoutOrderSummary } from './CheckoutOrderSummary.js';
import { CheckoutPaymentMethod } from './CheckoutPaymentMethod.js';
import type { PaymentMode } from './useSaleFlow.js';

function ReceiptIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

export interface CheckoutModalProps {
  readonly open: boolean;
  readonly cart: readonly CartLine[];
  readonly subtotalPaisa: number;
  readonly discountPaisa: number;
  readonly totalPaisa: number;
  readonly paymentMode: PaymentMode;
  readonly onPaymentModeChange: (mode: PaymentMode) => void;
  readonly selectedCustomer: CustomerDto | null;
  readonly amountPaidRupees: string;
  readonly onAmountPaidChange: (value: string) => void;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly amountPaidRef: React.RefObject<HTMLInputElement>;
}

/**
 * Pre-submit checkout modal: order summary, calc summary (CheckoutOrderSummary),
 * payment method (CheckoutPaymentMethod), amount received (cash), change/
 * short, Confirm sale. Payment mode/amount state itself still lives in
 * useSaleFlow — this is purely a different place to render the same bound
 * values/setters CheckoutPanel used to.
 */
export function CheckoutModal({
  open,
  cart,
  subtotalPaisa,
  discountPaisa,
  totalPaisa,
  paymentMode,
  onPaymentModeChange,
  selectedCustomer,
  amountPaidRupees,
  onAmountPaidChange,
  onClose,
  onConfirm,
  amountPaidRef,
}: CheckoutModalProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const udhaarDisabled = selectedCustomer === null;

  // Autofocus target depends on payment mode: the amount input in cash
  // mode, or the Confirm button in credit mode (the amount input is
  // hidden there — focusing it would be invisible and confusing).
  useEffect(() => {
    if (!open) return;
    if (paymentMode === 'cash') {
      amountPaidRef.current?.focus();
    } else {
      confirmButtonRef.current?.focus();
    }
  }, [open, paymentMode, amountPaidRef]);

  if (!open) return null;

  let paidAmountPaisa: number | null = null;
  try {
    paidAmountPaisa = Money.fromRupees(amountPaidRupees);
  } catch {
    paidAmountPaisa = null;
  }

  const diffPaisa =
    paidAmountPaisa !== null
      ? Money.subtract(Money.of(paidAmountPaisa), Money.of(totalPaisa))
      : null;
  const showChange =
    paymentMode === 'cash' && diffPaisa !== null && Money.compare(diffPaisa, Money.ZERO) > 0;
  const showShort =
    paymentMode === 'cash' &&
    diffPaisa !== null &&
    Money.compare(diffPaisa, Money.ZERO) < 0 &&
    paidAmountPaisa !== null &&
    Money.compare(Money.of(paidAmountPaisa), Money.ZERO) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Checkout"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        className="flex max-h-[90vh] w-full max-w-[440px] flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-[22px] shadow-[0_20px_60px_rgba(0,0,0,.18)] outline-none"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
            <ReceiptIcon />
            Checkout
          </span>
          <button
            type="button"
            aria-label="Close checkout"
            onClick={onClose}
            className="rounded p-1 text-ink-faint hover:bg-surface-input hover:text-ink"
          >
            ✕
          </button>
        </div>

        <CheckoutOrderSummary
          cart={cart}
          subtotalPaisa={subtotalPaisa}
          discountPaisa={discountPaisa}
          totalPaisa={totalPaisa}
        />

        <CheckoutPaymentMethod
          paymentMode={paymentMode}
          onPaymentModeChange={onPaymentModeChange}
          udhaarDisabled={udhaarDisabled}
        />

        {paymentMode === 'cash' ? (
          <div>
            <TextInput
              ref={amountPaidRef}
              label="Amount received"
              variant="number"
              size="large"
              align="right"
              value={amountPaidRupees}
              onChange={(e) => {
                onAmountPaidChange(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onConfirm();
                }
              }}
            />
            {showChange && (
              <div className="mt-2 flex items-center justify-between rounded-md border border-success-subtle bg-success-subtle px-3 py-2 text-sm font-medium text-success">
                <span>↩ Change due</span>
                <MoneyDisplay paisaValue={diffPaisa} size="sm" />
              </div>
            )}
            {showShort && (
              <div className="mt-2 flex items-center justify-between rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-sm font-medium text-danger">
                <span>Amount short</span>
                <MoneyDisplay paisaValue={Money.negate(diffPaisa)} size="sm" />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2 text-sm text-warning">
            Balance will be added to customer&rsquo;s ledger
          </div>
        )}

        <button
          ref={confirmButtonRef}
          type="button"
          onClick={onConfirm}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-pos-accent text-[14px] font-extrabold text-white shadow-[0_2px_8px_rgba(37,99,235,.25)] transition-all hover:-translate-y-px hover:bg-pos-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          ✓ Confirm sale
        </button>
      </div>
    </div>
  );
}
