import { colors } from '@shop/ui';
import { describe, expect, it } from 'vitest';
import { buildRevenueMarginSlices } from './RevenueMarginDonut.js';

describe('buildRevenueMarginSlices (P12-5)', () => {
  it('returns both slices with Rs-formatted labels when both values are positive', () => {
    const slices = buildRevenueMarginSlices(300_000, 500_000);
    expect(slices).toEqual([
      { name: 'Direct Margin (Rs 3,000)', amountRupees: 3000, fill: colors.success.default },
      { name: 'COGS (Rs 5,000)', amountRupees: 5000, fill: colors.warning.default },
    ]);
  });

  it('returns only the Direct Margin slice when COGS is zero', () => {
    const slices = buildRevenueMarginSlices(100_000, 0);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.name).toBe('Direct Margin (Rs 1,000)');
  });

  it('returns only the COGS slice when Direct Margin is zero', () => {
    const slices = buildRevenueMarginSlices(0, 100_000);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.name).toBe('COGS (Rs 1,000)');
  });

  it('returns no slices when both are zero', () => {
    expect(buildRevenueMarginSlices(0, 0)).toEqual([]);
  });
});
