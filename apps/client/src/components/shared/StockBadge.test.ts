import { describe, expect, it } from 'vitest';
import { resolveStockBadge } from './StockBadge.js';

// P17-2 review fix (docs/phases/PHASE_17.md §8): resolveStockBadge no
// longer re-derives the low-stock rule — it only renders the
// server-computed `isLowStock` boolean plus counterStockMilli/trackStock
// for display formatting.
describe('resolveStockBadge', () => {
  it('returns null for a non-tracked item, or a never-moved (null) item', () => {
    expect(resolveStockBadge(5000, false, false)).toBeNull();
    expect(resolveStockBadge(null, true, false)).toBeNull();
  });

  it('"Out of stock" when counterStockMilli is 0 or negative, regardless of isLowStock', () => {
    expect(resolveStockBadge(0, true, true)?.label).toBe('Out of stock');
    expect(resolveStockBadge(-1000, true, true)?.label).toBe('Out of stock');
  });

  it('"Low: N" when isLowStock is true and stock is above zero', () => {
    const badge = resolveStockBadge(5000, true, true);
    expect(badge?.label).toBe('Low: 5');
    expect(badge?.className).toBe('text-warning');
  });

  it('"N in stock" when isLowStock is false', () => {
    const badge = resolveStockBadge(10000, true, false);
    expect(badge?.label).toBe('10 in stock');
    expect(badge?.className).toBe('text-success');
  });
});
