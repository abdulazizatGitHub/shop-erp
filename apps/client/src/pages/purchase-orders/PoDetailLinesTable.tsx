import type { ItemDto, ItemLookups } from '@shop/contracts';
import {
  QuantityDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import type { PurchaseOrderLineRecord } from '../../types/electron-api.js';

export interface PoDetailLinesTableProps {
  readonly lines: readonly PurchaseOrderLineRecord[];
  readonly items: readonly ItemDto[] | null;
  readonly lookups: ItemLookups | null;
}

/** Resolves itemId -> name/stock-uom client-side — PurchaseOrderLineRecord carries no itemName (confirmed against the live type). */
export function PoDetailLinesTable({
  lines,
  items,
  lookups,
}: PoDetailLinesTableProps): React.JSX.Element {
  const itemById = (id: string): ItemDto | undefined => items?.find((i) => i.id === id);
  const uomName = (id: string): string => lookups?.uoms.find((u) => u.id === id)?.name ?? id;

  return (
    <Table>
      <TableHead>
        <TableRow zebra={false} hover="neutral">
          <TableHeaderCell className="tracking-wide text-ink-faint">Item</TableHeaderCell>
          <TableHeaderCell className="tracking-wide text-ink-faint">Unit</TableHeaderCell>
          <TableHeaderCell className="text-right tracking-wide text-ink-faint">
            Ordered
          </TableHeaderCell>
          <TableHeaderCell className="text-right tracking-wide text-ink-faint">
            Received
          </TableHeaderCell>
          <TableHeaderCell className="text-right tracking-wide text-ink-faint">
            Remaining
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {lines.map((line) => {
          const item = itemById(line.itemId);
          const remainingMilli = line.quantityOrderedMilli - line.quantityReceivedMilli;
          const fullyReceived = remainingMilli <= 0;
          return (
            <TableRow key={line.id} zebra={false} hover="neutral">
              <TableCell className={`py-2 ${fullyReceived ? 'text-ink-faint line-through' : ''}`}>
                {item?.nameEn ?? line.itemId}
              </TableCell>
              <TableCell className={`py-2 ${fullyReceived ? 'text-ink-faint' : ''}`}>
                {item ? uomName(item.stockUomId) : '—'}
              </TableCell>
              <TableCell className="py-2 text-right">
                <QuantityDisplay quantityMilli={line.quantityOrderedMilli} />
              </TableCell>
              <TableCell className="py-2 text-right">
                <QuantityDisplay quantityMilli={line.quantityReceivedMilli} />
              </TableCell>
              <TableCell className="py-2 text-right">
                <QuantityDisplay quantityMilli={Math.max(remainingMilli, 0)} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
