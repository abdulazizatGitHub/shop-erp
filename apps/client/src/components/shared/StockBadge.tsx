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
 * P17-2 review fix: this used to re-derive the low/out-of-stock rule
 * client-side (a duplicate of `@shop/core`'s `isLowStock`, required only
 * because `apps/client` may never import `@shop/core` — lint-enforced).
 * That duplicate is gone. `isLowStock` now arrives as a plain boolean on
 * `ItemDto`, computed once server-side (`item.repository.ts`, using
 * `@shop/core`'s `isLowStock`) — this function only renders it: the
 * threshold comparison itself never happens here. `counterStockMilli` is
 * used solely for the displayed unit count and the "exactly 0" distinction
 * between "Out of stock" and "Low: N" (P17-1 D17-3: never
 * `stockOnHandMilli`).
 */
export function resolveStockBadge(
  counterStockMilli: number | null,
  trackStock: boolean,
  isLowStock: boolean,
): ResolvedStockBadge | null {
  if (!trackStock || counterStockMilli === null) return null;
  const units = Math.floor(counterStockMilli / 1000);
  if (units <= 0) return { label: 'Out of stock', className: 'text-danger' };
  if (isLowStock) return { label: `Low: ${String(units)}`, className: 'text-warning' };
  return { label: `${String(units)} in stock`, className: 'text-success' };
}
