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
 */
export function resolveStockBadge(
  stockOnHandMilli: number | null,
  trackStock: boolean,
): ResolvedStockBadge | null {
  if (!trackStock || stockOnHandMilli === null) return null;
  const units = Math.floor(stockOnHandMilli / 1000);
  if (units <= 0) return { label: 'Out of stock', className: 'text-danger' };
  if (stockOnHandMilli <= 5000)
    return { label: `Low: ${String(units)}`, className: 'text-warning' };
  return { label: `${String(units)} in stock`, className: 'text-success' };
}
