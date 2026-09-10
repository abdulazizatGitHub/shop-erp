import { MoneyDisplay, QuantityDisplay } from '@shop/ui';
import { lineTotalPaisa, type CartLine } from './CartTable.js';

export interface CheckoutOrderSummaryProps {
  readonly cart: readonly CartLine[];
  readonly subtotalPaisa: number;
  readonly discountPaisa: number;
  readonly totalPaisa: number;
}

/** CheckoutModal's order-items list + Total/Discount/Tax/Subtotal calc block. Extracted to keep CheckoutModal.tsx under the 300-line cap. */
export function CheckoutOrderSummary({
  cart,
  subtotalPaisa,
  discountPaisa,
  totalPaisa,
}: CheckoutOrderSummaryProps): React.JSX.Element {
  return (
    <div>
      <p className="mb-1 text-caption font-bold uppercase tracking-[0.08em] text-ink-muted">
        Order items
      </p>
      <div>
        {cart.map((line, index) => {
          const lineTotalAmountPaisa = lineTotalPaisa(line);
          return (
            <div
              key={`${line.itemId}-${String(index)}`}
              className="flex items-center gap-2 border-b border-surface-input py-1.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-callout text-ink-muted">
                {line.itemLabel}
              </span>
              <span className="w-[52px] shrink-0 text-center text-callout text-ink-faint">
                <QuantityDisplay quantityMilli={line.quantityMilli} /> {line.unitLabel}
              </span>
              <span className="min-w-[60px] shrink-0 text-right text-callout font-semibold text-ink">
                {lineTotalAmountPaisa !== null ? (
                  <MoneyDisplay paisaValue={lineTotalAmountPaisa} size="sm" />
                ) : (
                  '—'
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-xs text-ink-faint">
          <span>Total</span>
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
        <div className="my-1.5 border-t-[1.5px] border-line" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink">Subtotal</span>
          <MoneyDisplay paisaValue={totalPaisa} size="grand" tone="accent" />
        </div>
      </div>
    </div>
  );
}
