import { Money, Qty } from '@shop/shared';

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
  readonly onRemove: (index: number) => void;
}

export function CartTable({ cart, subtotalPaisa, onRemove }: CartTableProps): React.JSX.Element {
  return (
    <>
      <h2>Cart</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cart.map((line, index) => (
            <tr key={`${line.itemId}-${String(index)}`}>
              <td>{line.itemLabel}</td>
              <td>
                {Qty.format(Qty.of(line.quantityMilli))} {line.unitLabel}
              </td>
              <td>
                {line.unitPricePaisa !== null ? Money.format(Money.of(line.unitPricePaisa)) : '—'}
              </td>
              <td>
                {lineTotalPaisa(line) !== null
                  ? Money.format(Money.of(lineTotalPaisa(line) ?? 0))
                  : '—'}
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => {
                    onRemove(index);
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Subtotal: {Money.format(Money.of(subtotalPaisa))}</p>
    </>
  );
}
