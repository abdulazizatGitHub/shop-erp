import type { ItemDto } from '@shop/contracts';
import {
  MoneyDisplay,
  QuantityDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import type { GrnLineRecord } from '../../types/electron-api.js';

export interface GrnDetailLinesTableProps {
  readonly lines: readonly GrnLineRecord[];
  readonly items: readonly ItemDto[] | null;
}

/** Resolves itemId -> name client-side — GrnLineRecord carries no itemName (confirmed against the live type). */
export function GrnDetailLinesTable({ lines, items }: GrnDetailLinesTableProps): React.JSX.Element {
  const itemById = (id: string): ItemDto | undefined => items?.find((i) => i.id === id);

  return (
    <Table>
      <TableHead>
        <TableRow zebra={false} hover="neutral">
          <TableHeaderCell className="tracking-wide text-ink-faint">Item</TableHeaderCell>
          <TableHeaderCell className="text-right tracking-wide text-ink-faint">
            Qty received
          </TableHeaderCell>
          <TableHeaderCell className="text-right tracking-wide text-ink-faint">
            Unit cost
          </TableHeaderCell>
          <TableHeaderCell className="text-right tracking-wide text-ink-faint">
            Selling price
          </TableHeaderCell>
          <TableHeaderCell className="text-right tracking-wide text-ink-faint">
            Wholesale price
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {lines.map((line) => {
          const item = itemById(line.itemId);
          return (
            <TableRow key={line.id} zebra={false} hover="neutral">
              <TableCell className="py-2">{item?.nameEn ?? line.itemId}</TableCell>
              <TableCell className="py-2 text-right">
                <QuantityDisplay quantityMilli={line.quantityReceivedMilli} />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyDisplay paisaValue={line.unitCostPaisa} />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyDisplay paisaValue={line.sellingPricePaisa} />
              </TableCell>
              <TableCell className="py-2 text-right">
                {line.wholesalePricePaisa !== null ? (
                  <MoneyDisplay paisaValue={line.wholesalePricePaisa} />
                ) : (
                  '—'
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
