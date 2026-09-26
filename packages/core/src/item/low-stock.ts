/**
 * P17-2 (docs/phases/PHASE_17.md §2.2, S17-ITEM-1/2). Pure predicate —
 * no DB, no React. Flagged when counterStockMilli <= (item's own
 * reorderLevelMilli, or the shop-wide default when null).
 *
 * Exclusions (A17-2, binding):
 * - trackStock=false items are never flagged.
 * - counterStockMilli === null (the item has never moved at all,
 *   anywhere — not merely "zero at the counter") is never flagged,
 *   matching resolveStockBadge's own null convention (no data yet, not
 *   a confirmed zero). A confirmed zero at the counter (e.g. everything
 *   is out in technician custody) reads as a real 0, per the P17-1
 *   custody-test precedent, and IS flagged.
 * - Deleted items are excluded upstream (item.repository.ts's queries
 *   already filter deletedAt IS NULL) — never reach this function.
 */
export function isLowStock(
  trackStock: boolean,
  counterStockMilli: number | null,
  reorderLevelMilli: number | null,
  defaultThresholdMilli: number,
): boolean {
  if (!trackStock) return false;
  if (counterStockMilli === null) return false;
  const thresholdMilli = reorderLevelMilli ?? defaultThresholdMilli;
  return counterStockMilli <= thresholdMilli;
}
