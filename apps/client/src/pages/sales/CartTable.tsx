import type { ItemLookups } from '@shop/contracts';
import { Money } from '@shop/shared';
import { MoneyDisplay } from '@shop/ui';
import { CartLineRow } from './CartLineRow.js';

export interface CartLine {
  readonly itemId: string;
  readonly itemLabel: string;
  readonly quantityMilli: number;
  /** Retail-price preview only — never sent to sale:create. */
  readonly unitPricePaisa: number | null;
  /** Name of the unit quantityMilli was entered in — e.g. "Foot" or "Kg". */
  readonly unitLabel: string;
  // ADR-0013 Type 2 — both present only when the salesman entered the
  // quantity in the item's alt unit; passed through unchanged to
  // sale:create.
  readonly saleUomId?: string | undefined;
  readonly saleToStockFactor?: number | undefined;
  /** For the cart row's Parts/Repair pill — resolved against ItemLookups, no new IPC. Optional: existing test fixtures predate this field. */
  readonly businessUnitId?: string | null;
}

/**
 * BUG-B fix (found P4-1d real-hardware testing): adding the same item
 * twice created two separate lines instead of merging quantity into
 * the existing one. "Same line" means same itemId AND same saleUomId
 * — undefined matches undefined (two stock-unit adds merge), but a
 * stock-unit line and an alt-unit line for the same item stay distinct
 * even though they share an itemId, since they represent physically
 * different units being sold.
 */
export function mergeCartLine(cart: readonly CartLine[], newLine: CartLine): readonly CartLine[] {
  const matchIndex = cart.findIndex(
    (line) => line.itemId === newLine.itemId && line.saleUomId === newLine.saleUomId,
  );
  if (matchIndex === -1) {
    return [...cart, newLine];
  }
  return cart.map((line, index) =>
    index === matchIndex
      ? { ...line, quantityMilli: line.quantityMilli + newLine.quantityMilli }
      : line,
  );
}

export function lineTotalPaisa(line: CartLine): number | null {
  return line.unitPricePaisa === null
    ? null
    : Money.multiplyByQuantity(Money.of(line.unitPricePaisa), line.quantityMilli);
}

export interface CartTableProps {
  readonly cart: readonly CartLine[];
  readonly subtotalPaisa: number;
  /** Optional: only the sale screen resolves Parts/Repair pills. Other callers (e.g. PurchasePage) omit it and get no pill. */
  readonly lookups?: ItemLookups | null;
  readonly onRemove: (index: number) => void;
  /** Optional: when omitted, no "Clear" link is rendered (existing callers like PurchasePage keep their prior behavior). */
  readonly onClear?: () => void;
}

export function CartTable({
  cart,
  subtotalPaisa,
  lookups = null,
  onRemove,
  onClear,
}: CartTableProps): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col rounded-lg border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Cart</span>
        <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-[11px] font-medium text-brand">
          {cart.length} {cart.length === 1 ? 'item' : 'items'}
        </span>
        {cart.length > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto text-xs font-medium text-danger hover:underline"
          >
            🗑 Clear
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-8 text-center">
          <svg
            viewBox="0 0 24 24"
            width="28"
            height="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mb-1 text-ink-faint"
          >
            <path d="M3 4h2l2 10h10l2-8H6" />
            <circle cx="9" cy="20" r="1" />
            <circle cx="17" cy="20" r="1" />
          </svg>
          <p className="text-sm font-medium text-ink-muted">Cart is empty</p>
          <p className="text-xs text-ink-faint">Search an item and press Enter to add</p>
        </div>
      ) : (
        <>
          <div>
            {cart.map((line, index) => (
              <CartLineRow
                key={`${line.itemId}-${String(index)}`}
                line={line}
                lookups={lookups}
                onRemove={() => {
                  onRemove(index);
                }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-3 border-t border-line pt-3">
            <span className="text-lg font-semibold text-ink">Subtotal</span>
            <MoneyDisplay paisaValue={subtotalPaisa} size="xl" />
          </div>
        </>
      )}
    </div>
  );
}
