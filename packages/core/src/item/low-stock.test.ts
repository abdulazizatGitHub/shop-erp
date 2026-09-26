import { describe, expect, it } from 'vitest';
import { isLowStock } from './low-stock.js';

// P17-2 (docs/phases/PHASE_17.md §2.2/§8).
describe('isLowStock', () => {
  it("flagged when counterStockMilli <= the item's own reorderLevelMilli", () => {
    // 5 on hand, reorder at 5 -> flagged (<=, not <)
    expect(isLowStock(true, 5000, 5000, 0)).toBe(true);
    // 6 on hand, reorder at 5 -> not flagged
    expect(isLowStock(true, 6000, 5000, 0)).toBe(false);
  });

  it('falls back to the shop-wide default threshold when reorderLevelMilli is null', () => {
    // No per-item threshold set; shop default is 3 (3000 milli).
    expect(isLowStock(true, 3000, null, 3000)).toBe(true);
    expect(isLowStock(true, 4000, null, 3000)).toBe(false);
  });

  it('an item with counterStockMilli = 0 is flagged under the default shop threshold of 0 (out of stock)', () => {
    expect(isLowStock(true, 0, null, 0)).toBe(true);
  });

  it('trackStock=false is never flagged, regardless of quantity (A17-2 exclusion)', () => {
    expect(isLowStock(false, 0, null, 0)).toBe(false);
    expect(isLowStock(false, 0, 5000, 100000)).toBe(false);
  });

  it('counterStockMilli=null (never moved anywhere) is never flagged — distinct from a confirmed 0 (A17-2 exclusion)', () => {
    expect(isLowStock(true, null, 5000, 0)).toBe(false);
  });

  it('the custody scenario: 0 at the Shop counter (5 with a technician) reads as a real 0 and IS flagged — matches P17-1 D17-3', () => {
    // counterStockMilli=0 here is what item.repository.ts computes for
    // "moved somewhere, but zero rows at the Shop warehouse specifically"
    // — never null in that case (see item.repository.test.ts's custody test).
    expect(isLowStock(true, 0, null, 0)).toBe(true);
  });
});
