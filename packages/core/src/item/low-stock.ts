/**
 * P17-2 (docs/phases/PHASE_17.md §2.2, S17-ITEM-1/2), extended by P17-2b
 * (§9, Q17-7 ANSWERED). Pure predicate — no DB, no React. Replaces the
 * old `isLowStock: boolean` with a 4-state taxonomy so "never received"
 * (`not_stocked`) is distinguishable from "received, now at/under
 * zero" (`out`) — a real distinction the owner cares about (nothing to
 * reorder vs. something to reorder for the first time) that a single
 * boolean collapsed.
 *
 * Rules (Q17-7, ANSWERED):
 * - 'out':         has stock history, counterStockMilli <= 0 (includes negative).
 * - 'low':         counterStockMilli > 0 AND <= reorderLevel (or <= the
 *                  shop default when reorderLevel is null).
 * - 'not_stocked': counterStockMilli IS NULL (no stock_movement rows
 *                  ever) AND reorderLevel IS NOT NULL.
 * - null:          no history AND no reorder level; OR trackStock=false;
 *                  OR deleted (excluded upstream — item.repository.ts's
 *                  queries already filter deletedAt IS NULL, never
 *                  reaches this function).
 */
export type StockAlert = 'out' | 'low' | 'not_stocked' | null;

export function computeStockAlert(
  trackStock: boolean,
  counterStockMilli: number | null,
  reorderLevelMilli: number | null,
  defaultThresholdMilli: number,
): StockAlert {
  if (!trackStock) return null;

  if (counterStockMilli === null) {
    return reorderLevelMilli !== null ? 'not_stocked' : null;
  }

  if (counterStockMilli <= 0) return 'out';

  const thresholdMilli = reorderLevelMilli ?? defaultThresholdMilli;
  return counterStockMilli <= thresholdMilli ? 'low' : null;
}
