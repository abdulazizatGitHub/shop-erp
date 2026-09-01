import { Money } from '@shop/shared';
import {
  EmptyState,
  MoneyDisplay,
  QuantityDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';

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
  if (cart.length === 0) {
    return <EmptyState message="Cart is empty." hint="Search for an item above to add it." />;
  }

  return (
    <div>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Item</TableHeaderCell>
            <TableHeaderCell>Qty</TableHeaderCell>
            <TableHeaderCell>Unit</TableHeaderCell>
            <TableHeaderCell className="text-right">Unit Price</TableHeaderCell>
            <TableHeaderCell className="text-right">Line Total</TableHeaderCell>
            <TableHeaderCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {cart.map((line, index) => {
            const lineTotal = lineTotalPaisa(line);
            return (
              <TableRow key={`${line.itemId}-${String(index)}`}>
                <TableCell className="max-w-xs truncate" title={line.itemLabel}>
                  {line.itemLabel}
                </TableCell>
                <TableCell>
                  <QuantityDisplay quantityMilli={line.quantityMilli} />
                </TableCell>
                <TableCell>{line.unitLabel}</TableCell>
                <TableCell className="text-right">
                  {line.unitPricePaisa !== null ? (
                    <MoneyDisplay paisaValue={line.unitPricePaisa} />
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {lineTotal !== null ? <MoneyDisplay paisaValue={lineTotal} /> : '—'}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    aria-label={`Remove ${line.itemLabel}`}
                    onClick={() => {
                      onRemove(index);
                    }}
                    className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger-subtle"
                  >
                    × Remove
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="mt-3 flex items-center justify-end gap-3 border-t border-line pt-3">
        <span className="text-lg font-semibold text-ink">Subtotal</span>
        <MoneyDisplay paisaValue={subtotalPaisa} size="xl" />
      </div>
    </div>
  );
}
