import { describe, expect, it } from 'vitest';
import { isLowStock, resolveStockBadge } from './StockBadge.js';

// P17-2 (docs/phases/PHASE_17.md §2.2/§8) — the threshold used to be a
// hardcoded 5 units; both are now reorderLevelMilli (falling back to
// defaultThresholdMilli when null).
describe('resolveStockBadge', () => {
  it('returns null for a non-tracked item, or a never-moved (null) item', () => {
    expect(resolveStockBadge(5000, false, null, 0)).toBeNull();
    expect(resolveStockBadge(null, true, null, 0)).toBeNull();
  });

  it('"Out of stock" when counterStockMilli is 0 or negative', () => {
    expect(resolveStockBadge(0, true, null, 0)?.label).toBe('Out of stock');
    expect(resolveStockBadge(-1000, true, null, 0)?.label).toBe('Out of stock');
  });

  it('"Low: N" when at or below the item\'s own reorderLevelMilli', () => {
    const badge = resolveStockBadge(5000, true, 5000, 0);
    expect(badge?.label).toBe('Low: 5');
    expect(badge?.className).toBe('text-warning');
  });

  it('falls back to the shop-wide default threshold when reorderLevelMilli is null', () => {
    expect(resolveStockBadge(3000, true, null, 3000)?.label).toBe('Low: 3');
    expect(resolveStockBadge(4000, true, null, 3000)?.label).toBe('4 in stock');
  });

  it('"N in stock" above the threshold', () => {
    const badge = resolveStockBadge(10000, true, 5000, 0);
    expect(badge?.label).toBe('10 in stock');
    expect(badge?.className).toBe('text-success');
  });
});

describe('isLowStock (client)', () => {
  it("matches the same exclusions as @shop/core's isLowStock (trackStock=false, null counterStockMilli)", () => {
    expect(isLowStock(0, false, null, 0)).toBe(false);
    expect(isLowStock(null, true, 5000, 0)).toBe(false);
  });

  it('the custody scenario: counterStockMilli=0 is flagged under the default threshold', () => {
    expect(isLowStock(0, true, null, 0)).toBe(true);
  });
});
