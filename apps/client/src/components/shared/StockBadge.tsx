import type { ItemDto } from '@shop/contracts';

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
 * client-side (a duplicate of `@shop/core`'s rule, required only
 * because `apps/client` may never import `@shop/core` — lint-enforced).
 * That duplicate is gone. The alert state now arrives as `ItemDto`'s
 * `stockAlert` field, computed once server-side (`item.repository.ts`,
 * using `@shop/core`'s `computeStockAlert`) — this function only
 * renders it: the threshold comparison itself never happens here.
 * `counterStockMilli` is used solely for the displayed unit count and
 * the "exactly 0" distinction between "Out of stock" and "Low: N"
 * (P17-1 D17-3: never `stockOnHandMilli`).
 *
 * P17-2b (docs/phases/PHASE_17.md §9, Q17-7 ANSWERED) extends this with
 * a fourth, grey state: `stockAlert === 'not_stocked'` — an item that
 * has never been received at all (no stock_movement row ever) but does
 * have a reorder level set, so it's worth flagging as "never received"
 * rather than showing no badge at all. This is the one case where
 * `counterStockMilli === null` still produces a badge; every other
 * null-counterStockMilli case (not tracked, or genuinely no data and no
 * threshold) still shows nothing, exactly as before.
 */
export function resolveStockBadge(
  counterStockMilli: number | null,
  trackStock: boolean,
  stockAlert: ItemDto['stockAlert'],
): ResolvedStockBadge | null {
  if (!trackStock) return null;
  if (counterStockMilli === null) {
    if (stockAlert === 'not_stocked') {
      return { label: 'Not stocked yet', className: 'text-ink-faint' };
    }
    return null;
  }
  const units = Math.floor(counterStockMilli / 1000);
  if (units <= 0) return { label: 'Out of stock', className: 'text-danger' };
  if (stockAlert === 'low') return { label: `Low: ${String(units)}`, className: 'text-warning' };
  return { label: `${String(units)} in stock`, className: 'text-success' };
}
