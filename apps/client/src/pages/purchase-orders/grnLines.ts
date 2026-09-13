import { Qty } from '@shop/shared';

export interface GrnLineEntry {
  /** null = unplanned receipt, not linked to any purchase order line. */
  readonly purchaseOrderLineId: string | null;
  readonly itemId: string;
  readonly itemLabel: string;
  readonly unitLabel: string;
  readonly orderedMilli: number;
  readonly alreadyReceivedMilli: number;
  readonly receivingNowInput: string;
  readonly unitCostInput: string;
  readonly sellingPriceInput: string;
  readonly wholesalePriceInput: string;
}

/** Remaining quantity a PO-linked line can still receive. null for an unplanned line — no upper bound. */
export function remainingMilli(line: GrnLineEntry): number | null {
  if (line.purchaseOrderLineId === null) return null;
  return line.orderedMilli - line.alreadyReceivedMilli;
}

/**
 * Single source of truth for the "receiving now" cap — used both for the
 * inline field error (as the user types) and the submit-handler's
 * defensive re-check, per the binding instruction that both must exist.
 * Returns null when the line is valid.
 */
export function validateReceivingNow(line: GrnLineEntry): string | null {
  let receivingNowMilli: number;
  try {
    receivingNowMilli = Qty.fromUnits(line.receivingNowInput || '0');
  } catch {
    return 'Not a valid quantity';
  }
  if (receivingNowMilli < 0) return 'Quantity cannot be negative';
  const remaining = remainingMilli(line);
  if (remaining !== null && receivingNowMilli > remaining) {
    return `Cannot exceed remaining quantity (${Qty.format(Qty.of(remaining), { unit: line.unitLabel })})`;
  }
  return null;
}
