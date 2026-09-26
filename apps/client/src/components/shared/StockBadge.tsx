export interface ResolvedStockBadge {
  readonly label: string;
  readonly className: string;
}

/**
 * Stock badge thresholds — Math.floor to whole units, no decimal display.
 * Extracted from ItemProductCard.tsx's stockBadge() (I-4, Items redesign
 * session) once a second consumer (the Items table) needed the same
 * logic. Text-color-only by design (no background) — QuantityDisplay
 * (packages/ui) hardcodes its own text-ink class, so a colored pill
 * can't recolor the number; a plain colored label is what both
 * consumers actually render.
 *
 * P17-2 (docs/phases/PHASE_17.md §2.2, S17-ITEM-1): the "Low" threshold
 * used to be a hardcoded 5 units for every item. It is now
 * `reorderLevelMilli` (the item's own owner-set threshold) falling back
 * to `defaultThresholdMilli` (the shop-wide Settings value) when null —
 * both callers (ItemProductCard.tsx, ItemsPage.tsx) must pass the item's
 * `counterStockMilli` (never `stockOnHandMilli` — see PHASE_17.md §2.1
 * D17-3) and the item's own `reorderLevelMilli`.
 */
export function resolveStockBadge(
  counterStockMilli: number | null,
  trackStock: boolean,
  reorderLevelMilli: number | null,
  defaultThresholdMilli: number,
): ResolvedStockBadge | null {
  if (!trackStock || counterStockMilli === null) return null;
  const units = Math.floor(counterStockMilli / 1000);
  if (units <= 0) return { label: 'Out of stock', className: 'text-danger' };
  const thresholdMilli = reorderLevelMilli ?? defaultThresholdMilli;
  if (counterStockMilli <= thresholdMilli)
    return { label: `Low: ${String(units)}`, className: 'text-warning' };
  return { label: `${String(units)} in stock`, className: 'text-success' };
}

/**
 * P17-2. The plain boolean this badge's "Low"/"Out of stock" cases both
 * represent — used by ItemsPage's low-stock filter toggle and by the
 * Dashboard widget's own independent fetch (LowStockWidget.tsx doesn't
 * call this directly since it needs a shop-wide count from the server,
 * not a per-item check, but the two must never disagree — see
 * item.handler.ts's runLowStockCount, which uses the equivalent core
 * predicate, `@shop/core`'s `isLowStock`, deliberately kept as a
 * separate implementation since apps/client may never import
 * `@shop/core` — lint-enforced, eslint.config.js).
 */
export function isLowStock(
  counterStockMilli: number | null,
  trackStock: boolean,
  reorderLevelMilli: number | null,
  defaultThresholdMilli: number,
): boolean {
  if (!trackStock || counterStockMilli === null) return false;
  const thresholdMilli = reorderLevelMilli ?? defaultThresholdMilli;
  return counterStockMilli <= thresholdMilli;
}
