import { Money } from '@shop/shared';
import { Button, MoneyDisplay } from '@shop/ui';

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
  readonly cartEmpty: boolean;
  /** Opens the checkout modal — payment mode/amount/confirm all live there now. */
  readonly onOpenCheckout: () => void;
}

/** Right-panel footer: discount presets + calculation block + Complete sale (opens CheckoutModal). Payment mode/amount/confirm moved to CheckoutModal.tsx. */
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
  cartEmpty,
  onOpenCheckout,
}: CheckoutPanelProps): React.JSX.Element {
  return (
    <div className="mt-3 flex flex-col gap-3">
      {discountApplicable && (discountPkrEnabled || discountPctEnabled) && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-ink-muted">Discount</span>
          <div className="flex items-center gap-2">
            {discountPkrEnabled && (
              <select
                aria-label="Discount (PKR)"
                value={selectedDiscountPkrPaisa}
                disabled={selectedDiscountPct > 0}
                onChange={(e) => {
                  onSelectedDiscountPkrPaisaChange(Number(e.target.value));
                }}
                className="h-[26px] max-w-[85px] rounded-md border border-line bg-surface-input px-1.5 text-[11px] disabled:opacity-50"
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
                className="h-[26px] max-w-[85px] rounded-md border border-line bg-surface-input px-1.5 text-[11px] disabled:opacity-50"
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
        </div>
      )}

      <div className="rounded-[9px] bg-surface-input px-2.5 py-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-faint">Total</span>
          <MoneyDisplay paisaValue={subtotalPaisa} size="sm" />
        </div>
        {discountPaisa > 0 && (
          <div className="flex items-center justify-between text-xs font-medium text-warning">
            <span>Discount</span>
            <span>
              -<MoneyDisplay paisaValue={discountPaisa} size="sm" />
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-ink-faint">
          <span>Tax</span>
          <MoneyDisplay paisaValue={0} size="sm" />
        </div>
        <div className="my-1.5 border-t border-line" />
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-ink">Subtotal</span>
          <MoneyDisplay paisaValue={totalPaisa} size="grand" />
        </div>
      </div>

      <Button
        variant="posAccent"
        size="large"
        fullWidth
        disabled={cartEmpty}
        onClick={onOpenCheckout}
      >
        ✓ Complete sale <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-xs">F10</kbd>
      </Button>
    </div>
  );
}
