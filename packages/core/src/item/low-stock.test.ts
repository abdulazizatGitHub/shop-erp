import { describe, expect, it } from 'vitest';
import { computeStockAlert } from './low-stock.js';

// P17-2 (docs/phases/PHASE_17.md §2.2/§8), extended by P17-2b (§9, Q17-7
// ANSWERED). Same scenarios the old isLowStock test file covered, now
// asserting the 4-state result; 'not_stocked' is new.
describe('computeStockAlert', () => {
  it("'low' when counterStockMilli <= the item's own reorderLevelMilli, above zero", () => {
    // 5 on hand, reorder at 5 -> 'low' (<=, not <)
    expect(computeStockAlert(true, 5000, 5000, 0)).toBe('low');
    // 6 on hand, reorder at 5 -> not flagged
    expect(computeStockAlert(true, 6000, 5000, 0)).toBeNull();
  });

  it('falls back to the shop-wide default threshold when reorderLevelMilli is null', () => {
    // No per-item threshold set; shop default is 3 (3000 milli).
    expect(computeStockAlert(true, 3000, null, 3000)).toBe('low');
    expect(computeStockAlert(true, 4000, null, 3000)).toBeNull();
  });

  it("'out' when counterStockMilli is 0 or negative — distinct from 'low', regardless of threshold", () => {
    expect(computeStockAlert(true, 0, null, 0)).toBe('out');
    expect(computeStockAlert(true, 0, 5000, 100000)).toBe('out');
    expect(computeStockAlert(true, -1000, null, 0)).toBe('out');
  });

  it('trackStock=false is never flagged, regardless of quantity (A17-2 exclusion)', () => {
    expect(computeStockAlert(false, 0, null, 0)).toBeNull();
    expect(computeStockAlert(false, 0, 5000, 100000)).toBeNull();
    expect(computeStockAlert(false, null, 5000, 0)).toBeNull();
  });

  it("'not_stocked' when counterStockMilli is null (never moved anywhere) AND a reorder level is set (P17-2b, Q17-7)", () => {
    expect(computeStockAlert(true, null, 5000, 0)).toBe('not_stocked');
  });

  it('null when counterStockMilli is null AND no reorder level is set — distinct from not_stocked (P17-2b)', () => {
    expect(computeStockAlert(true, null, null, 0)).toBeNull();
  });

  it('the custody scenario: 0 at the Shop counter (5 with a technician) reads as a real 0 and is "out" — matches P17-1 D17-3', () => {
    // counterStockMilli=0 here is what item.repository.ts computes for
    // "moved somewhere, but zero rows at the Shop warehouse specifically"
    // — never null in that case (see item.repository.test.ts's custody test).
    expect(computeStockAlert(true, 0, null, 0)).toBe('out');
  });
});
