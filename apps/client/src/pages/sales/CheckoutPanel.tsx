import type { CustomerDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Button, MoneyDisplay, TextInput } from '@shop/ui';

export type PaymentMode = 'cash' | 'credit';

/** Matches the stroke-icon convention used elsewhere (CartLineRow, CustomerStrip): 24x24 viewBox, currentColor stroke. */
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

export interface CheckoutPanelProps {
  readonly subtotalPaisa: number;
  readonly discountPaisa: number;
  readonly totalPaisa: number;
  /** false: no preset list applies to this customer — the whole discount section is hidden. */
  readonly discountApplicable: boolean;
  readonly discountPkrEnabled: boolean;
  readonly discountPkrOptionsPaisa: readonly number[];
  readonly selectedDiscountPkrPaisa: number;
  readonly onSelectedDiscountPkrPaisaChange: (paisa: number) => void;
  readonly discountPctEnabled: boolean;
  readonly discountPctOptions: readonly number[];
  readonly selectedDiscountPct: number;
  readonly onSelectedDiscountPctChange: (pct: number) => void;
  readonly paymentMode: PaymentMode;
  readonly onPaymentModeChange: (mode: PaymentMode) => void;
  readonly selectedCustomer: CustomerDto | null;
  readonly amountPaidRupees: string;
  readonly onAmountPaidChange: (value: string) => void;
  readonly cartEmpty: boolean;
  readonly onCheckout: () => void;
  readonly paymentModeRef: React.RefObject<HTMLDivElement>;
  readonly amountPaidRef: React.RefObject<HTMLInputElement>;
}

/** Right panel: totals, discount, payment mode, amount/change, Complete sale. No cart or customer-search logic — those stay in SalePage/CartTable/CustomerStrip. */
export function CheckoutPanel({
  subtotalPaisa,
  discountPaisa,
  totalPaisa,
  discountApplicable,
  discountPkrEnabled,
  discountPkrOptionsPaisa,
  selectedDiscountPkrPaisa,
  onSelectedDiscountPkrPaisaChange,
  discountPctEnabled,
  discountPctOptions,
  selectedDiscountPct,
  onSelectedDiscountPctChange,
  paymentMode,
  onPaymentModeChange,
  selectedCustomer,
  amountPaidRupees,
  onAmountPaidChange,
  cartEmpty,
  onCheckout,
  paymentModeRef,
  amountPaidRef,
}: CheckoutPanelProps): React.JSX.Element {
  let paidAmountPaisa: number | null = null;
  try {
    paidAmountPaisa = Money.fromRupees(amountPaidRupees);
  } catch {
    paidAmountPaisa = null;
  }
  const udhaarDisabled = selectedCustomer === null;

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
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <div className="flex items-center justify-between text-xs text-ink-faint">
          <span>Subtotal</span>
          <MoneyDisplay paisaValue={subtotalPaisa} size="sm" />
        </div>

        {discountApplicable && (discountPkrEnabled || discountPctEnabled) && (
          <>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              Discount
            </p>
            <div className="mt-1 flex items-center gap-2">
              {discountPkrEnabled && (
                <select
                  aria-label="Discount (PKR)"
                  value={selectedDiscountPkrPaisa}
                  disabled={selectedDiscountPct > 0}
                  onChange={(e) => {
                    onSelectedDiscountPkrPaisaChange(Number(e.target.value));
                  }}
                  className="h-9 flex-1 rounded-md border border-line bg-surface-input px-2 text-sm disabled:opacity-50"
                >
                  <option value={0}>None</option>
                  {discountPkrOptionsPaisa.map((paisa) => (
                    <option key={paisa} value={paisa}>
                      Rs {Money.toRupees(Money.of(paisa))}
                    </option>
                  ))}
                </select>
              )}
              {discountPctEnabled && (
                <select
                  aria-label="Discount (%)"
                  value={selectedDiscountPct}
                  disabled={selectedDiscountPkrPaisa > 0}
                  onChange={(e) => {
                    onSelectedDiscountPctChange(Number(e.target.value));
                  }}
                  className="h-9 flex-1 rounded-md border border-line bg-surface-input px-2 text-sm disabled:opacity-50"
                >
                  <option value={0}>None</option>
                  {discountPctOptions.map((pct) => (
                    <option key={pct} value={pct}>
                      {pct}%
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}

        {discountPaisa > 0 && (
          <div className="mt-1 flex items-center justify-between text-xs font-medium text-warning">
            <span>Discount</span>
            <span>
              -<MoneyDisplay paisaValue={discountPaisa} size="sm" />
            </span>
          </div>
        )}

        <div className="my-2 border-t border-line" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            Total
          </span>
          <MoneyDisplay paisaValue={totalPaisa} size="grand" />
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          Payment mode
        </p>
        <div
          ref={paymentModeRef}
          tabIndex={0}
          role="radiogroup"
          aria-label="Payment mode"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              if (udhaarDisabled && paymentMode === 'cash') return;
              onPaymentModeChange(paymentMode === 'cash' ? 'credit' : 'cash');
            } else if (e.key === 'Enter') {
              e.preventDefault();
              amountPaidRef.current?.focus();
            }
          }}
          className="grid grid-cols-2 gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <button
            type="button"
            tabIndex={-1}
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
            tabIndex={-1}
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
                onCheckout();
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

      <Button variant="posAccent" size="large" fullWidth disabled={cartEmpty} onClick={onCheckout}>
        ✓ Complete sale <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-xs">F10</kbd>
      </Button>
    </div>
  );
}
