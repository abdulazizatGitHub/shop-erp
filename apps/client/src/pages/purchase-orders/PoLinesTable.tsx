import {
  EmptyState,
  QuantityDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';

export interface PoLine {
  readonly itemId: string;
  readonly itemLabel: string;
  readonly unitLabel: string;
  readonly quantityMilli: number;
  readonly notes: string | null;
}

export interface PoLinesTableProps {
  readonly lines: readonly PoLine[];
  readonly onRemove: (index: number) => void;
}

/**
 * PO line entry has no price at all (prices are entered at GRN time), so
 * the shared sale-screen CartTable/CartLineRow — built around an
 * always-present unit-price/subtotal column — doesn't fit; this table
 * needs a Notes column instead, which CartLineRow has no slot for.
 */
export function PoLinesTable({ lines, onRemove }: PoLinesTableProps): React.JSX.Element {
  if (lines.length === 0) {
    return <EmptyState message="No lines added yet." />;
  }

  return (
    <Table>
      <TableHead>
        <TableRow zebra={false} hover="neutral">
          <TableHeaderCell className="tracking-wide text-ink-faint">Item</TableHeaderCell>
          <TableHeaderCell className="tracking-wide text-ink-faint">Unit</TableHeaderCell>
          <TableHeaderCell className="text-right tracking-wide text-ink-faint">
            Qty ordered
          </TableHeaderCell>
          <TableHeaderCell className="tracking-wide text-ink-faint">Notes</TableHeaderCell>
          <TableHeaderCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {lines.map((line, index) => (
          <TableRow key={`${line.itemId}-${String(index)}`} zebra={false} hover="neutral">
            <TableCell className="py-2">{line.itemLabel}</TableCell>
            <TableCell className="py-2">{line.unitLabel}</TableCell>
            <TableCell className="py-2 text-right">
              <QuantityDisplay quantityMilli={line.quantityMilli} />
            </TableCell>
            <TableCell className="py-2">{line.notes ?? '—'}</TableCell>
            <TableCell className="py-2">
              <button
                type="button"
                aria-label={`Remove ${line.itemLabel}`}
                onClick={() => {
                  onRemove(index);
                }}
                className="text-ink-faint hover:text-danger"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                >
                  <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" />
                </svg>
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
