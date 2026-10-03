import { describe, expect, it } from 'vitest';
import { resolveStockBadge } from './StockBadge.js';

// P17-2 review fix (docs/phases/PHASE_17.md §8): resolveStockBadge no
// longer re-derives the low-stock rule — it only renders the
// server-computed `stockAlert` field plus counterStockMilli/trackStock
// for display formatting. Extended by P17-2b (§9, Q17-7 ANSWERED) with
// the grey 'not_stocked' state.
describe('resolveStockBadge', () => {
  it('returns null for a non-tracked item, or a never-moved (null) item with no alert', () => {
    expect(resolveStockBadge(5000, false, null)).toBeNull();
    expect(resolveStockBadge(null, true, null)).toBeNull();
  });

  it('"Out of stock" when counterStockMilli is 0 or negative, regardless of stockAlert', () => {
    expect(resolveStockBadge(0, true, 'low')).toBeTruthy();
    expect(resolveStockBadge(0, true, 'low')?.label).toBe('Out of stock');
    expect(resolveStockBadge(-1000, true, 'out')?.label).toBe('Out of stock');
  });

  it("'Low: N' when stockAlert is 'low' and stock is above zero", () => {
    const badge = resolveStockBadge(5000, true, 'low');
    expect(badge?.label).toBe('Low: 5');
    expect(badge?.className).toBe('text-warning');
  });

  it("'N in stock' when stockAlert is null and stock is above zero", () => {
    const badge = resolveStockBadge(10000, true, null);
    expect(badge?.label).toBe('10 in stock');
    expect(badge?.className).toBe('text-success');
  });

  it("P17-2b: grey 'Not stocked yet' badge when counterStockMilli is null AND stockAlert is 'not_stocked'", () => {
    const badge = resolveStockBadge(null, true, 'not_stocked');
    expect(badge?.label).toBe('Not stocked yet');
    expect(badge?.className).toBe('text-ink-faint');
  });

  it('P17-2b: still null (no badge) for a never-moved item with no reorder level, even though counterStockMilli is also null', () => {
    expect(resolveStockBadge(null, true, null)).toBeNull();
  });
});
