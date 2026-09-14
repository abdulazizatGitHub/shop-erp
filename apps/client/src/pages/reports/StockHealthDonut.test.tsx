// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StockValuationLineDto } from '@shop/contracts';
import { colors } from '@shop/ui';
import { computeStockHealthSlices, StockHealthDonut } from './StockHealthDonut.js';

afterEach(() => {
  cleanup();
});

function line(itemId: string, quantityOnHandMilli: number): StockValuationLineDto {
  return {
    itemId,
    itemName: itemId,
    stockUomName: 'pcs',
    quantityOnHandMilli,
    lastPurchaseCostPaisa: 0,
    valuationPaisa: 0,
  };
}

/**
 * P12-1 — recharts' <ResponsiveContainer> reports zero width under jsdom
 * (confirmed: no chart component anywhere in reports/ has a render test),
 * so the bucketing logic is tested directly as a pure function instead of
 * through a full component render.
 */
describe('computeStockHealthSlices (P12-1)', () => {
  it('counts negative and zero quantities into Out, never drops a line, buckets sum to total', () => {
    const slices = computeStockHealthSlices([
      line('a', 500),
      line('b', 0),
      line('c', -80),
      line('d', -1_000_004),
      line('e', 250),
    ]);

    expect(slices).toEqual([
      { name: 'In Stock (2)', count: 2, fill: colors.money.in },
      { name: 'Out (3)', count: 3, fill: colors.money.due },
    ]);
    expect(slices.reduce((sum, s) => sum + s.count, 0)).toBe(5);
  });

  it('returns only the In Stock slice when every item is in stock', () => {
    const slices = computeStockHealthSlices([line('a', 100), line('b', 5)]);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.name).toBe('In Stock (2)');
  });

  it('returns only the Out slice when every item is out, including negative-only data', () => {
    const slices = computeStockHealthSlices([line('a', -80), line('b', -1_000_004)]);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.name).toBe('Out (2)');
  });

  it('returns no slices for an empty line array', () => {
    expect(computeStockHealthSlices([])).toEqual([]);
  });
});

describe('StockHealthDonut (P12-1)', () => {
  it('shows the empty-period message when there are no lines at all, without touching recharts', () => {
    render(<StockHealthDonut lines={[]} />);
    expect(screen.getByText('No data for this period.')).toBeTruthy();
  });
});
