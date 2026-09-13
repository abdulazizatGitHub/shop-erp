import { QuantityDisplay, TableCell, TableRow, TextInput } from '@shop/ui';
import type { GrnLineEntry } from './grnLines.js';
import { validateReceivingNow } from './grnLines.js';

export interface GrnLineRowProps {
  readonly line: GrnLineEntry;
  readonly onChange: (patch: Partial<GrnLineEntry>) => void;
  /** Only unplanned lines (purchaseOrderLineId === null) can be removed. */
  readonly onRemove?: (() => void) | undefined;
}

/** One editable GRN line — a pre-filled PO line, or an unplanned addition. */
export function GrnLineRow({ line, onChange, onRemove }: GrnLineRowProps): React.JSX.Element {
  const isPlanned = line.purchaseOrderLineId !== null;
  const receivingNowError = validateReceivingNow(line);

  return (
    <TableRow zebra={false} hover="neutral">
      <TableCell className="py-2 align-top">{line.itemLabel}</TableCell>
      <TableCell className="py-2 text-right align-top">
        {isPlanned ? <QuantityDisplay quantityMilli={line.orderedMilli} /> : '—'}
      </TableCell>
      <TableCell className="py-2 text-right align-top">
        {isPlanned ? <QuantityDisplay quantityMilli={line.alreadyReceivedMilli} /> : '—'}
      </TableCell>
      <TableCell className="py-2 align-top">
        <TextInput
          variant="number"
          align="right"
          value={line.receivingNowInput}
          onChange={(e) => {
            onChange({ receivingNowInput: e.target.value });
          }}
        />
        {receivingNowError && <p className="mt-1 text-xs text-danger">{receivingNowError}</p>}
      </TableCell>
      <TableCell className="py-2 align-top">
        <TextInput
          variant="number"
          align="right"
          placeholder="Rs"
          value={line.unitCostInput}
          onChange={(e) => {
            onChange({ unitCostInput: e.target.value });
          }}
        />
      </TableCell>
      <TableCell className="py-2 align-top">
        <TextInput
          variant="number"
          align="right"
          placeholder="Rs"
          value={line.sellingPriceInput}
          onChange={(e) => {
            onChange({ sellingPriceInput: e.target.value });
          }}
        />
      </TableCell>
      <TableCell className="py-2 align-top">
        <TextInput
          variant="number"
          align="right"
          placeholder="Rs (optional)"
          value={line.wholesalePriceInput}
          onChange={(e) => {
            onChange({ wholesalePriceInput: e.target.value });
          }}
        />
      </TableCell>
      <TableCell className="py-2 align-top">
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${line.itemLabel}`}
            onClick={onRemove}
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
        )}
      </TableCell>
    </TableRow>
  );
}
